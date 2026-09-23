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
      <Field label="Company name" className="sm:col-span-4">
        <input
          autoFocus
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g. Acme Logistics, Inc."
          className={inputClass}
        />
      </Field>
      <Field label="Domain" className="sm:col-span-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="acme.ai"
          className={inputClass}
        />
      </Field>
      <Field label="City" className="sm:col-span-3">
        <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
      </Field>
      <Field label="State" className="sm:col-span-1">
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
        className="h-11 rounded-md bg-accent px-5 font-medium whitespace-nowrap text-white sm:col-span-2 transition-colors hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? "Screening…" : "Screen this vendor"}
      </button>
      <p id="search-hint" className="text-sm text-muted sm:col-span-6">
        Domain, city and state are optional. Add the domain when the name is common: it anchors the registry match and tells the brief which sources the company controls.
      </p>
    </form>
  );
}

const inputClass =
  "h-11 w-full rounded-md border border-rule bg-sheet px-3 text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none";

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
    <label className={`grid gap-1.5 text-sm ${className ?? ""}`}>
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
