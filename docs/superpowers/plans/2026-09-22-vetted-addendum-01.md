# Vetted — Addendum 01 Implementation Plan (demo cut)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source provenance, a corroboration check, and company-age context to the existing Vetted screening app, so the live demo can show that a young vendor's thin record is *limited evidence*, not risk.

**Architecture:** Keep the v1 shape (parallel Exa lookups → one Claude synthesis → NDJSON stream). Three changes: retrieval splits into separate self-published and independent Exa searches so the two can be labeled and compared; a deterministic rule-based classifier (with a batched model tiebreaker) assigns provenance before synthesis; and the single synthesis call now returns corroboration claims alongside findings, with the four corroboration *statuses* computed in tested pure code rather than chosen by the model.

**Tech Stack:** Next.js 16.3.5 (App Router), React 19, TypeScript, Tailwind v4, `exa-js@2.22.2`, Vercel AI SDK v6 (`ai`) + `@ai-sdk/anthropic`, zod 4, Vitest (new).

**Specs:**
- `/Users/josephyared/Downloads/VETTED_SPEC_ADDENDUM_01.md` (primary — this plan implements A1–A5, A7, A9)
- `/Users/josephyared/Downloads/VENDOR_RISK_COPILOT_TECH_SPEC.md` (v1, already built)
- `/Users/josephyared/Downloads/Vetted — Demo Narrative & Talk Track.pdf` (the run-of-show this plan is scoped to)

---

## Why this cut

The talk track's live demo is 5 minutes and 7 steps. This plan builds exactly what appears on screen during those steps and nothing else.

| Demo step | What the presenter points at | Task |
| --- | --- | --- |
| 1. Type name **and domain**, hit Screen | Parallel steps + elapsed timer | 1, 7, 8 |
| 2. Results load | Registry card (already built) | 2 (adds incorporation date) |
| 3. Scroll to age banner + corroboration table | Self-published vs. independent; what's confirmed and what isn't | 3, 4, 5, 6, 8 |
| 4. Run Change Healthcare | Dated findings (already built) + provenance badges | 3, 8 |
| 5. Read the recommendation | Rationale honoring the A5 rules | 6 |
| 6. Click Monitor this vendor | Already built in v1 | — |
| 7. Point at the timer | Total seconds per run | 7, 8 |
| Fallback | `?demo=cached` replay | 9 |

**Deliberately not built** (see Appendix B — these are lines you *say*, not things you show): the MCP `screen_vendor` tool (A8), Websets entity mapping, `agentSummary`.

## Global Constraints

- **Additive only.** No v1 field is renamed or removed. Every new field on `ScreenResponse` is either new or optional.
- **Node 20+.** Tailwind v4 with `@theme` tokens in `app/globals.css` — there is no `tailwind.config`. Available color tokens: `paper`, `sheet`, `ink`, `muted`, `rule`, `accent`, `proceed`, `caution`, `escalate`.
- **Exa parameter names are verified** against `node_modules/exa-js/dist/index.d.ts` (v2.22.2) — do not re-guess them: `includeDomains: string[]`, `excludeDomains: string[]`, `startPublishedDate`, `endPublishedDate`, `includeText` / `excludeText` (**one phrase, max 5 words**), `category: "company" | "publication" | "news" | "personal site" | "financial report" | "people"`. **There is no `sortBy` parameter** — "earliest mention" must come from a widened date window, not from sorting.
- **Models:** `process.env.ANTHROPIC_MODEL || "claude-sonnet-5"` for synthesis; `process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5-20251001"` for the provenance tiebreaker.
- **Budget:** exactly one Baselayer business search per screen (`effort: "low"`, ~$1). Never add a second Agent run. Results cache 1h in memory.
- **Copy rules (A4/A5), enforced in prompt and UI:** a thin record is described as "limited independent record", never as risk. Adverse items are "reported by [source]", never stated as fact. Youth alone never produces `escalate_for_review`. Missing independent coverage is *insufficient evidence*, never "clean". A `self_published` source may never support a positive claim about trustworthiness.
- **Guardrails (A10):** businesses only; no lookups on individuals beyond registry officer names.
- `lib/provenance.ts`, `lib/analysis.ts`, `lib/request.ts`, `lib/types.ts` must **never** import `server-only` — Vitest imports them directly.

## File map

**Create:**
- `lib/provenance.ts` — pure rule-based provenance classifier + domain lists
- `lib/classify.ts` — server-only batched model tiebreaker
- `lib/analysis.ts` — pure: footprint computation, corroboration status reconciliation, finding tracing + citation renumbering (moved out of `synthesis.ts` so it is testable)
- `app/components/ProvenanceBadge.tsx`
- `app/components/CorroborationTable.tsx`
- `app/components/FootprintBanner.tsx`
- `scripts/save-fixture.mjs` — captures a live screen into `public/fixtures/`
- `vitest.config.ts`, `tests/*.test.ts`

**Modify:**
- `lib/types.ts` — new types, extended request/response
- `lib/request.ts` — `domain` validation
- `lib/exa.ts` — KYB schema fields; split retrieval into three searches; domain resolution
- `lib/monitors.ts` — repoint the local monitor fallback at the new independent search
- `lib/synthesis.ts` — corroboration in the memo call, A5 rules, delegate post-processing to `lib/analysis.ts`
- `app/api/screen/route.ts` — orchestration, cache key, `totalMs`, new step events
- `app/components/SearchForm.tsx` — domain field
- `app/components/ScreenProgress.tsx` — live elapsed timer, new steps
- `app/components/FindingsList.tsx` — provenance badge per finding
- `app/page.tsx` — wire new components, total time, `?demo=cached`
- `package.json` — `vitest` devDependency, `test` + `fixture` scripts

---

### Task 1: Types, domain input, and the test harness

Everything downstream needs these types and the `domain` field. The cache-key change is folded in here because adding `domain` without it silently replays a cached no-domain result — which would break demo step 1 and the A9 #5 disambiguation test.

**Files:**
- Modify: `lib/types.ts`, `lib/request.ts`, `app/components/SearchForm.tsx`, `app/api/screen/route.ts:26`, `package.json`
- Create: `vitest.config.ts`, `tests/request.test.ts`

**Interfaces:**
- Produces: `Provenance`, `Source`, `CorroborationStatus`, `CorroborationCheck`, `FootprintContext`, `ResolvedDomain`; `ScreenRequest.domain?: string`; `Finding.sourceId` + `Finding.sourceProvenance`; `normalizeDomain(input: string): string | null`.

- [ ] **Step 1: Install Vitest and add scripts**

```bash
npm install -D vitest
```

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test for domain normalization**

Create `tests/request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeDomain, parseScreenRequest } from "../lib/request";

describe("normalizeDomain", () => {
  it("accepts a bare domain", () => {
    expect(normalizeDomain("acme.ai")).toBe("acme.ai");
  });

  it("strips scheme, www and path", () => {
    expect(normalizeDomain("https://www.Acme.ai/about?x=1")).toBe("acme.ai");
  });

  it("keeps subdomains that are not www", () => {
    expect(normalizeDomain("app.acme.ai")).toBe("app.acme.ai");
  });

  it("rejects anything without a dot", () => {
    expect(normalizeDomain("acme")).toBeNull();
    expect(normalizeDomain("  ")).toBeNull();
  });

  it("rejects a domain with spaces", () => {
    expect(normalizeDomain("not a domain.com")).toBeNull();
  });
});

describe("parseScreenRequest", () => {
  it("normalizes a supplied domain", () => {
    const parsed = parseScreenRequest({ companyName: "Acme", domain: "HTTPS://www.acme.ai/" });
    expect(parsed).toEqual({ companyName: "Acme", domain: "acme.ai" });
  });

  it("rejects a malformed domain rather than ignoring it", () => {
    expect(parseScreenRequest({ companyName: "Acme", domain: "acme" })).toBe(
      "domain must look like example.com",
    );
  });

  it("still accepts a request with no domain", () => {
    expect(parseScreenRequest({ companyName: "Acme", state: "ca" })).toEqual({
      companyName: "Acme",
      state: "CA",
    });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `normalizeDomain` is not exported from `lib/request`.

- [ ] **Step 4: Add the types**

In `lib/types.ts`, add `domain?: string;` to `ScreenRequest` (after `companyName`), then append these types:

```ts
export type Provenance = "registry" | "self_published" | "independent";

export interface Source {
  id: string; // stable across the response, s1..sN, assigned at retrieval
  url: string;
  title?: string;
  publishedDate?: string;
  provenance: Provenance;
  classifiedBy: "rule" | "model";
  highlights?: string[]; // evidence snippets; additive beyond the addendum's A2 shape
}

export type CorroborationStatus =
  | "corroborated"
  | "registry_only"
  | "uncorroborated"
  | "conflict";

export interface CorroborationCheck {
  claim: string;
  selfSource?: Source;
  registryValue?: string;
  independentSupport: Source[];
  independentConflict: Source[];
  status: CorroborationStatus;
}

export interface FootprintContext {
  incorporationDate?: string;
  ageMonths?: number;
  independentSourceCount: number;
  earliestIndependentMention?: string;
  thinRecord: boolean;
}

// Deviation from A6, deliberate: `domain` is optional so that domainSource
// "unknown" can be represented instead of the field being absent entirely.
export interface ResolvedDomain {
  domain?: string;
  domainSource: "user" | "resolved" | "unknown";
}
```

Extend `VerifiedBusiness` with:

```ts
  incorporationDate?: string;
  website?: string;
