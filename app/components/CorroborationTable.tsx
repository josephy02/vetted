import type { CorroborationCheck, CorroborationStatus, ResolvedDomain, Source } from "@/lib/types";
import { hostname } from "./FindingsList";

const STATUS: Record<CorroborationStatus, { label: string; className: string }> = {
  corroborated: { label: "Corroborated", className: "text-proceed" },
  registry_only: { label: "Registry only", className: "text-muted" },
  uncorroborated: { label: "Not corroborated", className: "text-muted" },
  conflict: { label: "Conflict", className: "text-escalate font-medium" },
};

export function CorroborationTable({
  checks,
  resolvedDomain,
}: {
  checks: CorroborationCheck[];
  resolvedDomain: ResolvedDomain;
}) {
  if (checks.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Does the independent web agree?</h2>
      <p className="mb-4 max-w-prose text-sm text-muted">
        What the company says about itself, checked against the registry and against sources it
        does not control. &ldquo;Registry only&rdquo; is normal for a young company.
      </p>
      <p className="mb-4 text-sm text-muted">
        {resolvedDomain.domain ? (
          <>
            Company pages: <span className="text-ink">{resolvedDomain.domain}</span>
            {resolvedDomain.domainSource === "resolved" && " (found automatically; add a domain to override)"}
          </>
        ) : (
          "No company domain found, so no pages could be attributed to the company."
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-2 pr-4 font-normal">The company says</th>
              <th className="py-2 pr-4 font-normal">Registry</th>
              <th className="py-2 pr-4 font-normal">Independent</th>
              <th className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.claim} className="border-b border-rule align-top">
                <td className="py-3 pr-4">
                  {c.claim}
                  {c.selfSource && (
                    <SourceLink source={c.selfSource} className="mt-1 block text-xs" />
                  )}
                </td>
                <td className="py-3 pr-4 text-muted">{c.registryValue ?? "—"}</td>
                <td className="py-3 pr-4">
                  {c.independentConflict.length > 0 && (
                    <p className="text-escalate">
                      {c.independentConflict.length} contradicting
                    </p>
                  )}
                  {c.independentSupport.length === 0 && c.independentConflict.length === 0 ? (
                    <span className="text-muted">None found</span>
                  ) : (
                    [...c.independentConflict, ...c.independentSupport].map((s) => (
                      <SourceLink key={s.id} source={s} className="block text-xs" />
                    ))
                  )}
                </td>
                <td className={`py-3 ${STATUS[c.status].className}`}>{STATUS[c.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SourceLink({ source, className }: { source: Source; className?: string }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-accent underline decoration-rule underline-offset-4 hover:decoration-accent ${className ?? ""}`}
    >
      {hostname(source.url)}
    </a>
  );
}
