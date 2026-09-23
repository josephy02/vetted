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
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");

  return (
    <form
      className="grid gap-3 sm:grid-cols-6 sm:items-end"
      aria-describedby="search-hint"
      onSubmit={(e) => {
        e.preventDefault();
        if (!companyName.trim()) return;
        onSubmit({
          companyName: companyName.trim(),
          ...(domain.trim() ? { domain: domain.trim() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(state.trim() ? { state: state.trim().toUpperCase() } : {}),
        });
      }}
    >
      <Field label="Company name" className="relative sm:col-span-4">
        <svg
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name, e.g. Acme Logistics, Inc."
          className={`${inputClass} pl-10`}
        />
      </Field>
      <Field label="Domain" className="sm:col-span-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Domain, e.g. acme.ai"
          className={inputClass}
        />
      </Field>
      <Field label="City" className="sm:col-span-3">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          className={inputClass}
        />
      </Field>
      <Field label="State" className="sm:col-span-1">
        <input
          value={state}
          onChange={(e) => setState(e.target.value.slice(0, 2))}
          placeholder="State"
          maxLength={2}
          className={`${inputClass} uppercase placeholder:normal-case`}
        />
      </Field>
      <button
        type="submit"
        disabled={disabled || !companyName.trim()}
        className="h-11 rounded-lg bg-accent px-5 font-medium whitespace-nowrap text-white sm:col-span-2 transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? "Screening…" : "Screen this vendor"}
      </button>
      <p id="search-hint" className="text-sm text-muted sm:col-span-6">
        Only the name is required. Add the domain when the name is common.
      </p>
    </form>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-rule bg-sheet px-3 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`grid ${className ?? ""}`}>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}
