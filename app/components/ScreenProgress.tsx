import type { ScreenStep } from "@/lib/types";

export type StepState = { status: "pending" | "done" | "error"; ms?: number };

const STEPS: { step: ScreenStep; label: string; detail: string }[] = [
  { step: "verification", label: "Verifying identity", detail: "Baselayer KYB via Exa Agent" },
  { step: "search", label: "Searching adverse media", detail: "Exa Search, last 3 years of news" },
  { step: "synthesis", label: "Writing the risk memo", detail: "Claude, citing only the sources found" },
];

export function ScreenProgress({ steps }: { steps: Record<ScreenStep, StepState> }) {
  const lookupsDone = steps.verification.status !== "pending" && steps.search.status !== "pending";

  return (
    <ol className="grid gap-4" aria-live="polite">
      {STEPS.map(({ step, label, detail }) => {
        const state = steps[step];
        const waiting = step === "synthesis" && !lookupsDone;
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
                {waiting ? "Starts once both lookups finish" : detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
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
