import type {
  CorroborationCheck,
  CorroborationStatus,
  Finding,
  FindingCategory,
  FootprintContext,
  Severity,
  Source,
} from "./types";

// Placeholders per A4 — retune from the A9 dry run before the demo.
export const THIN_AGE_MONTHS = 24;
export const THIN_SOURCE_COUNT = 5;

function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return to.getUTCDate() < from.getUTCDate() ? months - 1 : months;
}

// How much evidence exists, stated separately from what the evidence says.
export function computeFootprint(input: {
  incorporationDate?: string;
  independentSources: { publishedDate?: string }[];
  // When the independent search failed, a low source count says nothing about the vendor.
  searchFailed?: boolean;
  now?: Date;
}): FootprintContext {
  const now = input.now ?? new Date();

  let ageMonths: number | undefined;
  if (input.incorporationDate) {
    const d = new Date(input.incorporationDate);
    if (!Number.isNaN(d.getTime()) && d <= now) ageMonths = monthsBetween(d, now);
  }

  const dates = input.independentSources
    .map((s) => s.publishedDate)
    .filter((d): d is string => !!d)
    .sort();

  const independentSourceCount = input.independentSources.length;

  return {
    ...(input.incorporationDate ? { incorporationDate: input.incorporationDate } : {}),
    ...(ageMonths !== undefined ? { ageMonths } : {}),
    independentSourceCount,
    ...(dates[0] ? { earliestIndependentMention: dates[0] } : {}),
    thinRecord:
      (ageMonths !== undefined && ageMonths < THIN_AGE_MONTHS) ||
      (!input.searchFailed && independentSourceCount < THIN_SOURCE_COUNT),
  };
}

// Only claims youth when the registry age says so; thin coverage alone is worded as such.
export function footprintHeadline(footprint: FootprintContext): string {
  return footprint.ageMonths !== undefined && footprint.ageMonths < THIN_AGE_MONTHS
    ? "Young company with a limited independent record."
    : "Limited independent record.";
}

// A3's rules, in precedence order. A contradiction from the registry or an independent
// source always wins; registry_only needs the registry to actually agree.
export function reconcileStatus(input: {
  registry: "agrees" | "disagrees" | "silent";
  supportCount: number;
  conflictCount: number;
}): CorroborationStatus {
  if (input.conflictCount > 0 || input.registry === "disagrees") return "conflict";
  if (input.supportCount > 0) return "corroborated";
  if (input.registry === "agrees") return "registry_only";
  return "uncorroborated";
}

export interface ModelCorroboration {
  claim: string;
  selfSourceId: string | null;
  registryValue: string | null;
  registryAgrees: boolean | null;
  independentSupportIds: string[];
  independentConflictIds: string[];
}

function pickIndependent(ids: string[], sourcesById: Map<string, Source>): Source[] {
  const seen = new Set<string>();
  return ids.flatMap((id) => {
    const s = sourcesById.get(id);
    // A source only counts as independent corroboration if it is labeled independent.
    if (!s || s.provenance !== "independent" || seen.has(s.id)) return [];
    seen.add(s.id);
    return [s];
  });
}

export function buildCorroboration(
  checks: ModelCorroboration[],
  sourcesById: Map<string, Source>,
): CorroborationCheck[] {
  return checks.map((c) => {
    const independentSupport = pickIndependent(c.independentSupportIds, sourcesById);
    const independentConflict = pickIndependent(c.independentConflictIds, sourcesById);
    // "The company says" needs a source the rules confirmed it controls (its own domain,
    // a wire, an official profile), so a lookalike site can't speak for it.
    const candidate = c.selfSourceId ? sourcesById.get(c.selfSourceId) : undefined;
    const selfSource =
      candidate?.provenance === "self_published" && candidate.classifiedBy === "rule"
        ? candidate
        : undefined;
    const registryValue = c.registryValue?.trim() || undefined;

    return {
      claim: c.claim,
      ...(selfSource ? { selfSource } : {}),
      ...(registryValue ? { registryValue } : {}),
      independentSupport,
      independentConflict,
      status: reconcileStatus({
        registry: !registryValue
          ? "silent"
          : c.registryAgrees === true
            ? "agrees"
            : c.registryAgrees === false
              ? "disagrees"
              : "silent",
        supportCount: independentSupport.length,
        conflictCount: independentConflict.length,
      }),
    };
  });
}

export interface ModelFinding {
  sourceId: string;
  headline: string;
  summary: string;
  severity: Severity;
  category: FindingCategory;
}

const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "informational"];

// Enforces traceability: a finding survives only if it maps to a retrieved source.
export function traceFindings(
  modelFindings: ModelFinding[],
  sourcesById: Map<string, Source>,
): { findings: Finding[]; renumber: Map<string, string> } {
  const seen = new Set<string>();
  const traced = modelFindings.flatMap((f) => {
    const src = sourcesById.get(f.sourceId);
    if (!src || seen.has(src.id)) return [];
    seen.add(src.id);
    return [
      {
        id: src.id,
        sourceId: src.id,
        sourceProvenance: src.provenance,
        headline: f.headline,
        summary: f.summary,
        url: src.url,
        publishedDate: src.publishedDate,
        severity: f.severity,
        category: f.category,
      } satisfies Finding,
    ];
  });

  traced.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""),
  );

  const renumber = new Map(traced.map((f, i) => [f.sourceId, `f${i + 1}`]));
  return {
    findings: traced.map((f) => ({ ...f, id: renumber.get(f.sourceId)! })),
    renumber,
  };
}

// Rewrites [s3] markers to [f1], dropping citations whose finding didn't survive
// and any source ids the model wrote outside brackets.
export function renumberCitations(text: string, renumber: Map<string, string>): string {
  return text
    .replace(/\s*\[([^\]]+)\]/g, (_, id: string) => (renumber.has(id) ? ` [${renumber.get(id)}]` : ""))
    // Bare ids like "(s15)" are internal references, never citations.
    .replace(/\s*\(s\d+(?:,\s*s\d+)*\)/g, "")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}
