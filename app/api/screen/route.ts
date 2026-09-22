import { allow, cacheKey, getCached, setCached } from "@/lib/cache";
import { searchAdverseMedia, verifyBusiness, type MediaResult } from "@/lib/exa";
import { parseScreenRequest } from "@/lib/request";
import { synthesizeMemo } from "@/lib/synthesis";
import type { ScreenEvent, ScreenResponse, Verification } from "@/lib/types";

export const maxDuration = 300;

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const start = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - start };
  } catch (error) {
    return { error, ms: Date.now() - start };
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: Request) {
  const parsed = parseScreenRequest(await req.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });

  const key = cacheKey([parsed.companyName, parsed.city, parsed.state]);
  const cached = getCached<ScreenResponse>(key);

  const clientId = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!cached && !allow(clientId)) {
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

        const warnings: string[] = [];

        const [kyb, media] = await Promise.all([
          timed(() => verifyBusiness(parsed)).then((r) => {
            send({ type: "step", step: "verification", status: r.error ? "error" : "done", ms: r.ms });
            return r;
          }),
          timed(() => searchAdverseMedia(parsed)).then((r) => {
            send({ type: "step", step: "search", status: r.error ? "error" : "done", ms: r.ms });
            return r;
          }),
        ]);

        const verification: Verification = kyb.value ?? {
          verified: false,
          reason: "error",
          detail: message(kyb.error),
        };
        if (kyb.error) warnings.push(`Identity verification failed: ${message(kyb.error)}`);

        const sources: MediaResult[] | null = media.value ?? null;
        if (media.error) warnings.push(`Adverse-media search failed: ${message(media.error)}`);

        const synth = await timed(() =>
          synthesizeMemo({
            companyName: parsed.companyName,
            verification: kyb.error ? null : verification,
            sources,
          }),
        );
        send({ type: "step", step: "synthesis", status: synth.error ? "error" : "done", ms: synth.ms });
        if (synth.error) warnings.push(`Risk memo synthesis failed: ${message(synth.error)}`);

        const result: ScreenResponse = {
          query: parsed,
          verification,
          findings: synth.value?.findings ?? [],
          riskMemo: synth.value?.riskMemo ?? {
            recommendation: "escalate_for_review",
            overallRationale:
              "The risk memo could not be generated, so this vendor has not been assessed. " +
              "Review the raw verification data and retry the screening.",
          },
          ...(warnings.length ? { warnings } : {}),
          timings: { verificationMs: kyb.ms, searchMs: media.ms, synthesisMs: synth.ms },
        };

        // Only cache complete screenings so a transient failure can be retried.
        if (!warnings.length) setCached(key, result);
        send({ type: "result", data: result });
      } catch (err) {
        send({ type: "error", message: message(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