```

Extend `Finding` with:

```ts
  sourceId: string; // the stable Source.id this finding is drawn from
  sourceProvenance: Provenance;
```

Replace `ScreenStep` and extend `ScreenResponse`:

```ts
export type ScreenStep =
  | "verification"
  | "self_published"
  | "independent"
  | "provenance"
  | "synthesis";
```

```ts
export interface ScreenResponse {
  query: ScreenRequest;
  verification: Verification;
  resolvedDomain: ResolvedDomain;
  sources: Source[];
  corroboration: CorroborationCheck[];
  footprint: FootprintContext;
  findings: Finding[];
  riskMemo: RiskMemo;
  warnings?: string[];
  timings: { verificationMs: number; searchMs: number; synthesisMs: number; totalMs: number };
}
```

- [ ] **Step 5: Implement `normalizeDomain` and wire it into the parser**

In `lib/request.ts`, add above `parseScreenRequest`:

```ts
// Accepts what a user actually pastes (a URL, a www host, a bare domain) and
// reduces it to a bare lowercase host, or null if it isn't domain-shaped.
export function normalizeDomain(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  if (!host || host.length > 253) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}
```

Then in `parseScreenRequest`, destructure `domain` alongside the others and add, after the `state` check:

```ts
  let normalizedDomain: string | undefined;
  if (domain !== undefined) {
    if (typeof domain !== "string") return "Invalid domain";
    const trimmed = domain.trim();
    if (trimmed) {
      const host = normalizeDomain(trimmed);
      if (!host) return "domain must look like example.com";
      normalizedDomain = host;
    }
  }
```

and add to the returned object, immediately after `companyName`:

```ts
    ...(normalizedDomain ? { domain: normalizedDomain } : {}),
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 8 tests.

- [ ] **Step 7: Add the domain field to the form**

In `app/components/SearchForm.tsx`: add `const [domain, setDomain] = useState(initial?.domain ?? "");`, include `...(domain.trim() ? { domain: domain.trim() } : {})` in the submitted object (right after `companyName`), and add this field between the company-name and city fields:

```tsx
      <Field label="Domain">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="acme.ai"
          className={inputClass}
        />
      </Field>
```

Change the form's `className` to:

```
"grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_9rem_4.5rem_auto] lg:items-end"
```

and the hint paragraph's to `"text-sm text-muted sm:col-span-2 lg:col-span-5"`, with its text replaced by:

```
Domain, city and state are optional. Add the domain when the name is common — it anchors the registry match and tells the brief which sources the company controls.
```

- [ ] **Step 8: Include the domain in the cache key**

In `app/api/screen/route.ts:26`:

```ts
  const key = cacheKey([parsed.companyName, parsed.city, parsed.state, parsed.domain]);
```

Also update the `SearchForm` `key` prop in `app/page.tsx` so re-submitting with a changed domain remounts the form:

```tsx
        key={query ? `${query.companyName}|${query.domain}|${query.city}|${query.state}` : "new"}
```

- [ ] **Step 9: Verify the app still builds and commit**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `lib/synthesis.ts` and `app/api/screen/route.ts` about the missing `sourceId`, `sourceProvenance`, `resolvedDomain`, `sources`, `corroboration` and `footprint` fields. Those are filled in by Tasks 5–7. No errors in `lib/request.ts` or `app/components/SearchForm.tsx`.

```bash
git add -A
git commit -m "Add domain input, provenance types, and Vitest harness"
```

---

### Task 2: Ask Baselayer for incorporation date and primary domain

`FootprintContext.ageMonths` (A4) and `domainSource: "resolved"` (A1) both need data the current KYB schema never requests. These are two fields on an Agent run you already pay for — no extra Baselayer call.

**Files:**
- Modify: `lib/exa.ts:14-17` (`describe`), `lib/exa.ts:24-72` (`KYB_SCHEMA`), `lib/exa.ts:74-84` (`KybOutput`), `lib/exa.ts:86-105` (`verifyBusiness` query/systemPrompt), `lib/exa.ts:123-133` (return mapping)

**Interfaces:**
- Consumes: `ScreenRequest.domain` from Task 1.
- Produces: `VerifiedBusiness.incorporationDate` (ISO `YYYY-MM-DD`), `VerifiedBusiness.website` (bare host).

- [ ] **Step 1: Include the domain in the entity description**

Replace `describe` in `lib/exa.ts`:

```ts
function describe({ companyName, city, state, domain }: ScreenRequest): string {
  const parts = [`'${companyName}'`];
  if (domain) parts.push(`(website ${domain})`);
  const location = [city, state].filter(Boolean).join(", ");
  if (location) parts.push(`in ${location}`);
  return parts.join(" ");
}
```

- [ ] **Step 2: Add the two schema fields**

In `KYB_SCHEMA.properties`, after `entity_status`:

```ts
    incorporation_date: {
      type: ["string", "null"],
      description: "Date of incorporation or formation as YYYY-MM-DD, if reported.",
    },
    primary_domain: {
      type: ["string", "null"],
      description:
        "The company's primary website domain as a bare host, e.g. acme.ai — no scheme, no www, no path.",
    },
```

Leave `required` unchanged: these are nullable like `legal_name`.

- [ ] **Step 3: Extend `KybOutput` and the return mapping**

In `interface KybOutput`, after `entity_status`:

```ts
  incorporation_date?: string | null;
  primary_domain?: string | null;
```

In the `verified: true` return object in `verifyBusiness`, after `entityStatus`:

```ts
    incorporationDate: out.incorporation_date ?? undefined,
    website: out.primary_domain ?? undefined,
```

- [ ] **Step 4: Ask for them in the prompt**

In `verifyBusiness`, change the `query` string's first sentence to:

```
`Verify the US business ${describe(req)} using Baselayer. Return its legal name, ` +
`state of incorporation, date of incorporation, current entity status, current officers, ` +
`and primary website domain. Screen it against the ` +
`OFAC SDN watchlist. Do not run lien or litigation searches.`
```

Append to `systemPrompt`:

```
"If a website domain is given in the query, use it to disambiguate between similarly named " +
"entities; prefer the entity whose registered or reported web presence matches it. " +
"Report incorporation_date only if Baselayer gives a formation or registration date; never estimate it."
```

- [ ] **Step 5: Verify against a live run**

Run `npm run dev`, screen a company you know (use one of the A9 fixtures, e.g. `CDK Global` with domain `cdkglobal.com`), and confirm in the browser network tab that the `result` event's `verification` object now carries `incorporationDate` and `website`.

If `incorporationDate` comes back null for most companies, note it — Task 5's `computeFootprint` already handles a missing date, and `thinRecord` will fall back to the source-count signal alone.

- [ ] **Step 6: Commit**

```bash
git add lib/exa.ts
git commit -m "Request incorporation date and primary domain from Baselayer"
```

---

### Task 3: Provenance classification

A2. Deterministic rules decide most sources; a single batched model call breaks ties. `classifiedBy` records which. The rule lists are pure data and belong in a module Vitest can import — no `server-only`.

**Files:**
- Create: `lib/provenance.ts`, `lib/classify.ts`, `tests/provenance.test.ts`

**Interfaces:**
- Produces: `hostOf(url): string | null`; `classifyByRule(url, companyDomain?): { provenance, classifiedBy: "rule" } | null` (null = ambiguous); `isGenericHost(host): boolean`; `WIRE_DOMAINS: string[]`; `classifyByModel(urls, companyName, companyDomain?): Promise<Map<string, Provenance>>`.

- [ ] **Step 1: Write the failing test**

Create `tests/provenance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyByRule, hostOf, isGenericHost } from "../lib/provenance";

describe("hostOf", () => {
  it("strips www and lowercases", () => {
    expect(hostOf("https://WWW.Acme.ai/about")).toBe("acme.ai");
  });

  it("returns null for a non-URL", () => {
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("classifyByRule", () => {
  it("labels the company's own domain self_published", () => {
    expect(classifyByRule("https://acme.ai/about", "acme.ai")).toEqual({
      provenance: "self_published",
      classifiedBy: "rule",
    });
  });

  it("labels a subdomain of the company self_published", () => {
    expect(classifyByRule("https://blog.acme.ai/post", "acme.ai")?.provenance).toBe(
      "self_published",
    );
  });

  it("does not match a lookalike domain", () => {
    expect(classifyByRule("https://notacme.ai/about", "acme.ai")).toBeNull();
  });

  it("labels press-release wires self_published", () => {
    expect(classifyByRule("https://www.prnewswire.com/news/x", "acme.ai")?.provenance).toBe(
      "self_published",
    );
  });

  it("labels company social profiles self_published", () => {
    expect(classifyByRule("https://www.linkedin.com/company/acme")?.provenance).toBe(
      "self_published",
    );
  });

  it("labels any .gov independent", () => {
    expect(classifyByRule("https://www.sec.gov/litigation/x")?.provenance).toBe("independent");
  });

  it("labels court records independent", () => {
    expect(classifyByRule("https://www.courtlistener.com/docket/1")?.provenance).toBe(
      "independent",
    );
  });

  it("labels known news outlets independent", () => {
    expect(classifyByRule("https://www.reuters.com/legal/x")?.provenance).toBe("independent");
  });

  it("returns null for an unknown host so the model can decide", () => {
    expect(classifyByRule("https://some-trade-blog.example/post", "acme.ai")).toBeNull();
  });
});

describe("isGenericHost", () => {
  it("is true for aggregators and outlets", () => {
    expect(isGenericHost("linkedin.com")).toBe(true);
    expect(isGenericHost("reuters.com")).toBe(true);
  });

  it("is false for a company site", () => {
    expect(isGenericHost("acme.ai")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../lib/provenance`.

