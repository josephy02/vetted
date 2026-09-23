"use client";

import { useState } from "react";
import type { MonitorResponse, MonitorStatusResponse, ScreenRequest } from "@/lib/types";
import { formatDate, hostname } from "./FindingsList";

type State =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "active"; monitor: MonitorResponse; status?: MonitorStatusResponse; checking?: boolean }
  | { kind: "error"; message: string };

export function MonitorButton({
  query,
  exampleHeadline,
}: {
  query: ScreenRequest;
  exampleHeadline?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function subscribe() {
    setState({ kind: "creating" });
    try {
      const res = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setState({ kind: "active", monitor: body });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function check() {
    if (state.kind !== "active") return;
    setState({ ...state, checking: true });
    try {
      const res = await fetch(`/api/monitor/${encodeURIComponent(state.monitor.monitorId)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setState({ kind: "active", monitor: state.monitor, status: body });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (state.kind === "idle" || state.kind === "creating" || state.kind === "error") {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={subscribe}
          disabled={state.kind === "creating"}
          className="h-11 rounded-lg border border-accent px-5 font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
        >
          {state.kind === "creating" ? "Setting up monitoring…" : "Monitor this vendor"}
        </button>
        <p className="text-sm text-muted">
          {state.kind === "error"
            ? `Monitoring was not set up: ${state.message}`
            : "Re-screens news coverage daily and flags anything new."}
        </p>
      </div>
    );
  }

  const { monitor, status, checking } = state;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 font-medium text-proceed">
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          Monitoring {query.companyName}
        </p>
        {monitor.nextCheck && (
          <p className="text-sm text-muted">Next check {formatDate(monitor.nextCheck)}</p>
        )}
        <button
          onClick={check}
          disabled={checking}
          className="text-sm font-medium text-accent underline underline-offset-4 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check for new coverage now"}
        </button>
      </div>

      {status && (
        <div className="text-sm">
          {status.hits.length === 0 ? (
            <p className="text-muted">
              No new coverage since monitoring started
              {status.lastRunAt ? ` (checked ${formatDate(status.lastRunAt)})` : ""}.
            </p>
          ) : (
            <ul className="grid gap-2">
              {status.hits.map((h) => (
                <li key={h.url}>
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-4"
                  >
                    {h.title}
                  </a>
                  <span className="text-muted">
                    {" "}
                    {hostname(h.url)}
                    {h.publishedDate ? `, ${formatDate(h.publishedDate)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AlertPreview companyName={query.companyName} headline={exampleHeadline} />
    </div>
  );
}

// Shows the shape of an alert so the value is visible before a real hit arrives.
function AlertPreview({ companyName, headline }: { companyName: string; headline?: string }) {
  return (
    <figure className="max-w-md">
      <figcaption className="mb-2 text-sm text-muted">Preview of an alert</figcaption>
      <div className="rounded-xl border border-dashed border-rule p-4 text-sm">
        <p className="font-medium">New coverage for {companyName}</p>
        <p className="mt-1 text-muted">
          {headline
            ? `Alerts look like this, e.g. "${headline}", with its source link and date.`
            : "Each new article appears with its source link and date."}
        </p>
      </div>
    </figure>
  );
}
