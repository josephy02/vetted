import type { Finding, RiskMemo as Memo } from "@/lib/types";

const VERDICT = {
  proceed: { label: "Proceed", rule: "border-proceed", text: "text-proceed" },
  proceed_with_caution: { label: "Proceed with caution", rule: "border-caution", text: "text-caution" },
  escalate_for_review: { label: "Escalate for review", rule: "border-escalate", text: "text-escalate" },
};

export function RiskMemo({ memo, findings }: { memo: Memo; findings: Finding[] }) {
  const v = VERDICT[memo.recommendation];
  const known = new Set(findings.map((f) => f.id));

  return (
    <section className={`border-l-2 ${v.rule} pl-6`}>
      <p className="text-sm text-muted">Recommendation</p>
      <p className={`mt-1 font-serif text-4xl tracking-tight ${v.text}`}>{v.label}</p>
      <p className="mt-4 max-w-[68ch] leading-7">
        {withCitations(memo.overallRationale, known)}
      </p>
      <p className="mt-3 text-xs text-muted">
        A research memo to support your decision, not an automated approval.
      </p>
    </section>
  );
}

// Turns inline [f3] markers into links to the matching finding below.
function withCitations(text: string, known: Set<string>) {
  return text.split(/(\[f\d+\])/g).map((part, i) => {
    const id = part.match(/^\[(f\d+)\]$/)?.[1];
    if (!id) return part;
    if (!known.has(id)) return null;
    return (
      <a
        key={i}
        href={`#finding-${id}`}
        className="align-super font-sans text-xs font-medium text-accent hover:underline"
      >
        [{id.slice(1)}]
      </a>
    );
  });
}