- [ ] **Step 3: Implement the rules**

Create `lib/provenance.ts`:

```ts
import type { Provenance } from "./types";

// Anything the company controls or pays to distribute (A2).
export const WIRE_DOMAINS = [
  "prnewswire.com",
  "businesswire.com",
  "globenewswire.com",
  "newswire.com",
  "prweb.com",
  "einpresswire.com",
  "accesswire.com",
  "issuewire.com",
  "openpr.com",
];

// Profile pages a company maintains about itself. Deliberately narrow: hosts
// where the page is almost always the company's own profile. Ambiguous hosts
// (crunchbase, medium, substack) are left to the model tiebreaker.
export const SOCIAL_DOMAINS = [
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
];

export const COURT_AND_REGULATOR_DOMAINS = [
  "courtlistener.com",
  "pacer.gov",
  "uscourts.gov",
  "justia.com",
  "casetext.com",
  "unicourt.com",
  "docketbird.com",
  "law360.com",
  "bloomberglaw.com",
];

export const NEWS_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "wsj.com",
  "nytimes.com",
  "ft.com",
  "cnbc.com",
  "forbes.com",
  "businessinsider.com",
  "axios.com",
  "theinformation.com",
  "techcrunch.com",
  "theverge.com",
  "arstechnica.com",
  "wired.com",
  "washingtonpost.com",
  "npr.org",
  "cnn.com",
  "bbc.com",
  "bbc.co.uk",
  "politico.com",
  "krebsonsecurity.com",
  "bleepingcomputer.com",
  "therecord.media",
  "securityweek.com",
  "healthcaredive.com",
  "modernhealthcare.com",
  "statnews.com",
  "theregister.com",
  "lightreading.com",
  "fiercetelecom.com",
];

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function under(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

// True for hosts that can never be a company's own primary site.
export function isGenericHost(host: string): boolean {
  return [...WIRE_DOMAINS, ...SOCIAL_DOMAINS, ...COURT_AND_REGULATOR_DOMAINS, ...NEWS_DOMAINS].some(
    (d) => under(host, d),
  );
}

export interface RuleVerdict {
  provenance: Provenance;
  classifiedBy: "rule";
}

// Returns null when no rule applies — the caller sends those to the model.
export function classifyByRule(url: string, companyDomain?: string): RuleVerdict | null {
  const host = hostOf(url);
  if (!host) return null;

  if (companyDomain) {
    const own = companyDomain.replace(/^www\./, "").toLowerCase();
    if (under(host, own)) return { provenance: "self_published", classifiedBy: "rule" };
  }

  if ([...WIRE_DOMAINS, ...SOCIAL_DOMAINS].some((d) => under(host, d))) {
    return { provenance: "self_published", classifiedBy: "rule" };
  }

  if (
    host.endsWith(".gov") ||
    host.endsWith(".mil") ||
    [...COURT_AND_REGULATOR_DOMAINS, ...NEWS_DOMAINS].some((d) => under(host, d))
  ) {
    return { provenance: "independent", classifiedBy: "rule" };
  }

  return null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 21 tests total.

- [ ] **Step 5: Add the model tiebreaker**

Create `lib/classify.ts`:

```ts
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Provenance } from "./types";

const FAST_MODEL = "claude-haiku-4-5-20251001";

const schema = z.object({
  verdicts: z.array(
    z.object({
      url: z.string(),
      provenance: z.enum(["self_published", "independent"]),
    }),
  ),
});

// One batched call for every URL the rules could not decide. Returns a map;
// any URL the model omits is left for the caller to default.
export async function classifyByModel(
  urls: string[],
  companyName: string,
  companyDomain?: string,
): Promise<Map<string, Provenance>> {
  if (urls.length === 0) return new Map();

  const { output } = await generateText({
    model: anthropic(process.env.ANTHROPIC_FAST_MODEL || FAST_MODEL),
    system:
      "You label web sources by who controls them, for a vendor-risk brief.\n" +
      "self_published: the company itself controls or paid to distribute it — its own site or " +
      "subdomains, its official social or developer profiles, press-release wires, sponsored posts, " +
      "and listing pages the company writes its own copy for.\n" +
      "independent: a third party the company does not control — news outlets, trade press, court " +
      "records, regulators, government sites, independent reviews and analyst coverage.\n" +
      "Judge by who controls the page, not whether the content is positive. When genuinely unsure, " +
      "answer independent only if a named third party is clearly the publisher; otherwise self_published.",
    prompt:
      `Company: ${companyName}${companyDomain ? ` (${companyDomain})` : ""}\n\n` +
      `Label each URL:\n${urls.map((u) => `- ${u}`).join("\n")}`,
    output: Output.object({ schema }),
  });

  return new Map(output.verdicts.map((v) => [v.url, v.provenance as Provenance]));
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/provenance.ts lib/classify.ts tests/provenance.test.ts
git commit -m "Add rule-based provenance classifier with model tiebreaker"
```

---

### Task 4: Split retrieval into self-published and independent searches

A2's core requirement: the brief must never run out of independent sources because the company's own pages ranked highest. Three searches instead of one, using `includeDomains` / `excludeDomains`. This is also the Exa surface the talk track's Slide 3 table promises ("Self-published and independent sources are labeled separately").

**Files:**
- Modify: `lib/exa.ts` — replace `searchAdverseMedia` (keep `adverseMediaQuery`, which `createExaMonitor` at `lib/exa.ts:218` still uses)

**Interfaces:**
- Consumes: `WIRE_DOMAINS`, `hostOf`, `isGenericHost` from Task 3.
- Produces: `RetrievedSource`; `resolvePrimaryDomain(req)`, `searchSelfPublished(req, domain)`, `searchIndependentAdverse(req, domain?)`, `searchIndependentBackground(req, domain?)`.

- [ ] **Step 1: Replace the retrieval section**

In `lib/exa.ts`, add `import { isGenericHost, hostOf, WIRE_DOMAINS } from "./provenance";` at the top, then replace everything from `export interface MediaResult` through the end of `searchAdverseMedia` with:

```ts
export interface RetrievedSource {
  url: string;
  title?: string;
  publishedDate?: string;
  highlights: string[];
}

const LOOKBACK_YEARS = 3;

export function adverseMediaQuery(companyName: string): string {
  return (
    `${companyName} lawsuit, data breach, settlement, regulatory action, fine, ` +
    `investigation, or executive misconduct`
  );
}

type SearchOpts = Parameters<Exa["search"]>[1];

// Dynamic Highlights is a research preview; fall back to standard highlights.
async function searchWithHighlights(
  query: string,
  opts: SearchOpts,
  highlightQuery: string,
): Promise<RetrievedSource[]> {
  let res;
  try {
    res = await exa().search(query, {
      ...opts,
      contents: { highlights: { dynamic: true, query: highlightQuery } },
      betas: [DYNAMIC_HIGHLIGHTS_BETA],
    });
  } catch {
    res = await exa().search(query, { ...opts, contents: { highlights: true } });
  }

  return res.results.map((r) => ({
    url: r.url,
    title: r.title ?? r.url,
    publishedDate: r.publishedDate,
    highlights: r.highlights ?? [],
  }));
}

const CLAIM_HIGHLIGHTS = "founding year, headquarters, leadership, and what the company sells";

// The company's own account of itself — the claims A3 checks.
export async function searchSelfPublished(
  req: ScreenRequest,
  domain: string,
): Promise<RetrievedSource[]> {
  return searchWithHighlights(
    `${req.companyName} about the company: founding year, headquarters, leadership team, products`,
    { type: "auto", numResults: 8, includeDomains: [domain] },
    CLAIM_HIGHLIGHTS,
  );
}

// Adverse coverage from sources the company does not control.
export async function searchIndependentAdverse(
  req: ScreenRequest,
  domain?: string,
): Promise<RetrievedSource[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - LOOKBACK_YEARS);

  return searchWithHighlights(
    adverseMediaQuery(req.companyName),
    {
      type: "auto",
      category: "news",
      numResults: 12,
      startPublishedDate: since.toISOString(),
      excludeDomains: domain ? [domain, ...WIRE_DOMAINS] : [...WIRE_DOMAINS],
      // includeText accepts a single phrase of up to five words.
      ...(req.companyName.split(/\s+/).length <= 5 ? { includeText: [req.companyName] } : {}),
    },
    "allegations, penalties, and outcomes",
  );
}

// Independent background with NO start date: this is how earliestIndependentMention
// is found, because exa-js exposes no sort-by-date parameter.
export async function searchIndependentBackground(
  req: ScreenRequest,
  domain?: string,
): Promise<RetrievedSource[]> {
  return searchWithHighlights(
    `${req.companyName} company profile: what it does, who founded it, where it is based, funding`,
    {
      type: "auto",
      numResults: 10,
      excludeDomains: domain ? [domain, ...WIRE_DOMAINS] : [...WIRE_DOMAINS],
    },
    CLAIM_HIGHLIGHTS,
  );
}

