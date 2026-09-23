import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { RetrievedSource } from "./exa";
import { classifyByRule } from "./provenance";
import type { Provenance, Source } from "./types";

const FAST_MODEL = "claude-haiku-4-5-20251001";

const schema = z.object({
  verdicts: z.array(
    z.object({
      url: z.string(),
      provenance: z.enum(["self_published", "independent"]),
    }),
  ),
});

// One batched call for every URL the rules could not decide. URLs the model
// omits are left for the caller to default.
export async function classifyByModel(
  urls: string[],
  companyName: string,
  companyDomain?: string,
): Promise<Map<string, Provenance>> {
  if (urls.length === 0) return new Map();

  const { output } = await generateText({
    model: anthropic(process.env.ANTHROPIC_FAST_MODEL || FAST_MODEL),
    system:
      "You label web sources by who controls them, for a vendor-risk brief.\n" +
      "self_published: the company itself controls or paid to distribute it: its own site or " +
      "subdomains, its official social or developer profiles, press-release wires, sponsored " +
      "posts, and listing pages the company writes its own copy for.\n" +
      "independent: a third party the company does not control: news outlets, trade press, " +
      "court records, regulators, government sites, independent reviews and analyst coverage.\n" +
      "On social platforms (LinkedIn, X, YouTube and the like) the author controls the page: it is " +
      "self_published only if the account is the company's own; a post, article or profile by " +
      "anyone else, including an employee, is independent.\n" +
      "Judge by who controls the page, not whether the content is positive. When unsure, answer " +
      "independent only if a named third party is clearly the publisher; otherwise self_published.",
    prompt:
      `Company: ${companyName}${companyDomain ? ` (${companyDomain})` : ""}\n\n` +
      `Label each URL:\n${urls.map((u) => `- ${u}`).join("\n")}`,
    output: Output.object({ schema }),
  });

  return new Map(output.verdicts.map((v) => [v.url, v.provenance]));
}

// Dedupes by URL, classifies by rule, sends only the leftovers to the model, and
// falls back to the retrieval bucket (which includeDomains/excludeDomains already
// decided) if the model call fails or omits a URL.
export async function assembleSources(input: {
  companyName: string;
  domain?: string;
  selfPublished: RetrievedSource[];
  independent: RetrievedSource[];
}): Promise<Source[]> {
  const byUrl = new Map<string, { r: RetrievedSource; bucket: Provenance }>();
  const add = (items: RetrievedSource[], bucket: Provenance) => {
    for (const r of items) {
      const existing = byUrl.get(r.url);
      if (!existing || r.highlights.length > existing.r.highlights.length) {
        byUrl.set(r.url, { r, bucket: existing?.bucket ?? bucket });
      }
    }
  };
  add(input.selfPublished, "self_published");
  add(input.independent, "independent");

  const entries = [...byUrl.values()].map((e) => ({
    ...e,
    rule: classifyByRule(e.r.url, input.domain),
  }));
  const undecided = entries.filter((e) => !e.rule).map((e) => e.r.url);
  const verdicts = await classifyByModel(undecided, input.companyName, input.domain).catch(
    () => new Map<string, Provenance>(),
  );

  return entries.map(({ r, bucket, rule }, i) => {
    const model = rule ? undefined : verdicts.get(r.url);
    return {
      id: `s${i + 1}`,
      url: r.url,
      title: r.title,
      publishedDate: r.publishedDate,
      provenance: rule?.provenance ?? model ?? bucket,
      // The retrieval bucket is itself deterministic, so a bucket fallback counts as a rule.
      classifiedBy: model ? "model" : "rule",
      highlights: r.highlights,
    };
  });
}
