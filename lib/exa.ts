import "server-only";
import Exa, { DYNAMIC_HIGHLIGHTS_BETA } from "exa-js";
import { hostOf, isGenericHost, WIRE_DOMAINS } from "./provenance";
import type { MonitorHit, ScreenRequest, Verification } from "./types";

let client: Exa | undefined;

export function exa(): Exa {
  if (!process.env.EXA_API_KEY) throw new Error("EXA_API_KEY is not set");
  client ??= new Exa(process.env.EXA_API_KEY);
  return client;
}

function describe({ companyName, city, state, domain }: ScreenRequest): string {
  const parts = [`'${companyName}'`];
  if (domain) parts.push(`(website ${domain})`);
  const location = [city, state].filter(Boolean).join(", ");
  if (location) parts.push(`in ${location}`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// KYB verification: Exa Agent run with the Baselayer Exa Connect provider.
// ---------------------------------------------------------------------------

const KYB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["match_status", "officers", "watchlist_hits", "candidates"],
  properties: {
    match_status: { type: "string", enum: ["verified", "no_match", "ambiguous"] },
    legal_name: { type: ["string", "null"] },
    incorporation_state: {
      type: ["string", "null"],
      description: "Two-letter US state of incorporation or formation.",
    },
    entity_status: {
      type: ["string", "null"],
      description: "Registration status as reported, e.g. active, inactive, dissolved.",
    },
    incorporation_date: {
      type: ["string", "null"],
      description: "Date of incorporation or formation as YYYY-MM-DD, if reported.",
    },
    primary_domain: {
      type: ["string", "null"],
      description:
        "The company's primary website domain as a bare host, e.g. acme.ai: no scheme, no www, no path.",
    },
    officers: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "title"],
        properties: { name: { type: "string" }, title: { type: "string" } },
      },
    },
    watchlist_hits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["list", "match"],
        properties: { list: { type: "string" }, match: { type: "boolean" } },
      },
    },
    candidates: {
      type: "array",
      maxItems: 5,
      description: "Only when match_status is ambiguous: the competing entities.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["legal_name"],
        properties: {
          legal_name: { type: "string" },
          location: { type: ["string", "null"] },
        },
      },
    },
    notes: { type: ["string", "null"], maxLength: 300 },
  },
} as const;

interface KybOutput {
  match_status: "verified" | "no_match" | "ambiguous";
  legal_name?: string | null;
  incorporation_state?: string | null;
  entity_status?: string | null;
  incorporation_date?: string | null;
  primary_domain?: string | null;
  officers: { name: string; title: string }[];
  watchlist_hits: { list: string; match: boolean }[];
  candidates: { legal_name: string; location?: string | null }[];
  notes?: string | null;
}

export async function verifyBusiness(req: ScreenRequest): Promise<Verification> {
  const run = await exa().agent.runs.createAndWait(
    {
      query:
        `Verify the US business ${describe(req)} using Baselayer. Return its legal name, ` +
        `state of incorporation, date of incorporation, current entity status, current officers, ` +
        `and primary website domain. Screen it against the ` +
        `OFAC SDN watchlist. Do not run lien or litigation searches.`,
      systemPrompt:
        "Use Baselayer as the source of truth for identity, registration, officers, and watchlist " +
        "data; do not fill these fields from general web pages. Use verified only when Baselayer " +
        "resolves exactly one entity. Use ambiguous when several distinct entities plausibly match " +
        "and list them as candidates. Use no_match when Baselayer finds nothing. Never guess. " +
        "For officers, list each current officer, director, or manager once, with one short title " +
        "(e.g. CEO, President, Treasurer). Exclude registered agents, organizers, tax preparers, " +
        "and real-property contacts. If a website domain is given in the query, use it to " +
        "disambiguate between similarly named entities. Report incorporation_date only if " +
        "Baselayer gives a formation or registration date; never estimate it.",
      dataSources: [{ provider: "baselayer" }],
      effort: "low",
      outputSchema: KYB_SCHEMA,
    },
    { timeoutMs: 120_000 },
  );

  const out = run.output?.structured as KybOutput | undefined;
  if (!out) return { verified: false, reason: "error", detail: "KYB run returned no output" };

  if (out.match_status === "no_match") {
    return { verified: false, reason: "no_match", detail: out.notes ?? undefined };
  }
  if (out.match_status === "ambiguous") {
    return {
      verified: false,
      reason: "ambiguous",
      detail: out.notes ?? undefined,
      candidates: out.candidates.map((c) => ({
        legalName: c.legal_name,
        location: c.location ?? undefined,
      })),
    };
  }
  return {
    verified: true,
    legalName: out.legal_name ?? undefined,
    incorporationState: out.incorporation_state ?? undefined,
    entityStatus: out.entity_status ?? undefined,
    incorporationDate: out.incorporation_date ?? undefined,
    website: out.primary_domain ?? undefined,
    officers: cleanOfficers(out.officers),
    watchlistHits: out.watchlist_hits,
    sourceNote: "baselayer",
  };
}