// Used only when the user did not supply a domain (A1). One cheap search;
// the first result that isn't an aggregator or outlet wins.
export async function resolvePrimaryDomain(req: ScreenRequest): Promise<string | undefined> {
  const res = await exa().search(`${req.companyName} official company website`, {
    type: "auto",
    category: "company",
    numResults: 5,
  });
  for (const r of res.results) {
    const host = hostOf(r.url);
    if (host && !isGenericHost(host)) return host;
  }
  return undefined;
}
```

- [ ] **Step 2: Repoint the local monitor fallback**

`lib/monitors.ts:46` and `lib/monitors.ts:60` call the now-deleted `searchAdverseMedia`. This is the
fallback that powers demo step 6 ("Click Monitor this vendor") when there is no public webhook URL, so
it must keep working. Note `RetrievedSource.title` is optional while `MonitorHit.title` is required.

In `lib/monitors.ts`, change the import on line 3 to:

```ts
import { createExaMonitor, listExaMonitorHits, searchIndependentAdverse } from "./exa";
```

Replace line 46 with:

```ts
  const baseline = await searchIndependentAdverse(req);
```

Replace line 60 with:

```ts
    const results = await searchIndependentAdverse(entry.request);
```

and the `unshift` two lines below it with:

```ts
      entry.hits.unshift({ title: r.title ?? r.url, url: r.url, publishedDate: r.publishedDate });
```

`adverseMediaQuery` is still used by `createExaMonitor` (`lib/exa.ts:222`) and must remain exported.

- [ ] **Step 3: Confirm nothing else referenced the removed export**

Run: `grep -rn "searchAdverseMedia\|MediaResult" app lib scripts`
Expected: hits only in `lib/synthesis.ts` and `app/api/screen/route.ts`, both rewritten in Tasks 6 and 7.

- [ ] **Step 4: Verify the domain exclusion actually works**

Run `npm run dev` and screen a company whose own site normally dominates search results (e.g. `Ramp` with domain `ramp.com`). In the network tab, confirm that no URL returned by the two independent searches is on `ramp.com` or on a press-release wire.

- [ ] **Step 5: Commit**

```bash
git add lib/exa.ts lib/monitors.ts
git commit -m "Split retrieval into self-published and independent searches"
```

---

### Task 5: Pure analysis — footprint, corroboration status, finding tracing

This is the logic that breaks silently on stage, so it is the logic that gets tested. Moving the existing renumbering out of `lib/synthesis.ts` (currently `lib/synthesis.ts:88-113`) is a refactor-before-change: characterize what v1 already does, then extend it.

The corroboration **statuses are computed here, not chosen by the model** — and `independentSupport` is filtered to sources actually labeled `independent`, so the model cannot pass off a company blog post as independent agreement.

**Files:**
- Create: `lib/analysis.ts`, `tests/analysis.test.ts`
- Modify: `lib/synthesis.ts` (delete the moved helpers in Task 6)

**Interfaces:**
- Consumes: `Source`, `Finding`, `FootprintContext`, `CorroborationCheck` from Task 1.
- Produces: `THIN_AGE_MONTHS`, `THIN_SOURCE_COUNT`, `computeFootprint`, `reconcileStatus`, `buildCorroboration`, `traceFindings`, `renumberCitations`, `ModelFinding`, `ModelCorroboration`.

- [ ] **Step 1: Write the failing test**

Create `tests/analysis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildCorroboration,
  computeFootprint,
  reconcileStatus,
  renumberCitations,
  traceFindings,
} from "../lib/analysis";
import type { Source } from "../lib/types";

const src = (id: string, over: Partial<Source> = {}): Source => ({
  id,
  url: `https://example.com/${id}`,
  provenance: "independent",
  classifiedBy: "rule",
  ...over,
});

const NOW = new Date("2026-09-22T00:00:00Z");

describe("computeFootprint", () => {
  it("flags a young company with few sources as a thin record", () => {
    const f = computeFootprint({
      incorporationDate: "2025-01-15",
      independentSources: [{ publishedDate: "2026-02-01" }],
      now: NOW,
    });
    expect(f.ageMonths).toBe(20);
    expect(f.independentSourceCount).toBe(1);
    expect(f.thinRecord).toBe(true);
  });

  it("does not flag an established company with real coverage", () => {
    const f = computeFootprint({
      incorporationDate: "2009-03-01",
      independentSources: Array.from({ length: 8 }, () => ({ publishedDate: "2026-01-01" })),
      now: NOW,
    });
    expect(f.thinRecord).toBe(false);
  });

  it("flags a thin record on source count alone when the date is missing", () => {
    const f = computeFootprint({ independentSources: [{}, {}], now: NOW });
    expect(f.ageMonths).toBeUndefined();
    expect(f.thinRecord).toBe(true);
  });

  it("reports the oldest dated independent mention and ignores undated sources", () => {
    const f = computeFootprint({
      independentSources: [
        { publishedDate: "2026-01-01" },
        {},
        { publishedDate: "2021-06-30" },
        { publishedDate: "2024-05-05" },
      ],
      now: NOW,
    });
    expect(f.earliestIndependentMention).toBe("2021-06-30");
  });
});

describe("reconcileStatus", () => {
  it("returns conflict when anything contradicts, even with support", () => {
    expect(reconcileStatus({ hasRegistryValue: true, supportCount: 3, conflictCount: 1 })).toBe(
      "conflict",
    );
  });

  it("returns corroborated when an independent source agrees", () => {
    expect(reconcileStatus({ hasRegistryValue: false, supportCount: 1, conflictCount: 0 })).toBe(
      "corroborated",
    );
  });

  it("returns registry_only when only the registry agrees", () => {
    expect(reconcileStatus({ hasRegistryValue: true, supportCount: 0, conflictCount: 0 })).toBe(
      "registry_only",
    );
  });

  it("returns uncorroborated when only the company says it", () => {
    expect(reconcileStatus({ hasRegistryValue: false, supportCount: 0, conflictCount: 0 })).toBe(
      "uncorroborated",
    );
  });
});

describe("buildCorroboration", () => {
  it("ignores a self-published source offered as independent support", () => {
    const sources = new Map([
      ["s1", src("s1", { provenance: "self_published" })],
      ["s2", src("s2", { provenance: "self_published" })],
    ]);
    const [check] = buildCorroboration(
      [
        {
          claim: "Founded in 2023",
          selfSourceId: "s1",
          registryValue: null,
          independentSupportIds: ["s2"],
          independentConflictIds: [],
        },
      ],
      sources,
    );
    expect(check.independentSupport).toEqual([]);
    expect(check.status).toBe("uncorroborated");
  });

  it("drops ids that match no retrieved source", () => {
    const sources = new Map([["s1", src("s1")]]);
    const [check] = buildCorroboration(
      [
        {
          claim: "Headquartered in Austin",
          selfSourceId: "nope",
          registryValue: "Austin, TX",
          independentSupportIds: ["s1", "ghost"],
          independentConflictIds: [],
        },
      ],
      sources,
    );
    expect(check.selfSource).toBeUndefined();
    expect(check.independentSupport).toHaveLength(1);
    expect(check.status).toBe("corroborated");
  });
});

describe("traceFindings", () => {
  it("drops findings whose source was never retrieved", () => {
    const sources = new Map([["s1", src("s1")]]);
    const { findings } = traceFindings(
      [
        { sourceId: "s1", headline: "A", summary: "a", severity: "low", category: "other" },
        { sourceId: "ghost", headline: "B", summary: "b", severity: "high", category: "breach" },
      ],
      sources,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].sourceId).toBe("s1");
  });

  it("orders by severity and renumbers f1..fn", () => {
    const sources = new Map([
      ["s1", src("s1", { publishedDate: "2026-01-01" })],
      ["s2", src("s2", { publishedDate: "2026-02-01" })],
    ]);
    const { findings, renumber } = traceFindings(
      [
        { sourceId: "s1", headline: "Low", summary: "l", severity: "low", category: "other" },
        { sourceId: "s2", headline: "High", summary: "h", severity: "high", category: "breach" },
      ],
      sources,
    );
    expect(findings.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(findings[0].headline).toBe("High");
    expect(renumber.get("s2")).toBe("f1");
  });

  it("carries the source's provenance onto the finding", () => {
    const sources = new Map([["s1", src("s1", { provenance: "self_published" })]]);
    const { findings } = traceFindings(
      [{ sourceId: "s1", headline: "A", summary: "a", severity: "low", category: "other" }],
      sources,
    );
    expect(findings[0].sourceProvenance).toBe("self_published");
  });
});

