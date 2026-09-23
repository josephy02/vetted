import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  buildCorroboration,
  renumberCitations,
  traceFindings,
  type ModelCorroboration,
  type ModelFinding,
} from "./analysis";
import type {
  CorroborationCheck,
  Finding,
  FootprintContext,
  RiskMemo,
  Source,
  Verification,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-5";

// Sonnet 5 thinks at effort "high" by default, which took ~35s here. This memo runs
// behind a live on-screen timer, so trade depth for latency.
const EFFORT = "low";

const analysisSchema = z.object({
  findings: z
    .array(
      z.object({
        sourceId: z.string().describe("The id of the source this finding is drawn from, e.g. s3."),
        headline: z.string().describe("Short factual headline, under 90 characters."),
        summary: z
          .string()
          .describe(
            "1-2 sentences stating only what the source's highlights say, phrased as reported.",
          ),
        severity: z.enum(["high", "medium", "low", "informational"]),
        category: z.enum(["breach", "litigation", "regulatory", "executive", "other"]),
      }),
    )
    .describe("Only genuine adverse findings about this exact company. May be empty."),
  corroboration: z
    .array(
      z.object({
        claim: z
          .string()
          .describe(
            "The company's own claim as the company states it, e.g. 'Founded in 2023'. " +
              "Do not fold registry values into it.",
          ),
        selfSourceId: z
          .string()
          .nullable()
          .describe("Id of the self-published source where the company makes this claim."),
        registryValue: z
          .string()
          .nullable()
          .describe("What the registry record says about this claim, or null if it is silent."),
        registryAgrees: z
          .boolean()
          .nullable()
          .describe(
            "true if the registry value confirms the claim, false if it makes the claim " +
              "impossible, null if the registry is silent. A legal entity formed later than the " +
              "company's stated heritage (a spin-off or reincorporation) does not make it false.",
          ),
        independentSupportIds: z
          .array(z.string())
          .describe("Ids of independent sources that agree. Empty is normal and fine."),
        independentConflictIds: z
          .array(z.string())
          .describe(
            "Ids of independent sources whose statement makes the claim impossible. Leave empty " +
              "when a source is older than the claim, describes a predecessor or former state " +
              "(previous HQ, previous CEO, parent-company history), or is merely less specific. " +
              "If you would call the difference minor or explainable, it is not a conflict.",
          ),
      }),
    )
    .max(5)
    .describe(
      "Empty when there are no self-published sources. Otherwise check these claims in this " +
        "order, skipping any the sources do not cover: legal name and " +
        "trading name; year founded or incorporated; headquarters location; named leadership; " +
        "what the company sells.",
    ),
  overallRationale: z
    .string()
    .describe(
      "3-5 plain-language sentences an analyst could defend to an auditor. Cite findings inline " +
        "as [s3] at the end of the statement they support, never as a word in the sentence; " +
        "brackets are only for source ids.",
    ),
  recommendation: z.enum(["proceed", "proceed_with_caution", "escalate_for_review"]),
});

const SYSTEM = `You are a vendor-risk analyst writing a research memo for a procurement or compliance team.

Evidence rules:
- Use only the verification record and the numbered sources provided. Never add facts from memory.
- Every finding must come from exactly one provided source, referenced by its id. If a source is not
  about this specific company, or is not adverse (e.g. marketing, routine earnings, unrelated
  companies with similar names), leave it out.
- Merge near-duplicate coverage of the same event into one finding, using the most authoritative source.
- Write about adverse items as reported: "Reuters reported that...", not "the company did...".

Provenance rules:
- Sources are grouped by who controls them. SELF-PUBLISHED sources are the company's own or paid
  distribution; they show only what the company CLAIMS, never that the claim is true.
- Never use a self-published source as evidence for a positive claim about the company's
  trustworthiness, security, scale or reputation.
- An adverse finding may come from a self-published source (e.g. the company's own breach notice).
  That is fine; label it by citing that source.
- Absence of independent coverage is INSUFFICIENT EVIDENCE. It is never evidence that the company is
  clean, and you must not describe it as clean.

Corroboration rules:
- Pull the claims from the self-published sources and check each against the registry record and the
  independent sources. Only list independent ids that genuinely address the same claim.
- A conflict means the two statements cannot both be true. Founding and incorporation dates routinely
  differ by months, a trade name differs from a legal name, and a source may be less specific than the
  claim: none of these is a conflict. Neither is an older source reporting a previous value (a former
  headquarters, a predecessor company's history) when a more recent source confirms the claim.
- If an independent source or the registry genuinely contradicts a company claim, you MUST say so
  explicitly in overallRationale.

Company-age rules:
- A limited independent record is normal for a young company. Describe it as "a limited independent
  record" and lean on the registry and the corroboration results.
- Youth or a thin record NEVER raises the risk level on its own, and NEVER justifies
  escalate_for_review by itself. Never call a company risky for being young.

Severity and recommendation:
- Severity: high = active breach, major enforcement, fraud, sanctions, or a failed entity status;
  medium = material litigation or regulatory scrutiny; low = minor or resolved matters;
  informational = context worth knowing but not a risk on its own.
- Zero adverse findings is a valid outcome. Say plainly that no adverse coverage was found, and say
  how much independent coverage existed to look through.
- Recommendation: escalate_for_review for any high-severity finding, a watchlist match, a conflict
  about identity (legal name, leadership or registration), or an inactive/dissolved entity status; proceed_with_caution for medium
  findings or an unverified identity; otherwise proceed.
- This memo supports a human decision; it is not an approval.
- Never write a source id except as an [sN] citation.`;

function renderSources(sources: Source[], heading: string, empty: string): string {
  if (sources.length === 0) return `${heading}\n${empty}`;
  return [
    heading,
    ...sources.map(
      (s) =>
        `[${s.id}] ${s.title ?? s.url}\nURL: ${s.url}\nPublished: ${s.publishedDate ?? "unknown"}\n` +
        (s.highlights ?? []).map((h) => `> ${h}`).join("\n"),
    ),
  ].join("\n\n");
}

export async function synthesizeMemo(input: {
  companyName: string;
  verification: Verification | null;
  sources: Source[];
  footprint: FootprintContext;
  searchFailed: boolean;
}): Promise<{ findings: Finding[]; corroboration: CorroborationCheck[]; riskMemo: RiskMemo }> {
  const { companyName, verification, sources, footprint, searchFailed } = input;

  const selfPublished = sources.filter((s) => s.provenance === "self_published");
  const independent = sources.filter((s) => s.provenance === "independent");

  const prompt = [
    `Company screened: ${companyName}`,
    "",
    "VERIFICATION RECORD (Baselayer KYB):",
    verification
      ? JSON.stringify(verification, null, 2)
      : "Unavailable: the verification step failed.",
    "",
    "FOOTPRINT CONTEXT (how much evidence exists, not what it says):",
    JSON.stringify(footprint, null, 2),
    "",
    renderSources(
      selfPublished,
      "SELF-PUBLISHED SOURCES (the company's own pages and paid distribution — claims only):",
      "None retrieved.",
    ),
    "",
    renderSources(
      independent,
      "INDEPENDENT SOURCES (third parties the company does not control):",
      searchFailed
        ? "Unavailable: the independent search failed. Treat this as insufficient evidence."
        : "None retrieved. Treat this as insufficient evidence, not as a clean record.",
    ),
  ].join("\n");

  const { output } = await generateText({
    model: anthropic(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL),
    system: SYSTEM,
    prompt,
    output: Output.object({ schema: analysisSchema }),
    providerOptions: { anthropic: { effort: EFFORT } },
  });

  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const { findings, renumber } = traceFindings(output.findings as ModelFinding[], sourcesById);
  const corroboration = buildCorroboration(
    output.corroboration as ModelCorroboration[],
    sourcesById,
  );

  return {
    findings,
    corroboration,
    riskMemo: {
      overallRationale: renumberCitations(output.overallRationale, renumber),
      recommendation: output.recommendation,
    },
  };
}
