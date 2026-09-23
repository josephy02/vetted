import type { Finding, Severity } from "@/lib/types";
import { ProvenanceBadge } from "./ProvenanceBadge";

const SEVERITY: Record<Severity, { label: string; dot: string }> = {
  high: { label: "High", dot: "bg-escalate" },
  medium: { label: "Medium", dot: "bg-caution" },
  low: { label: "Low", dot: "bg-muted" },
  informational: { label: "Informational", dot: "bg-rule" },
};

const CATEGORY: Record<Finding["category"], string> = {
  breach: "Data breach",
  litigation: "Litigation",
  regulatory: "Regulatory",
  executive: "Leadership",
  other: "Other",
};

export function FindingsList({ findings, searchFailed }: { findings: Finding[]; searchFailed: boolean }) {
  if (searchFailed) {
    return (
      <p className="text-muted">
        The adverse-media search failed, so no findings are shown. Screen again to retry.
      </p>
    );
  }

  if (findings.length === 0) {
    return (
      <p className="max-w-prose text-muted">
        No adverse coverage found in the independent sources retrieved for the last three years.
        That is a good sign, but it is an absence of evidence rather than proof of a clean record.
      </p>
    );
  }

  // Findings arrive sorted by severity and recency, numbered to match the memo's citations.
  return (
    <ol className="divide-y divide-rule border-y border-rule">
      {findings.map((f) => (
        <li key={f.id} id={`finding-${f.id}`} className="scroll-mt-6 py-5 target:bg-accent/5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="text-xs font-medium text-accent">[{f.id.slice(1)}]</span>
            <span className="flex items-center gap-1.5 text-ink">
              <span className={`size-2 rounded-full ${SEVERITY[f.severity].dot}`} aria-hidden />
              {SEVERITY[f.severity].label}
            </span>
            <span>{CATEGORY[f.category]}</span>
            {f.publishedDate && <time dateTime={f.publishedDate}>{formatDate(f.publishedDate)}</time>}
            <ProvenanceBadge provenance={f.sourceProvenance} />
          </div>
          <h3 className="mt-2 text-lg font-medium leading-snug">{f.headline}</h3>
          <p className="mt-1 max-w-[70ch] text-muted">{f.summary}</p>
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block break-all text-sm text-accent underline decoration-rule underline-offset-4 hover:decoration-accent"
          >
            {hostname(f.url)}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