describe("renumberCitations", () => {
  it("rewrites source ids to finding numbers", () => {
    const map = new Map([["s2", "f1"]]);
    expect(renumberCitations("The breach [s2] is active.", map)).toBe(
      "The breach [f1] is active.",
    );
  });

  it("strips citations that did not survive as findings, without leaving a gap", () => {
    const map = new Map([["s2", "f1"]]);
    expect(renumberCitations("Nothing material [s9].", map)).toBe("Nothing material.");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../lib/analysis`.

- [ ] **Step 3: Implement the module**

Create `lib/analysis.ts`:

```ts
import type {
  CorroborationCheck,
  CorroborationStatus,
  Finding,
  FindingCategory,
  FootprintContext,
  Severity,
  Source,
} from "./types";

// Placeholders per A4 — retune from the A9 dry run before the demo.
export const THIN_AGE_MONTHS = 24;
export const THIN_SOURCE_COUNT = 5;

function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return to.getUTCDate() < from.getUTCDate() ? months - 1 : months;
}

// How much evidence exists, stated separately from what the evidence says.
export function computeFootprint(input: {
  incorporationDate?: string;
  independentSources: { publishedDate?: string }[];
  now?: Date;
}): FootprintContext {
  const now = input.now ?? new Date();

  let ageMonths: number | undefined;
  if (input.incorporationDate) {
    const d = new Date(input.incorporationDate);
    if (!Number.isNaN(d.getTime()) && d <= now) ageMonths = monthsBetween(d, now);
  }

  const dates = input.independentSources
    .map((s) => s.publishedDate)
    .filter((d): d is string => !!d)
    .sort();

  const independentSourceCount = input.independentSources.length;

  return {
    ...(input.incorporationDate ? { incorporationDate: input.incorporationDate } : {}),
    ...(ageMonths !== undefined ? { ageMonths } : {}),
    independentSourceCount,
    ...(dates[0] ? { earliestIndependentMention: dates[0] } : {}),
    thinRecord:
      (ageMonths !== undefined && ageMonths < THIN_AGE_MONTHS) ||
      independentSourceCount < THIN_SOURCE_COUNT,
  };
}

// A3's rules, in precedence order. A conflict always wins; registry_only is the
// more specific case of "registry agrees and nothing independent does".
export function reconcileStatus(input: {
  hasRegistryValue: boolean;
  supportCount: number;
  conflictCount: number;
}): CorroborationStatus {
  if (input.conflictCount > 0) return "conflict";
  if (input.supportCount > 0) return "corroborated";
  if (input.hasRegistryValue) return "registry_only";
  return "uncorroborated";
}

export interface ModelCorroboration {
  claim: string;
  selfSourceId: string | null;
  registryValue: string | null;
  independentSupportIds: string[];
  independentConflictIds: string[];
}

function pickIndependent(ids: string[], sourcesById: Map<string, Source>): Source[] {
  const seen = new Set<string>();
  return ids.flatMap((id) => {
    const s = sourcesById.get(id);
    // A source only counts as independent corroboration if it is labeled independent.
    if (!s || s.provenance !== "independent" || seen.has(s.id)) return [];
    seen.add(s.id);
    return [s];
  });
}

export function buildCorroboration(
  checks: ModelCorroboration[],
  sourcesById: Map<string, Source>,
): CorroborationCheck[] {
  return checks.map((c) => {
    const independentSupport = pickIndependent(c.independentSupportIds, sourcesById);
    const independentConflict = pickIndependent(c.independentConflictIds, sourcesById);
    const selfSource = c.selfSourceId ? sourcesById.get(c.selfSourceId) : undefined;
    const registryValue = c.registryValue?.trim() || undefined;

    return {
      claim: c.claim,
      ...(selfSource ? { selfSource } : {}),
      ...(registryValue ? { registryValue } : {}),
      independentSupport,
      independentConflict,
      status: reconcileStatus({
        hasRegistryValue: !!registryValue,
        supportCount: independentSupport.length,
        conflictCount: independentConflict.length,
      }),
    };
  });
}

export interface ModelFinding {
  sourceId: string;
  headline: string;
  summary: string;
  severity: Severity;
  category: FindingCategory;
}

const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "informational"];

// Enforces traceability: a finding survives only if it maps to a retrieved source.
export function traceFindings(
  modelFindings: ModelFinding[],
  sourcesById: Map<string, Source>,
): { findings: Finding[]; renumber: Map<string, string> } {
  const seen = new Set<string>();
  const traced = modelFindings.flatMap((f) => {
    const src = sourcesById.get(f.sourceId);
    if (!src || seen.has(src.id)) return [];
    seen.add(src.id);
    return [
      {
        id: src.id,
        sourceId: src.id,
        sourceProvenance: src.provenance,
        headline: f.headline,
        summary: f.summary,
        url: src.url,
        publishedDate: src.publishedDate,
        severity: f.severity,
        category: f.category,
      } satisfies Finding,
    ];
  });

  traced.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""),
  );

  const renumber = new Map(traced.map((f, i) => [f.sourceId, `f${i + 1}`]));
  return {
    findings: traced.map((f) => ({ ...f, id: renumber.get(f.sourceId)! })),
    renumber,
  };
}

// Rewrites [s3] markers to [f1], dropping citations whose finding didn't survive.
export function renumberCitations(text: string, renumber: Map<string, string>): string {
  return text
    .replace(/\s*\[([^\]]+)\]/g, (_, id: string) => (renumber.has(id) ? ` [${renumber.get(id)}]` : ""))
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 36 tests total.

- [ ] **Step 5: Commit**

```bash
git add lib/analysis.ts tests/analysis.test.ts
git commit -m "Add footprint, corroboration status, and finding tracing"
```

---

### Task 6: Synthesis — corroboration and findings in one call

One Claude call returns findings, the 3–5 corroboration claims, the rationale and the recommendation. Sources are presented grouped by provenance with stable `s` ids, so the model can see which coverage is independent and the A5 rules are enforceable.

**Files:**
- Modify: `lib/synthesis.ts` (substantial rewrite — the post-processing helpers now live in `lib/analysis.ts`)

**Interfaces:**
- Consumes: `traceFindings`, `renumberCitations`, `buildCorroboration`, `ModelFinding`, `ModelCorroboration` from Task 5; `Source` from Task 1.
- Produces: `synthesizeMemo(input): Promise<{ findings: Finding[]; corroboration: CorroborationCheck[]; riskMemo: RiskMemo }>` where `input` is `{ companyName, verification, sources, footprint, searchFailed }`.

- [ ] **Step 1: Replace the file**

Replace `lib/synthesis.ts` entirely:

```ts
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  buildCorroboration,
  renumberCitations,
  traceFindings,
  type ModelCorroboration,
  type ModelFinding,
} from "./analysis";
import type {
  CorroborationCheck,
  Finding,
  FootprintContext,
  RiskMemo,
  Source,
  Verification,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-5";

const analysisSchema = z.object({
  findings: z
    .array(
      z.object({
        sourceId: z.string().describe("The id of the source this finding is drawn from, e.g. s3."),
        headline: z.string().describe("Short factual headline, under 90 characters."),
        summary: z
          .string()
          .describe(
            "1-2 sentences stating only what the source's highlights say, phrased as reported.",
          ),
        severity: z.enum(["high", "medium", "low", "informational"]),
        category: z.enum(["breach", "litigation", "regulatory", "executive", "other"]),
      }),
    )
    .describe("Only genuine adverse findings about this exact company. May be empty."),
  corroboration: z
    .array(
      z.object({
        claim: z
          .string()
          .describe("The company's own claim, stated plainly, e.g. 'Founded in 2023'."),
        selfSourceId: z
          .string()
          .nullable()
          .describe("Id of the self-published source where the company makes this claim."),
        registryValue: z
          .string()
          .nullable()
          .describe("What the registry record says about this claim, or null if it is silent."),
        independentSupportIds: z
          .array(z.string())
          .describe("Ids of independent sources that agree. Empty is normal and fine."),
        independentConflictIds: z
          .array(z.string())
          .describe("Ids of independent sources that contradict the claim."),
      }),
    )
    .min(1)
    .max(5)
    .describe(
      "Check these claims in this order, skipping any the sources do not cover: legal name and " +
        "trading name; year founded or incorporated; headquarters location; named leadership; " +
        "what the company sells.",
    ),
  overallRationale: z
    .string()
    .describe(
      "3-5 plain-language sentences an analyst could defend to an auditor. Cite findings inline " +
        "as [s3] using source ids; brackets are only for source ids.",
    ),
  recommendation: z.enum(["proceed", "proceed_with_caution", "escalate_for_review"]),
});

const SYSTEM = `You are a vendor-risk analyst writing a research memo for a procurement or compliance team.

Evidence rules:
- Use only the verification record and the numbered sources provided. Never add facts from memory.
- Every finding must come from exactly one provided source, referenced by its id. If a source is not
  about this specific company, or is not adverse (e.g. marketing, routine earnings, unrelated
  companies with similar names), leave it out.
- Merge near-duplicate coverage of the same event into one finding, using the most authoritative source.
- Write about adverse items as reported: "Reuters reported that...", not "the company did...".

Provenance rules:
- Sources are grouped by who controls them. SELF-PUBLISHED sources are the company's own or paid
  distribution; they show only what the company CLAIMS, never that the claim is true.
- Never use a self-published source as evidence for a positive claim about the company's
  trustworthiness, security, scale or reputation.