const NON_OFFICER_ROLE = /real property|tax preparer|registered agent|organizer|incorporator/i;

// Registry data repeats people across filings and mixes in non-officer roles.
function cleanOfficers(officers: KybOutput["officers"]) {
  const seen = new Set<string>();
  return officers.flatMap(({ name, title }) => {
    const primary = title.split(";")[0].trim();
    if (!primary || NON_OFFICER_ROLE.test(primary)) return [];
    // Match "Heather A Lang" with "Heather Anastasia Lang" by first + last name.
    const parts = name.toLowerCase().split(/\s+/);
    const key = `${parts[0]} ${parts[parts.length - 1]}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name: name === name.toUpperCase() ? titleCase(name) : name, title: primary }];
  });
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Adverse-media search.
// ---------------------------------------------------------------------------

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

type SearchOptions = NonNullable<Parameters<Exa["search"]>[1]>;

// Dynamic Highlights is a research preview; fall back to standard highlights.
async function searchWithHighlights(
  query: string,
  options: SearchOptions,
  highlightQuery: string,
): Promise<RetrievedSource[]> {
  let res;
  try {
    res = await exa().search(query, {
      ...options,
      contents: { highlights: { dynamic: true, query: highlightQuery } },
      betas: [DYNAMIC_HIGHLIGHTS_BETA],
    });
  } catch {
    res = await exa().search(query, { ...options, contents: { highlights: true } });
  }

  return res.results.map((r) => ({
    url: r.url,
    title: r.title ?? r.url,
    publishedDate: r.publishedDate,
    highlights: r.highlights ?? [],
  }));
}

const CLAIM_HIGHLIGHTS = "founding year, headquarters, leadership, and what the company sells";

function excluding(domain?: string): string[] {
  return domain ? [domain, ...WIRE_DOMAINS] : WIRE_DOMAINS;
}

// The company's own account of itself: the claims the corroboration step checks.
export function searchSelfPublished(req: ScreenRequest, domain: string) {
  return searchWithHighlights(
    `${req.companyName} about the company: founding year, headquarters, leadership team, products`,
    { type: "auto", numResults: 8, includeDomains: [domain] },
    CLAIM_HIGHLIGHTS,
  );
}

// Adverse coverage from sources the company does not control.
export function searchIndependentAdverse(req: ScreenRequest, domain?: string) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - LOOKBACK_YEARS);

  return searchWithHighlights(
    adverseMediaQuery(req.companyName),
    {
      type: "auto",
      category: "news",
      numResults: 12,
      startPublishedDate: since.toISOString(),
      excludeDomains: excluding(domain),
      // includeText accepts a single phrase of up to five words.
      ...(req.companyName.split(/\s+/).length <= 5 ? { includeText: [req.companyName] } : {}),
    },
    "allegations, penalties, and outcomes",
  );
}

// Independent background with no start date. This is how the earliest independent
// mention is found, since the search API has no sort-by-date option.
export function searchIndependentBackground(req: ScreenRequest, domain?: string) {
  return searchWithHighlights(
    `${req.companyName} company profile: what it does, who founded it, where it is based, funding`,
    { type: "auto", numResults: 10, excludeDomains: excluding(domain) },
    CLAIM_HIGHLIGHTS,
  );
}

// Used only when the user gave no domain: the first result that isn't an
// aggregator, outlet or wire is taken as the company's own site.
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

// ---------------------------------------------------------------------------
// Monitors: recurring adverse-media search, deduplicated by Exa across runs.
// ---------------------------------------------------------------------------

export async function createExaMonitor(req: ScreenRequest, webhookUrl: string) {
  const monitor = await exa().monitors.create({
    name: `Vendor watch: ${req.companyName}`.slice(0, 100),
    search: {
      query: adverseMediaQuery(req.companyName),
      numResults: 10,
      contents: { highlights: true },
    },
    trigger: { type: "interval", period: "1d" },
    metadata: { companyName: req.companyName },
    webhook: { url: webhookUrl, events: ["monitor.run.completed"] },
  });
  // Kick off the first run now so the demo doesn't wait a day for a baseline.
  await exa().monitors.trigger(monitor.id).catch(() => undefined);
  return monitor;
}

export async function listExaMonitorHits(monitorId: string) {
  const runs = await exa().monitors.runs.list(monitorId, { limit: 10 });
  const completed = runs.data.filter((r) => r.status === "completed");
  const hits: MonitorHit[] = completed.flatMap((r) =>
    (r.output?.results ?? []).map((item) => ({
      title: String(item.title ?? item.url),
      url: String(item.url),
      publishedDate: item.publishedDate ? String(item.publishedDate) : undefined,
    })),
  );
  return { hits, lastRunAt: completed[0]?.completedAt ?? undefined };
}
