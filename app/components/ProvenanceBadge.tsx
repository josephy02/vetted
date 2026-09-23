import type { Provenance } from "@/lib/types";

const LABEL: Record<Provenance, string> = {
  registry: "Registry",
  self_published: "Company-published",
  independent: "Independent",
};

// A label, not a warning: neutral border, muted text, no color coding.
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return (
    <span className="rounded border border-rule px-1.5 py-0.5 text-xs font-normal text-muted">
      {LABEL[provenance]}
    </span>
  );
}