- An adverse finding may come from a self-published source (e.g. the company's own breach notice).
  That is fine; label it by citing that source.
- Absence of independent coverage is INSUFFICIENT EVIDENCE. It is never evidence that the company is
  clean, and you must not describe it as clean.

Corroboration rules:
- Pull the claims from the self-published sources and check each against the registry record and the
  independent sources. Only list independent ids that genuinely address the same claim.
- If an independent source or the registry contradicts a company claim, you MUST say so explicitly in
  overallRationale.

Company-age rules:
- A limited independent record is normal for a young company. Describe it as "a limited independent
  record" and lean on the registry and the corroboration results.
- Youth or a thin record NEVER raises the risk level on its own, and NEVER justifies
  escalate_for_review by itself. Never call a company risky for being young.

Severity and recommendation:
- Severity: high = active breach, major enforcement, fraud, sanctions, or a failed entity status;
  medium = material litigation or regulatory scrutiny; low = minor or resolved matters;
  informational = context worth knowing but not a risk on its own.
- Zero adverse findings is a valid outcome. Say plainly that no adverse coverage was found, and say
  how much independent coverage existed to look through.
- Recommendation: escalate_for_review for any high-severity finding, a watchlist match, a
  corroboration conflict, or an inactive/dissolved entity status; proceed_with_caution for medium
  findings or an unverified identity; otherwise proceed.
- This memo supports a human decision; it is not an approval.`;

function renderSources(sources: Source[], heading: string, empty: string): string {
  if (sources.length === 0) return `${heading}\n${empty}`;
  return [
    heading,
    ...sources.map(
      (s) =>
        `[${s.id}] ${s.title ?? s.url}\nURL: ${s.url}\nPublished: ${s.publishedDate ?? "unknown"}\n` +
        (s.highlights ?? []).map((h) => `> ${h}`).join("\n"),
    ),
  ].join("\n\n");
}

export async function synthesizeMemo(input: {
  companyName: string;
  verification: Verification | null;
  sources: Source[];
  footprint: FootprintContext;
  searchFailed: boolean;
}): Promise<{ findings: Finding[]; corroboration: CorroborationCheck[]; riskMemo: RiskMemo }> {
  const { companyName, verification, sources, footprint, searchFailed } = input;

  const selfPublished = sources.filter((s) => s.provenance === "self_published");
  const independent = sources.filter((s) => s.provenance === "independent");

  const prompt = [
    `Company screened: ${companyName}`,
    "",
    "VERIFICATION RECORD (Baselayer KYB):",
    verification
      ? JSON.stringify(verification, null, 2)
      : "Unavailable: the verification step failed.",
    "",
    "FOOTPRINT CONTEXT (how much evidence exists, not what it says):",
    JSON.stringify(footprint, null, 2),
    "",
    renderSources(
      selfPublished,
      "SELF-PUBLISHED SOURCES (the company's own pages and paid distribution — claims only):",
      "None retrieved.",
    ),
    "",
    renderSources(
      independent,
      "INDEPENDENT SOURCES (third parties the company does not control):",
      searchFailed
        ? "Unavailable: the independent search failed. Treat this as insufficient evidence."
        : "None retrieved. Treat this as insufficient evidence, not as a clean record.",
    ),
  ].join("\n");

  const { output } = await generateText({
    model: anthropic(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL),
    system: SYSTEM,
    prompt,
    output: Output.object({ schema: analysisSchema }),
  });

  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const { findings, renumber } = traceFindings(output.findings as ModelFinding[], sourcesById);
  const corroboration = buildCorroboration(
    output.corroboration as ModelCorroboration[],
    sourcesById,
  );

  return {
    findings,
    corroboration,
    riskMemo: {
      overallRationale: renumberCitations(output.overallRationale, renumber),
      recommendation: output.recommendation,
    },
  };
}
```

- [ ] **Step 2: Confirm the module typechecks in isolation**

Run: `npx tsc --noEmit`
Expected: remaining errors only in `app/api/screen/route.ts` (rewritten next) and the UI components (Task 8).

- [ ] **Step 3: Commit**

```bash
git add lib/synthesis.ts
git commit -m "Add corroboration and provenance rules to the memo synthesis"
```

---

### Task 7: Route orchestration

The long pole is the Baselayer Agent run. Everything web-side — domain resolution, three searches, provenance classification — happens inside that same window, so synthesis stays the only step after it. Demo step 1 ("verification and web research run at the same time") depends on these step events firing as each piece lands.

**Files:**
- Modify: `app/api/screen/route.ts`, `lib/classify.ts` (add `assembleSources`)

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces: `assembleSources(input): Promise<Source[]>`; the v1.1 `ScreenResponse`.

- [ ] **Step 1: Add source assembly to `lib/classify.ts`**

Append the function below to `lib/classify.ts`, moving its three `import` lines up beside the file's existing imports rather than leaving them mid-file:

```ts
import type { RetrievedSource } from "./exa";
import { classifyByRule } from "./provenance";
import type { Source } from "./types";

// Dedupes by URL, classifies by rule, sends only the leftovers to the model, and
// falls back to the retrieval bucket (which includeDomains/excludeDomains already
// decided) if the model call fails or omits a URL.
export async function assembleSources(input: {
  companyName: string;
  domain?: string;
  selfPublished: RetrievedSource[];
  independent: RetrievedSource[];
}): Promise<Source[]> {
  const buckets: { bucket: Source["provenance"]; items: RetrievedSource[] }[] = [
    { bucket: "self_published", items: input.selfPublished },
    { bucket: "independent", items: input.independent },
  ];

  const byUrl = new Map<string, { r: RetrievedSource; bucket: Source["provenance"] }>();
  for (const { bucket, items } of buckets) {
    for (const r of items) {
      const existing = byUrl.get(r.url);
      if (!existing || (r.highlights?.length ?? 0) > (existing.r.highlights?.length ?? 0)) {
        byUrl.set(r.url, { r, bucket: existing?.bucket ?? bucket });
      }
    }
  }

  const entries = [...byUrl.values()];
  const undecided = entries
    .filter(({ r }) => !classifyByRule(r.url, input.domain))
    .map(({ r }) => r.url);

  let modelVerdicts = new Map<string, Source["provenance"]>();
  if (undecided.length > 0) {
    modelVerdicts = await classifyByModel(undecided, input.companyName, input.domain).catch(
      () => new Map(),
    );
  }

  return entries.map(({ r, bucket }, i) => {
    const rule = classifyByRule(r.url, input.domain);
    const model = modelVerdicts.get(r.url);
    const provenance = rule?.provenance ?? model ?? bucket;
    return {
      id: `s${i + 1}`,
      url: r.url,
      title: r.title,
      publishedDate: r.publishedDate,
      provenance,
      // The retrieval bucket is itself deterministic, so a bucket fallback is a rule.
      classifiedBy: rule || !model ? "rule" : "model",
      highlights: r.highlights,
    } satisfies Source;
  });
}
```

- [ ] **Step 2: Rewrite the route body**

In `app/api/screen/route.ts`, replace the imports and the `try` block inside `start(controller)`. Imports become:

```ts
import { computeFootprint } from "@/lib/analysis";
import { allow, cacheKey, getCached, setCached } from "@/lib/cache";
import { assembleSources } from "@/lib/classify";
import {
  resolvePrimaryDomain,
  searchIndependentAdverse,
  searchIndependentBackground,
  searchSelfPublished,
  verifyBusiness,
} from "@/lib/exa";
import { parseScreenRequest } from "@/lib/request";
import { synthesizeMemo } from "@/lib/synthesis";
import type { ResolvedDomain, ScreenEvent, ScreenResponse, Source, Verification } from "@/lib/types";
```

Replace the body of the `try` block (after the `if (cached)` early return) with:

```ts
        const started = Date.now();
        const warnings: string[] = [];

        const kybP = timed(() => verifyBusiness(parsed)).then((r) => {
          send({ type: "step", step: "verification", status: r.error ? "error" : "done", ms: r.ms });
          return r;
        });

        const webP = timed(async () => {
          let domain = parsed.domain;
          let domainSource: ResolvedDomain["domainSource"] = domain ? "user" : "unknown";
          if (!domain) {
            domain = await resolvePrimaryDomain(parsed).catch(() => undefined);
            if (domain) domainSource = "resolved";
          }

          const selfP = timed(() =>
            domain ? searchSelfPublished(parsed, domain) : Promise.resolve([]),
          ).then((r) => {
            send({
              type: "step",
              step: "self_published",
              status: r.error ? "error" : "done",
              ms: r.ms,
            });
            return r;
          });

          const indP = timed(async () => {
            const [adverse, background] = await Promise.all([
              searchIndependentAdverse(parsed, domain),
              searchIndependentBackground(parsed, domain),
            ]);
            return [...adverse, ...background];
          }).then((r) => {
            send({ type: "step", step: "independent", status: r.error ? "error" : "done", ms: r.ms });
            return r;
          });

          const [self, ind] = await Promise.all([selfP, indP]);

          const prov = await timed(() =>
            assembleSources({
              companyName: parsed.companyName,
              domain,
              selfPublished: self.value ?? [],
              independent: ind.value ?? [],
            }),
          );
          send({ type: "step", step: "provenance", status: prov.error ? "error" : "done", ms: prov.ms });

          return {
            resolvedDomain: { ...(domain ? { domain } : {}), domainSource } satisfies ResolvedDomain,
            sources: prov.value ?? [],
            independentFailed: !!ind.error,
            selfFailed: !!self.error,
          };
        });

        const [kyb, web] = await Promise.all([kybP, webP]);

        const verification: Verification = kyb.value ?? {
          verified: false,
          reason: "error",
          detail: message(kyb.error),
        };
        if (kyb.error) warnings.push(`Identity verification failed: ${message(kyb.error)}`);

        const resolvedDomain: ResolvedDomain = web.value?.resolvedDomain ?? {
          domainSource: parsed.domain ? "user" : "unknown",
          ...(parsed.domain ? { domain: parsed.domain } : {}),
        };
        const sources: Source[] = web.value?.sources ?? [];
        if (web.error) warnings.push(`Web research failed: ${message(web.error)}`);
        else if (web.value?.independentFailed) warnings.push("The independent-coverage search failed.");
        else if (web.value?.selfFailed) warnings.push("The company's own pages could not be searched.");

        const footprint = computeFootprint({
          incorporationDate: verification.verified ? verification.incorporationDate : undefined,
          independentSources: sources.filter((s) => s.provenance === "independent"),
        });

        const synth = await timed(() =>
          synthesizeMemo({
            companyName: parsed.companyName,
            verification: kyb.error ? null : verification,
            sources,
            footprint,
            searchFailed: !!web.error || !!web.value?.independentFailed,
          }),
        );
        send({ type: "step", step: "synthesis", status: synth.error ? "error" : "done", ms: synth.ms });
        if (synth.error) warnings.push(`Risk memo synthesis failed: ${message(synth.error)}`);

        const result: ScreenResponse = {
          query: parsed,
          verification,
          resolvedDomain,
          sources,
          corroboration: synth.value?.corroboration ?? [],
          footprint,
          findings: synth.value?.findings ?? [],
          riskMemo: synth.value?.riskMemo ?? {
            recommendation: "escalate_for_review",
            overallRationale:
              "The risk memo could not be generated, so this vendor has not been assessed. " +
              "Review the raw verification data and retry the screening.",
          },
          ...(warnings.length ? { warnings } : {}),
          timings: {
            verificationMs: kyb.ms,
            searchMs: web.ms,
            synthesisMs: synth.ms,
            totalMs: Date.now() - started,
          },
        };

        if (!warnings.length) setCached(key, result);
        send({ type: "result", data: result });
```

- [ ] **Step 3: Verify end to end**

Run `npm run dev` and screen `CDK Global` with domain `cdkglobal.com`. In the network tab, confirm the NDJSON stream contains five `step` events (`verification`, `self_published`, `independent`, `provenance`, `synthesis`) and that the `result` event carries non-empty `sources`, `corroboration` and `footprint`, plus `timings.totalMs`.

Then screen the same company **without** a domain and confirm `resolvedDomain.domainSource` is `"resolved"` and the domain looks right.

- [ ] **Step 4: Commit**

```bash
git add app/api/screen/route.ts lib/classify.ts
git commit -m "Wire provenance, corroboration and footprint through the screen route"
```

---

### Task 8: UI — badges, corroboration table, footprint banner, live timer

A7. This is demo steps 1, 3, 4 and 7. Styling stays quiet: provenance badges and the footprint banner are **labels, not warnings**, and must not read as red flags.

**Files:**
- Create: `app/components/ProvenanceBadge.tsx`, `app/components/CorroborationTable.tsx`, `app/components/FootprintBanner.tsx`
- Modify: `app/components/ScreenProgress.tsx`, `app/components/FindingsList.tsx`, `app/components/VerificationCard.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `Source`, `CorroborationCheck`, `FootprintContext`, `Provenance`, the v1.1 `ScreenResponse`.

- [ ] **Step 1: Provenance badge**

Create `app/components/ProvenanceBadge.tsx`:

```tsx
import type { Provenance } from "@/lib/types";

const LABEL: Record<Provenance, string> = {
  registry: "Registry",
  self_published: "Company-published",
  independent: "Independent",
};

// A label, not a warning: neutral border, muted text, no color coding.
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return (
    <span className="rounded border border-rule px-1.5 py-0.5 text-xs font-normal text-muted">
      {LABEL[provenance]}
    </span>
  );
}
```

- [ ] **Step 2: Footprint banner**

Create `app/components/FootprintBanner.tsx`:

```tsx
import type { FootprintContext } from "@/lib/types";
import { formatDate } from "./FindingsList";

