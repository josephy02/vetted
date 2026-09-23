"use client";

import { useEffect, useState } from "react";
import type { ScreenStep } from "@/lib/types";

export type StepState = { status: "pending" | "done" | "error"; ms?: number };

const STEPS: { step: ScreenStep; label: string; detail: string }[] = [
  { step: "verification", label: "Verifying identity", detail: "Baselayer KYB via Exa Agent" },
  {
    step: "self_published",
    label: "Reading the company's own pages",
    detail: "Exa Search, restricted to its domain",
  },
  {
    step: "independent",
    label: "Searching independent coverage",
    detail: "Exa Search, with the company's domain and press wires excluded",
  },
  { step: "provenance", label: "Labeling every source", detail: "Rules first, model only for ties" },
  { step: "synthesis", label: "Writing the risk memo", detail: "Claude, citing only the sources found" },
];

function useElapsed(): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setMs(Date.now() - start), 100);
    return () => clearInterval(id);
  }, []);
  return ms;
}

export function ScreenProgress({ steps }: { steps: Record<ScreenStep, StepState> }) {
  const elapsed = useElapsed();
  const settled = (s: ScreenStep) => steps[s].status !== "pending";
  const searchesDone = settled("self_published") && settled("independent");
  const lookupsDone = searchesDone && settled("verification") && settled("provenance");

  return (
    <div>
      <p className="mb-6 font-mono text-3xl tabular-nums tracking-tight">
        {(elapsed / 1000).toFixed(1)}
        <span className="ml-1 text-base text-muted">s elapsed</span>
      </p>
      <ol className="grid gap-4" aria-live="polite">
        {STEPS.map(({ step, label, detail }) => {
          const state = steps[step];
          const waiting =
            (step === "synthesis" && !lookupsDone) || (step === "provenance" && !searchesDone);
          return (
            <li key={step} className="flex items-start gap-3">
              <Indicator status={state.status} waiting={waiting} />
              <div className={waiting ? "opacity-50" : undefined}>
                <p className="font-medium">
                  {label}
                  {state.status === "done" && state.ms !== undefined && (
                    <span className="ml-2 text-sm font-normal text-muted">
                      {(state.ms / 1000).toFixed(1)}s
                    </span>
                  )}
                  {state.status === "error" && (
                    <span className="ml-2 text-sm font-normal text-escalate">failed</span>
                  )}
                </p>
                <p className="text-sm text-muted">
                  {waiting
                    ? step === "synthesis"
                      ? "Starts once every lookup finishes"
                      : "Starts once both searches finish"
                    : detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
function Indicator({ status, waiting }: { status: StepState["status"]; waiting: boolean }) {
  if (status === "done") {
    return (
      <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-proceed text-white">
        <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="sr-only">Done</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-escalate text-xs font-bold text-white">
        !<span className="sr-only">Failed</span>
      </span>
    );
  }
  return (
    <span
      className={`mt-0.5 size-5 rounded-full border-2 border-rule ${
        waiting ? "" : "animate-spin border-t-accent"
      }`}
      aria-hidden
    />
  );
}
