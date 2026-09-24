"use client";

import { useEffect, useState } from "react";

export function AccessCodeForm({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    fetch("/fixtures/index.json")
      .then((r) => r.json())
      .then((index: { companyName: string }[]) => setSaved(index.map((e) => e.companyName)))
      .catch(() => {});
  }, []);

  return (
    <form
      className="mt-3 flex flex-wrap gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onSubmit(code.trim());
      }}
    >
      <label className="grow">
        <span className="sr-only">Access code</span>
        <input
          autoFocus
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          className="h-11 w-full rounded-lg border border-rule bg-sheet px-3 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={!code.trim()}
        className="h-11 rounded-lg bg-accent px-5 font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Unlock
      </button>
      <p className="w-full text-sm text-muted">
        No code?{" "}
        {/* A full load (not <Link>) resets this page's error state on entering demo mode. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/?demo=cached" className="text-accent underline">Replay a saved screening</a>
        {saved.length > 0 && ` of ${saved.join(", ")}`}.
      </p>
    </form>
  );
}
