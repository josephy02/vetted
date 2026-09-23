import { footprintHeadline } from "@/lib/analysis";
import type { FootprintContext } from "@/lib/types";
import { formatDate } from "./FindingsList";

export function FootprintBanner({ footprint }: { footprint: FootprintContext }) {
  if (!footprint.thinRecord) return null;

  const detail = [
    footprint.ageMonths !== undefined && `Registered ${describeAge(footprint.ageMonths)} ago`,
    `${footprint.independentSourceCount} independent ${
      footprint.independentSourceCount === 1 ? "source" : "sources"
    } found`,
    footprint.earliestIndependentMention &&
      `earliest independent mention ${formatDate(footprint.earliestIndependentMention)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-lg border border-rule bg-sheet p-4">
      <p className="font-medium">
        {footprintHeadline(footprint)} This review leans on registry data and cross-checks.
      </p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
      <p className="mt-2 text-sm text-muted">
        A limited record is a statement about the evidence, not about the vendor.
      </p>
    </section>
  );
}

function describeAge(months: number): string {
  if (months < 24) return `${months} ${months === 1 ? "month" : "months"}`;
  return `${Math.floor(months / 12)} years`;
}
