"use client";

import { useState } from "react";
import type { ScreenRequest } from "@/lib/types";

export function SearchForm({
  onSubmit,
  disabled,
  initial,
}: {
  onSubmit: (req: ScreenRequest) => void;
  disabled: boolean;
  initial?: ScreenRequest;
}) {
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_10rem_5rem_auto] sm:items-end"
      aria-describedby="search-hint"
      onSubmit={(e) => {
        e.preventDefault();
        if (!companyName.trim()) return;
        onSubmit({
          companyName: companyName.trim(),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(state.trim() ? { state: state.trim().toUpperCase() } : {}),
        });
      }}
    >
      <Field label="Company name">
        <input
          autoFocus
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g. Acme Logistics, Inc."
          className={inputClass}
        />
      </Field>
      <Field label="City">
        <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
      </Field>
      <Field label="State">
        <input
          value={state}
          onChange={(e) => setState(e.target.value.slice(0, 2))}
          placeholder="CA"
          maxLength={2}
          className={`${inputClass} uppercase`}
        />
      </Field>
      <button
        type="submit"
        disabled={disabled || !companyName.trim()}
        className="h-11 rounded-md bg-accent px-5 font-medium whitespace-nowrap sm:w-48 text-white transition-colors hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? "Screening…" : "Screen this vendor"}
      </button>
      <p id="search-hint" className="text-sm text-muted sm:col-span-4">
        City and state are optional. Add them when the name is common.
      </p>
    </form>
  );
}

const inputClass =
  "h-11 w-full rounded-md border border-rule bg-sheet px-3 text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
