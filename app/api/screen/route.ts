import { computeFootprint } from "@/lib/analysis";
import { allow, cacheKey, getCached, setCached } from "@/lib/cache";
import { assembleSources } from "@/lib/classify";
import {
  resolvePrimaryDomain,
  searchIndependentAdverse,
  searchIndependentBackground,
  searchSelfPublished,
  verifyBusiness,
} from "@/lib/exa";
import { sameSite } from "@/lib/provenance";
import { clientId, parseScreenRequest } from "@/lib/request";
import { synthesizeMemo } from "@/lib/synthesis";
import type { ResolvedDomain, ScreenEvent, ScreenResponse, ScreenStep, Verification } from "@/lib/types";

export const maxDuration = 300;

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const start = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - start };
  } catch (error) {
    return { error, ms: Date.now() - start };
  }
}

// Logs the upstream error and returns a warning that is safe to show the client.
function failed(what: string, err: unknown): string {
  console.error(`${what} failed:`, err);
  return `${what} failed.`;
}

export async function POST(req: Request) {
  const parsed = parseScreenRequest(await req.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });

  const key = cacheKey([parsed.companyName, parsed.city, parsed.state, parsed.domain]);
  const cached = getCached<ScreenResponse>(key);

  if (!cached && !allow(clientId(req))) {
    return Response.json(
      { error: "Too many screenings in the last minute. Please wait and try again." },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ScreenEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        if (cached) {
          send({ type: "result", data: cached });
          return;
        }

        const started = Date.now();
        const warnings: string[] = [];

        // Runs a step and reports it to the client the moment it settles.
        const step = <T>(name: ScreenStep, fn: () => Promise<T>) =>
          timed(fn).then((r) => {
            send({ type: "step", step: name, status: r.error ? "error" : "done", ms: r.ms });
            return r;
          });

        // Baselayer is the long pole; all web research runs inside its window.
        const kybP = step("verification", () => verifyBusiness(parsed));

        const webP = timed(async () => {
          let domain = parsed.domain;
          let domainSource: ResolvedDomain["domainSource"] = domain ? "user" : "unknown";
          if (!domain) {
            domain = await resolvePrimaryDomain(parsed).catch((err) => {
              warnings.push(failed("Company domain lookup", err));
              return undefined;
            });
            if (domain) domainSource = "resolved";
          }

          const [self, independent] = await Promise.all([
            step("self_published", async () =>
              domain ? searchSelfPublished(parsed, domain) : [],
            ),
            step("independent", async () => {
              const [adverse, background] = await Promise.all([
                searchIndependentAdverse(parsed, domain),
                searchIndependentBackground(parsed, domain),
              ]);
              return [...adverse, ...background];
            }),
          ]);
          if (independent.error) {
            warnings.push(failed("Independent-coverage search", independent.error));
          }
          if (self.error) warnings.push(failed("Company-page search", self.error));

          const sources = await step("provenance", () =>
            assembleSources({
              companyName: parsed.companyName,
              domain,
              selfPublished: self.value ?? [],
              independent: independent.value ?? [],
            }),
          );
          if (sources.error) warnings.push(failed("Source labeling", sources.error));

          const resolvedDomain: ResolvedDomain = { ...(domain ? { domain } : {}), domainSource };
          return {
            resolvedDomain,
            sources: sources.value ?? [],
            independentFailed: !!independent.error,
          };
        });

        const [kyb, web] = await Promise.all([kybP, webP]);

        const verification: Verification = kyb.value ?? { verified: false, reason: "error" };
        if (kyb.error) warnings.push(failed("Identity verification", kyb.error));
        if (web.error) warnings.push(failed("Web research", web.error));

        // KYB finishes after web research, so an automatically found domain can be checked
        // against the registry's for free. A mismatch means sources may be mislabeled.
        const resolved = web.value?.resolvedDomain;
        if (
          resolved?.domainSource === "resolved" &&
          resolved.domain &&
          verification.verified &&
          verification.website &&
          !sameSite(resolved.domain, verification.website)
        ) {
          warnings.push(
            `The automatically found domain ${resolved.domain} differs from the registry's ` +
              `${verification.website}. Add the right domain and screen again.`,
          );
        }

        const searchFailed = !!web.error || !!web.value?.independentFailed;
        const sources = web.value?.sources ?? [];
        const footprint = computeFootprint({
          incorporationDate: verification.verified ? verification.incorporationDate : undefined,
          independentSources: sources.filter((s) => s.provenance === "independent"),
          searchFailed,
        });

        const synth = await step("synthesis", () =>
          synthesizeMemo({
            companyName: parsed.companyName,
            verification: kyb.error ? null : verification,
            sources,
            footprint,
            searchFailed,
          }),
        );
        if (synth.error) warnings.push(failed("Risk memo synthesis", synth.error));

        const result: ScreenResponse = {
          query: parsed,
          verification,
          resolvedDomain: web.value?.resolvedDomain ?? {
            ...(parsed.domain ? { domain: parsed.domain } : {}),
            domainSource: parsed.domain ? "user" : "unknown",
          },
          sources,
          corroboration: synth.value?.corroboration ?? [],
          footprint,
          findings: synth.value?.findings ?? [],
          riskMemo: synth.value?.riskMemo ?? {
            recommendation: "escalate_for_review",
            overallRationale:
              "The risk memo could not be generated, so this vendor has not been assessed. " +
              "Review the raw verification data and retry the screening.",
          },
          ...(warnings.length ? { warnings } : {}),
          timings: {
            verificationMs: kyb.ms,
            searchMs: web.ms,
            synthesisMs: synth.ms,
            totalMs: Date.now() - started,
          },
        };

        // Only cache complete screenings so a transient failure can be retried.
        if (!warnings.length) setCached(key, result);
        send({ type: "result", data: result });
      } catch (err) {
        console.error("Screening failed:", err);
        send({ type: "error", message: "Unexpected server error." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
