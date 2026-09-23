"use client";

import { useState } from "react";
import type { ScreenEvent, ScreenRequest, ScreenResponse, ScreenStep } from "@/lib/types";
import { CorroborationTable } from "./components/CorroborationTable";
import { FindingsList } from "./components/FindingsList";
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
  | { kind: "done"; result: ScreenResponse }
  | { kind: "error"; query: ScreenRequest; message: string };

export default function Home() {
  const [view, setView] = useState<View>({ kind: "idle" });

  async function screen(query: ScreenRequest) {
    let steps = PENDING;
    setView({ kind: "loading", query, steps });

    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
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
        <h1 className="text-xl font-semibold tracking-tight">Vetted</h1>
        <p className="mt-1 max-w-prose text-muted">
          Enter a US company to confirm it is a registered business and see cited news on
          lawsuits, breaches, and regulatory actions before you sign.
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
          <p className="rounded-lg border border-escalate/30 bg-sheet p-4 text-escalate">
            Screening failed: {view.message}
          </p>
        )}

        {view.kind === "done" && <Results key={JSON.stringify(view.result.query)} result={view.result} />}
      </div>
    </main>
  );
}

function Results({ result }: { result: ScreenResponse }) {
  const searchFailed =
    result.warnings?.some((w) => /^(Independent-coverage|Web research)/.test(w)) ?? false;

  return (
    <div className="grid gap-12">
      {result.warnings && result.warnings.length > 0 && (
        <div className="rounded-lg border border-caution/40 bg-sheet p-4 text-sm">
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

      <section className="border-t border-rule pt-8">
        <MonitorButton query={result.query} exampleHeadline={result.findings[0]?.headline} />
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
