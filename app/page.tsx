"use client";

import { useState } from "react";
import { accessHeaders, saveAccessCode } from "@/lib/access-code";
import type { ScreenEvent, ScreenRequest, ScreenResponse, ScreenStep } from "@/lib/types";
import { AccessCodeForm } from "./components/AccessCodeForm";
import { CorroborationTable } from "./components/CorroborationTable";
import { FindingsList, formatDate } from "./components/FindingsList";
import { FootprintBanner } from "./components/FootprintBanner";
import { MonitorButton } from "./components/MonitorButton";
import { RiskMemo } from "./components/RiskMemo";
import { ScreenProgress, type StepState } from "./components/ScreenProgress";
import { SearchForm } from "./components/SearchForm";
import { VerificationCard } from "./components/VerificationCard";

type Steps = Record<ScreenStep, StepState>;

const PENDING: Steps = {
  verification: { status: "pending" },
  self_published: { status: "pending" },
  independent: { status: "pending" },
  provenance: { status: "pending" },
  synthesis: { status: "pending" },
};

type View =
  | { kind: "idle" }
  | { kind: "loading"; query: ScreenRequest; steps: Steps }
  | { kind: "done"; result: ScreenResponse; replayedAt?: string }
  | { kind: "error"; query: ScreenRequest; message: string; needsCode?: boolean };

// ?demo=cached replays screenings saved by `npm run fixture`, for when the network
// or an API is too slow to run live.
function cachedMode(): boolean {
  return new URLSearchParams(window.location.search).get("demo") === "cached";
}

// Returns a saved screening for this company, or null to fall through to a live run.
async function loadFixture(companyName: string) {
  try {
    const index: { companyName: string; file: string }[] = await fetch("/fixtures/index.json").then(
      (r) => r.json(),
    );
    const name = companyName.trim().toLowerCase();
    const match = index.find((e) => e.companyName.trim().toLowerCase() === name);
    if (!match) return null;
    const saved = await fetch(`/fixtures/${match.file}`).then((r) => r.json());
    return { result: saved.result as ScreenResponse, savedAt: saved.savedAt as string };
  } catch {
    return null;
  }
}

export default function Home() {
  const [view, setView] = useState<View>({ kind: "idle" });

  async function screen(query: ScreenRequest) {
    if (cachedMode()) {
      const fixture = await loadFixture(query.companyName);
      if (fixture) {
        setView({ kind: "done", result: fixture.result, replayedAt: fixture.savedAt });
        return;
      }
    }

    let steps = PENDING;
    setView({ kind: "loading", query, steps });

    try {
      const auth = accessHeaders();
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(query),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          saveAccessCode(null);
          const message = "x-access-code" in auth ? "That access code didn't work." : body.error;
          setView({ kind: "error", query, message, needsCode: true });
          return;
        }
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ScreenEvent;
          if (event.type === "step") {
            steps = { ...steps, [event.step]: { status: event.status, ms: event.ms } };
            setView({ kind: "loading", query, steps });
          } else if (event.type === "result") {
            setView({ kind: "done", result: event.data });
            return;
          } else {
            throw new Error(event.message);
          }
        }
      }
      throw new Error("The screening ended before a result was returned.");
    } catch (err) {
      setView({ kind: "error", query, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const query = view.kind === "idle" ? undefined : view.kind === "done" ? view.result.query : view.query;

  return (
    <main className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <h1 className="font-serif text-5xl tracking-tight">Vetted</h1>
        <p className="mt-3 max-w-prose text-muted">
          Check that a US vendor is real, and what independent sources say about it.
        </p>
      </header>

      <SearchForm
        key={query ? `${query.companyName}|${query.domain}|${query.city}|${query.state}` : "new"}
        onSubmit={screen}
        disabled={view.kind === "loading"}
        initial={query}
      />

      <div className="mt-12">
        {view.kind === "loading" && <ScreenProgress steps={view.steps} />}

        {view.kind === "error" && (
          <div className="rounded-xl border border-escalate/30 p-4">
            <p className="text-escalate">
              {view.needsCode ? view.message : `Screening failed: ${view.message}`}
            </p>
            {view.needsCode && (
              <AccessCodeForm
                onSubmit={(code) => {
                  saveAccessCode(code);
                  screen(view.query);
                }}
              />
            )}
          </div>
        )}

        {view.kind === "done" && (
          <Results
            key={JSON.stringify(view.result.query)}
            result={view.result}
            replayedAt={view.replayedAt}
          />
        )}
      </div>
    </main>
  );
}

function Results({ result, replayedAt }: { result: ScreenResponse; replayedAt?: string }) {
  const searchFailed =
    result.warnings?.some((w) => /^(Independent-coverage|Web research)/.test(w)) ?? false;

  return (
    <div className="grid gap-12">
      {replayedAt && (
        <p className="rounded-xl border border-rule p-3 text-sm text-muted">
          Replaying a screening saved on {formatDate(replayedAt)}. Remove{" "}
          <code>?demo=cached</code> from the URL to run live.
        </p>
      )}
      {result.warnings && result.warnings.length > 0 && (
        <div className="rounded-xl border border-caution/40 p-4 text-sm">
          <p className="font-medium text-caution">Part of this screening is incomplete</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <VerificationCard verification={result.verification} query={result.query} />
      <FootprintBanner footprint={result.footprint} />
      <RiskMemo memo={result.riskMemo} findings={result.findings} />
      <CorroborationTable checks={result.corroboration} resolvedDomain={result.resolvedDomain} />

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Findings <span className="font-normal text-muted">{result.findings.length}</span>
        </h2>
        <FindingsList findings={result.findings} searchFailed={searchFailed} />
      </section>

      <section>
        <MonitorButton
          // A domain found automatically lets the monitor exclude the company's own site too.
          query={{ ...result.query, domain: result.query.domain ?? result.resolvedDomain.domain }}
          exampleHeadline={result.findings[0]?.headline}
        />
      </section>

      <p className="text-xs text-muted">
        Screened in {(result.timings.totalMs / 1000).toFixed(1)}s: identity{" "}
        {(result.timings.verificationMs / 1000).toFixed(1)}s and web research{" "}
        {(result.timings.searchMs / 1000).toFixed(1)}s in parallel, memo{" "}
        {(result.timings.synthesisMs / 1000).toFixed(1)}s. {result.sources.length} sources,{" "}
        {result.footprint.independentSourceCount} independent.
      </p>
    </div>
  );
}