export function FootprintBanner({ footprint }: { footprint: FootprintContext }) {
  if (!footprint.thinRecord) return null;

  const detail = [
    footprint.ageMonths !== undefined && `Registered ${describeAge(footprint.ageMonths)} ago`,
    `${footprint.independentSourceCount} independent ${
      footprint.independentSourceCount === 1 ? "source" : "sources"
    } found`,
    footprint.earliestIndependentMention &&
      `earliest independent mention ${formatDate(footprint.earliestIndependentMention)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-lg border border-rule bg-sheet p-4">
      <p className="font-medium">
        Young company with a limited independent record. This review leans on registry data and
        cross-checks.
      </p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
      <p className="mt-2 text-sm text-muted">
        A limited record is a statement about the evidence, not about the vendor.
      </p>
    </section>
  );
}

function describeAge(months: number): string {
  if (months < 24) return `${months} ${months === 1 ? "month" : "months"}`;
  return `${Math.floor(months / 12)} years`;
}
```

- [ ] **Step 3: Corroboration table**

Create `app/components/CorroborationTable.tsx`:

```tsx
import type { CorroborationCheck, CorroborationStatus, Source } from "@/lib/types";
import { hostname } from "./FindingsList";

const STATUS: Record<CorroborationStatus, { label: string; className: string }> = {
  corroborated: { label: "Corroborated", className: "text-proceed" },
  registry_only: { label: "Registry only", className: "text-muted" },
  uncorroborated: { label: "Not corroborated", className: "text-muted" },
  conflict: { label: "Conflict", className: "text-escalate font-medium" },
};

export function CorroborationTable({ checks }: { checks: CorroborationCheck[] }) {
  if (checks.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Does the independent web agree?</h2>
      <p className="mb-4 max-w-prose text-sm text-muted">
        What the company says about itself, checked against the registry and against sources it
        does not control. &ldquo;Registry only&rdquo; is normal for a young company.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-2 pr-4 font-normal">The company says</th>
              <th className="py-2 pr-4 font-normal">Registry</th>
              <th className="py-2 pr-4 font-normal">Independent</th>
              <th className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.claim} className="border-b border-rule align-top">
                <td className="py-3 pr-4">
                  {c.claim}
                  {c.selfSource && (
                    <SourceLink source={c.selfSource} className="mt-1 block text-xs" />
                  )}
                </td>
                <td className="py-3 pr-4 text-muted">{c.registryValue ?? "—"}</td>
                <td className="py-3 pr-4">
                  {c.independentConflict.length > 0 && (
                    <p className="text-escalate">
                      {c.independentConflict.length} contradicting
                    </p>
                  )}
                  {c.independentSupport.length === 0 && c.independentConflict.length === 0 ? (
                    <span className="text-muted">None found</span>
                  ) : (
                    [...c.independentConflict, ...c.independentSupport].map((s) => (
                      <SourceLink key={s.id} source={s} className="block text-xs" />
                    ))
                  )}
                </td>
                <td className={`py-3 ${STATUS[c.status].className}`}>{STATUS[c.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SourceLink({ source, className }: { source: Source; className?: string }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-accent underline decoration-rule underline-offset-4 hover:decoration-accent ${className ?? ""}`}
    >
      {hostname(source.url)}
    </a>
  );
}
```

- [ ] **Step 4: Badge each finding**

In `app/components/FindingsList.tsx`, add `import { ProvenanceBadge } from "./ProvenanceBadge";`, and inside the metadata row (after the `publishedDate` `<time>` element) add:

```tsx
            <ProvenanceBadge provenance={f.sourceProvenance} />
```

Also change the empty state so it cannot read as "clean" (A5 rule 1). Replace the `findings.length === 0` paragraph with:

```tsx
  if (findings.length === 0) {
    return (
      <p className="max-w-prose text-muted">
        No adverse coverage found in the independent sources retrieved for the last three years.
        That is a good sign, but it is the absence of evidence rather than proof of a clean record —
        check the source count above.
      </p>
    );
  }
```

- [ ] **Step 5: Show the incorporation date on the verification card**

In `app/components/VerificationCard.tsx`, add `import { formatDate } from "./FindingsList";` at the top. The verified branch renders a `<dl>` of `<Item>` elements; widen it and add a fourth.

Change the `<dl>` className from `"mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-3"` to:

```
"mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4"
```

Then add this `<Item>` immediately after the "Registered in" one:

```tsx
        <Item label="Registered on">
          {verification.incorporationDate
            ? formatDate(verification.incorporationDate)
            : "Not reported"}
        </Item>
```

- [ ] **Step 6: Live elapsed timer and the new steps**

In `app/components/ScreenProgress.tsx`, replace the `STEPS` constant and add a timer. New constant:

```tsx
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
  {
    step: "synthesis",
    label: "Writing the risk memo",
    detail: "Claude, citing only the sources found",
  },
];
```

Add at the top of the file:

```tsx
"use client";

