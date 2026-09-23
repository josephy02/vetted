import type { MonitorHit } from "./types";

// Exa Monitors take no includeText or category, so a monitor for "Mercury" returns
// any recent lawsuit or breach story. Results are kept only if they name the company.

const LEGAL_SUFFIX = /[,\s]+(inc|incorporated|llc|l\.l\.c|corp|corporation|co|company|ltd|limited)\.?$/i;

function namePattern(companyName: string): RegExp {
  const words = companyName.trim().replace(LEGAL_SUFFIX, "").split(/\s+/);
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  // Whole word: no letter or digit directly before or after the name.
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

export function mentionsCompany(companyName: string, texts: string[]): boolean {
  const pattern = namePattern(companyName);
  return texts.some((t) => pattern.test(t));
}

// Maps raw monitor results to hits, keeping only those that name the company in the
// title or a highlight.
export function relevantHits(companyName: string, results: Record<string, unknown>[]): MonitorHit[] {
  return results.flatMap((r) => {
    const url = typeof r.url === "string" ? r.url : "";
    if (!url) return [];
    const title = typeof r.title === "string" && r.title ? r.title : undefined;
    const highlights = Array.isArray(r.highlights)
      ? r.highlights.filter((h): h is string => typeof h === "string")
      : [];
    if (!mentionsCompany(companyName, [title ?? "", ...highlights])) return [];
    return [
      {
        title: title ?? url,
        url,
        ...(typeof r.publishedDate === "string" ? { publishedDate: r.publishedDate } : {}),
      },
    ];
  });
}
