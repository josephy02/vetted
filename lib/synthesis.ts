import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { MediaResult } from "./exa";
import type { Finding, RiskMemo, Verification } from "./types";

const DEFAULT_MODEL = "claude-sonnet-5";

const memoSchema = z.object({
  findings: z
    .array(
      z.object({
        sourceId: z.string().describe("The id of the source this finding is drawn from, e.g. f3."),
        headline: z.string().describe("Short factual headline, under 90 characters."),
        summary: z
          .string()
          .describe("1-2 sentences stating only what the source's highlights say."),
        severity: z.enum(["high", "medium", "low", "informational"]),
        category: z.enum(["breach", "litigation", "regulatory", "executive", "other"]),
      }),
    )
    .describe("Only genuine adverse findings about this exact company. May be empty."),
  overallRationale: z
    .string()
    .describe("3-5 plain-language sentences an analyst could defend to an auditor. Cite findings inline as [f1]."),
  recommendation: z.enum(["proceed", "proceed_with_caution", "escalate_for_review"]),
});

const SYSTEM = `You are a vendor-risk analyst writing a research memo for a procurement or compliance team.

Rules:
- Use only the verification record and the numbered sources provided. Never add facts from memory.
- Every finding must come from exactly one provided source, referenced by its id. If a source is not
  about this specific company, or is not adverse (e.g. marketing, routine earnings, unrelated
  companies with similar names), leave it out.
- Merge near-duplicate coverage of the same event into one finding, using the most authoritative source.
- Severity: high = active breach, major enforcement, fraud, sanctions, or a failed entity status;
  medium = material litigation or regulatory scrutiny; low = minor or resolved matters;
  informational = context worth knowing but not a risk on its own.
- Zero adverse findings is a valid, good outcome. Say so plainly.
- Recommendation: escalate_for_review for any high-severity finding, a watchlist match, or an
  inactive/dissolved entity status; proceed_with_caution for medium findings or an unverified
  identity; otherwise proceed.
- This memo supports a human decision; it is not an approval.`;

export async function synthesizeMemo(input: {
  companyName: string;
  verification: Verification | null;
  sources: MediaResult[] | null;
}): Promise<{ findings: Finding[]; riskMemo: RiskMemo }> {
  const { companyName, verification, sources } = input;

  const prompt = [
    `Company screened: ${companyName}`,
    "",
    "VERIFICATION RECORD (Baselayer KYB):",
    verification ? JSON.stringify(verification, null, 2) : "Unavailable: the verification step failed.",
    "",
    "ADVERSE-MEDIA SOURCES:",
    sources === null
      ? "Unavailable: the adverse-media search failed."
      : sources.length === 0
        ? "The search returned no results."
        : sources
            .map(
              (s) =>
                `[${s.id}] ${s.title}\nURL: ${s.url}\nPublished: ${s.publishedDate ?? "unknown"}\n` +
                s.highlights.map((h) => `> ${h}`).join("\n"),
            )
            .join("\n\n"),
  ].join("\n");

  const { output } = await generateText({
    model: anthropic(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL),
    system: SYSTEM,
    prompt,
    output: Output.object({ schema: memoSchema }),
  });

  // Enforce traceability: drop any finding that doesn't map to a real source.
  const byId = new Map((sources ?? []).map((s) => [s.id, s]));
  const findings: Finding[] = output.findings.flatMap((f) => {
    const src = byId.get(f.sourceId);
    if (!src) return [];
    return [
      {
        id: src.id,
        headline: f.headline,
        summary: f.summary,
        url: src.url,
        publishedDate: src.publishedDate,
        severity: f.severity,
        category: f.category,
      },
    ];
  });

  return {
    findings,
    riskMemo: { overallRationale: output.overallRationale, recommendation: output.recommendation },
  };
}