import { useEffect, useState } from "react";
```

Add the hook and render it above the list:

```tsx
function useElapsed(): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setMs(Date.now() - start), 100);
    return () => clearInterval(id);
  }, []);
  return ms;
}
```

In `ScreenProgress`, replace the `lookupsDone` line and the returned `<ol>` wrapper with:

```tsx
  const elapsed = useElapsed();
  const lookupsDone = (["verification", "self_published", "independent", "provenance"] as const).every(
    (s) => steps[s].status !== "pending",
  );

  return (
    <div>
      <p className="mb-6 font-mono text-3xl tabular-nums tracking-tight">
        {(elapsed / 1000).toFixed(1)}
        <span className="ml-1 text-base text-muted">s elapsed</span>
      </p>
      <ol className="grid gap-4" aria-live="polite">
```

and close the new wrapper with `</ol></div>` at the end of the return.

The `waiting` condition inside the map also changes: `const waiting = step === "synthesis" && !lookupsDone;` stays correct, but add `|| (step === "provenance" && steps.self_published.status === "pending" && steps.independent.status === "pending")`.

- [ ] **Step 7: Wire it all into the page**

In `app/page.tsx`, update `PENDING` to cover all five steps:

```tsx
const PENDING: Steps = {
  verification: { status: "pending" },
  self_published: { status: "pending" },
  independent: { status: "pending" },
  provenance: { status: "pending" },
  synthesis: { status: "pending" },
};
```

In `Results`, change the `searchFailed` line to match the new warning text, insert the two new sections, and show the total:

```tsx
  const searchFailed = result.warnings?.some((w) => w.includes("search failed")) ?? false;
```

After `<VerificationCard .../>` and before `<RiskMemo .../>`:

```tsx
      <FootprintBanner footprint={result.footprint} />
```

After `<RiskMemo .../>`:

```tsx
      <CorroborationTable checks={result.corroboration} />
```

Replace the timings paragraph with one that leads on the total (demo step 7):

```tsx
      <p className="text-xs text-muted">
        Screened in {(result.timings.totalMs / 1000).toFixed(1)}s — identity{" "}
        {(result.timings.verificationMs / 1000).toFixed(1)}s and web research{" "}
        {(result.timings.searchMs / 1000).toFixed(1)}s in parallel, memo{" "}
        {(result.timings.synthesisMs / 1000).toFixed(1)}s. {result.sources.length} sources,{" "}
        {result.footprint.independentSourceCount} independent.
      </p>
```

Add the imports for `FootprintBanner` and `CorroborationTable`.

- [ ] **Step 8: Verify on screen**

Run: `npm test && npx tsc --noEmit && npm run dev`
Expected: tests pass, no type errors. In the browser, screen a young AI vendor with its domain and confirm: the timer counts up during the run; five steps appear; the footprint banner renders in neutral styling; the corroboration table shows at least one row with a real status; findings carry provenance badges.

- [ ] **Step 9: Commit**

```bash
git add app
git commit -m "Show provenance, corroboration, footprint and elapsed time"
```

---

### Task 9: Fixtures and cached demo mode

A7 and A9. The talk track lists `?demo=cached` as the documented fallback when the network or an API is slow. This is the insurance policy for the live demo — do not skip it.

**Files:**
- Create: `scripts/save-fixture.mjs`, `public/fixtures/` (generated)
- Modify: `package.json`, `app/page.tsx`, `.gitignore` (nothing — fixtures are committed deliberately)

**Interfaces:**
- Produces: `public/fixtures/index.json` mapping company names to saved responses.

- [ ] **Step 1: Write the capture script**

Create `scripts/save-fixture.mjs`:

```js
#!/usr/bin/env node
// Captures a live screening into public/fixtures/ for ?demo=cached replay.
// Usage: npm run fixture -- "CDK Global" --domain cdkglobal.com --state IL
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const companyName = args.find((a) => !a.startsWith("--"));
if (!companyName) {
  console.error('Usage: npm run fixture -- "Company Name" [--domain x.com] [--city X] [--state XX]');
  process.exit(1);
}

const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const base = flag("url") ?? "http://localhost:3000";
const body = {
  companyName,
  ...(flag("domain") ? { domain: flag("domain") } : {}),
  ...(flag("city") ? { city: flag("city") } : {}),
  ...(flag("state") ? { state: flag("state") } : {}),
};

const dir = path.join(process.cwd(), "public", "fixtures");
await mkdir(dir, { recursive: true });

console.log(`Screening ${companyName}...`);
const res = await fetch(`${base}/api/screen`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Request failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}

let result;
let buffer = "";
for await (const chunk of res.body) {
  buffer += new TextDecoder().decode(chunk);
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "step") console.log(`  ${event.step}: ${event.status} (${event.ms}ms)`);
    if (event.type === "result") result = event.data;
    if (event.type === "error") {
      console.error(`  error: ${event.message}`);
      process.exit(1);
    }
  }
}

if (!result) {
  console.error("Stream ended without a result.");
  process.exit(1);
}
if (result.warnings?.length) {
  console.warn("Saved with warnings:", result.warnings);
}

const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const file = `${slug}.json`;
const savedAt = new Date().toISOString();
await writeFile(path.join(dir, file), JSON.stringify({ savedAt, result }, null, 2));

const indexPath = path.join(dir, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8").catch(() => "[]"));
const entry = { companyName, domain: body.domain ?? null, file, savedAt };
const next = [...index.filter((e) => e.file !== file), entry].sort((a, b) =>
  a.companyName.localeCompare(b.companyName),
);
await writeFile(indexPath, JSON.stringify(next, null, 2));

console.log(
  `Saved ${file} — ${result.findings.length} findings, ${result.sources.length} sources, ` +
    `${(result.timings.totalMs / 1000).toFixed(1)}s`,
);
```

Add to `package.json` scripts:

```json
"fixture": "node scripts/save-fixture.mjs"
```

- [ ] **Step 2: Add cached replay to the page**

In `app/page.tsx`, extend the `View` type's `done` variant and add the replay path:

```tsx
  | { kind: "done"; result: ScreenResponse; replayedAt?: string }
```

Add above `Home`:

```tsx
interface FixtureEntry {
  companyName: string;
  domain: string | null;
  file: string;
  savedAt: string;
}

function cachedMode(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "cached"
  );
}

// Returns a saved screening for this company, or null to fall through to a live run.
async function loadFixture(companyName: string) {
  try {
    const index: FixtureEntry[] = await fetch("/fixtures/index.json").then((r) => r.json());
    const match = index.find(
      (e) => e.companyName.trim().toLowerCase() === companyName.trim().toLowerCase(),
    );
    if (!match) return null;
    const saved = await fetch(`/fixtures/${match.file}`).then((r) => r.json());
    return { result: saved.result as ScreenResponse, savedAt: saved.savedAt as string };
  } catch {
    return null;
  }
}
```

At the top of `screen(query)`, before the `fetch`:

```tsx
    if (cachedMode()) {
      const fixture = await loadFixture(query.companyName);
      if (fixture) {
        setView({ kind: "done", result: fixture.result, replayedAt: fixture.savedAt });
        return;
      }
    }
```

Pass the flag into `Results` (`<Results ... replayedAt={view.replayedAt} />`), accept it in the signature, and render at the top of the returned grid:

```tsx
      {replayedAt && (
        <p className="rounded-lg border border-rule bg-sheet p-3 text-sm text-muted">
          Replaying a screening saved on {formatDate(replayedAt)}. Remove{" "}
          <code>?demo=cached</code> from the URL to run live.
        </p>
      )}
```

Import `formatDate` from `./components/FindingsList`.

- [ ] **Step 3: Capture the A9 test set**

With `npm run dev` running in another terminal, and having confirmed the app works live:

```bash
npm run fixture -- "Change Healthcare" --domain changehealthcare.com
npm run fixture -- "CDK Global" --domain cdkglobal.com
npm run fixture -- "<the young AI vendor>" --domain <its-domain>
npm run fixture -- "<a clean mid-size company>" --domain <its-domain>
npm run fixture -- "<a common-name company>"
```

For each, per A9, verify by hand: every cited link opens and supports its claim; provenance labels are right; corroboration statuses make sense; note the total time.

- [ ] **Step 4: Confirm replay works**

Open `http://localhost:3000/?demo=cached`, screen `CDK Global`, and confirm the result appears instantly with the replay note and no network call to `/api/screen`.

- [ ] **Step 5: Retune the thin-record thresholds**

Using the five fixtures, check that `thinRecord` is true for the young vendor and false for Change Healthcare and CDK Global. If not, adjust `THIN_AGE_MONTHS` / `THIN_SOURCE_COUNT` in `lib/analysis.ts`, update the expectations in `tests/analysis.test.ts`, and re-run `npm test`.

- [ ] **Step 6: Commit**

```bash
git add scripts public/fixtures app/page.tsx package.json
git commit -m "Add fixture capture and cached demo mode"
```

---

## Appendix A: Deliberately not built

These are in the addendum or the v1 spec but are **spoken lines in the talk track, not screen time**. Building them costs the day and buys nothing the audience sees.

| Item | Where it lives instead |
| --- | --- |
| MCP `screen_vendor` tool (A8) | The close: "Today a person runs Vetted. Next, their procurement agent calls it as a tool." |
| `agentSummary` field (A8) | Nothing consumes it without the MCP server. |
| Websets entity mapping (v1 §13) | The "what would you build next" answer. |
| Batch multi-vendor screening | Same answer. |
| PDF/markdown export | Same answer. |

If a task finishes early, the highest-value addition is the MCP server — it is the only one that makes the closing line demonstrable rather than asserted. It is a single stdio server wrapping `POST /api/screen`; check the current `@modelcontextprotocol/sdk` API before writing it rather than working from memory.

## Appendix B: Known risks on demo day

- **Baselayer latency dominates.** The Agent run is the long pole and everything else hides behind it. If a dry run exceeds ~60s, that undercuts the "under a minute" line — measure it and adjust the claim to what you actually see rather than the other way round.
- **`incorporationDate` may be null** for many entities. `computeFootprint` handles it, but if it is null for the young vendor, the footprint banner loses its strongest number. Check this during the dry run and pick a demo vendor where Baselayer returns a date.
- **The model tiebreaker can mislabel a source** on screen. The rule lists in `lib/provenance.ts` are the fix: after the dry run, add any host that got labeled wrong to the appropriate list so it is decided by rule.
- **Corroboration can come back thin** if the self-published search returns little. If a fixture has fewer than 3 claims, widen `searchSelfPublished`'s `numResults` or loosen its query before falling back to a different demo vendor.
- **The A10 guardrail still holds:** officer names come from the registry and nothing stores results beyond the in-memory cache and the committed fixtures.

## Appendix C: Spec coverage

| Addendum section | Task |
| --- | --- |
| A1 optional `domain`, `domainSource` | 1, 2, 7 |
| A2 provenance on every source, separate retrieval calls | 3, 4, 7 |
| A3 corroboration check | 5, 6, 8 |
| A4 company age and footprint | 2, 5, 8 |
| A5 synthesis prompt rules | 6 |
| A6 response schema additions | 1, 7 |
| A7 UI additions | 8, 9 |
| A8 agent access | Appendix A (cut) |
| A9 dry-run fixtures | 9 |
| A10 guardrails | Unchanged from v1; re-checked in Appendix B |
| A11 open items | Domain exclusion / date filters / highlights resolved in Global Constraints; Baselayer website resolution in Task 2; `thinRecord` thresholds in Task 9 Step 5; streaming decision: steps stream, memo does not (unchanged from v1) |
