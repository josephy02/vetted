import type { ScreenRequest, Verification } from "@/lib/types";
import { formatDate } from "./FindingsList";

const UNVERIFIED_COPY = {
  no_match: {
    title: "No registered business found",
    body: "Baselayer found no US entity matching this name. Check the spelling, or add a city and state.",
  },
  ambiguous: {
    title: "More than one business matches",
    body: "Several registered entities share this name. Add a city and state to pick the right one.",
  },
  error: {
    title: "Identity could not be verified",
    body: "The verification lookup failed, so the findings below are not tied to a confirmed entity.",
  },
};

export function VerificationCard({
  verification,
  query,
}: {
  verification: Verification;
  query: ScreenRequest;
}) {
  if (!verification.verified) {
    const copy = UNVERIFIED_COPY[verification.reason];
    return (
      <section className="rounded-lg border border-rule bg-sheet p-6">
        <p className="flex items-center gap-2 font-medium text-caution">
          <span className="size-2 rounded-full bg-caution" aria-hidden />
          {copy.title}
        </p>
        <p className="mt-2 max-w-prose text-muted">{copy.body}</p>
        {verification.candidates && verification.candidates.length > 0 && (
          <ul className="mt-4 grid gap-1 text-sm">
            {verification.candidates.map((c) => (
              <li key={`${c.legalName}-${c.location}`}>
                {c.legalName}
                {c.location && <span className="text-muted">, {c.location}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const status = verification.entityStatus?.toLowerCase();
  const statusOk = status ? /^(active|good standing|in good standing|current)/.test(status) : undefined;
  const watchlistMatches = verification.watchlistHits?.filter((h) => h.match) ?? [];

  return (
    <section className="rounded-lg border border-rule bg-sheet p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {verification.legalName ?? query.companyName}
        </h2>
        <p className="flex items-center gap-1.5 text-sm font-medium text-proceed">
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path
              d="M8 1l6 2.5V8c0 3.5-2.6 6.2-6 7-3.4-.8-6-3.5-6-7V3.5L8 1z"
              fill="currentColor"
            />
            <path d="M5 8.2l2 2 4-4.4" fill="none" stroke="white" strokeWidth="1.6" />
          </svg>
          Verified registered business
        </p>
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Entity status">
          <span
            className={
              statusOk === false ? "font-semibold text-escalate" : statusOk ? "text-proceed" : undefined
            }
          >
            {verification.entityStatus
              ? verification.entityStatus[0].toUpperCase() + verification.entityStatus.slice(1)
              : "Not reported"}
          </span>
        </Item>
        <Item label="Registered in">{verification.incorporationState ?? "Not reported"}</Item>
        <Item label="Registered on">
          {verification.incorporationDate ? formatDate(verification.incorporationDate) : "Not reported"}
        </Item>
        <Item label="Watchlists">
          {!verification.watchlistHits?.length ? (
            "Not screened"
          ) : watchlistMatches.length ? (
            <span className="font-semibold text-escalate">
              Match on {watchlistMatches.map((h) => h.list).join(", ")}
            </span>
          ) : (
            <span className="text-proceed">
              No matches ({verification.watchlistHits.map((h) => h.list).join(", ")})
            </span>
          )}
        </Item>
      </dl>

      {verification.officers && verification.officers.length > 0 && (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="text-sm text-muted">Officers on record</p>
          <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {verification.officers.map((o) => (
              <li key={`${o.name}-${o.title}`}>
                {o.name} <span className="text-muted">{o.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-xs text-muted">Source: Baselayer KYB registry data, via Exa Connect</p>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
