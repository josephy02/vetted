// Shared request/response shapes for the screening and monitor APIs (spec §8).

export interface ScreenRequest {
  companyName: string;
  domain?: string; // bare host, e.g. acme.ai
  city?: string;
  state?: string; // 2-letter
}

export interface Officer {
  name: string;
  title: string;
}

export interface WatchlistHit {
  list: string;
  match: boolean;
}

export interface VerifiedBusiness {
  verified: true;
  legalName?: string;
  incorporationState?: string;
  entityStatus?: string;
  officers?: Officer[];
  watchlistHits?: WatchlistHit[];
  incorporationDate?: string;
  website?: string;
  sourceNote: "baselayer";
}

export interface UnverifiedBusiness {
  verified: false;
  reason: "no_match" | "ambiguous" | "error";
  detail?: string;
  candidates?: { legalName: string; location?: string }[];
}

export type Verification = VerifiedBusiness | UnverifiedBusiness;

// Who controls a source (addendum A2).
export type Provenance = "registry" | "self_published" | "independent";

export interface Source {
  id: string; // stable across the response, s1..sN, assigned at retrieval
  url: string;
  title?: string;
  publishedDate?: string;
  provenance: Provenance;
  classifiedBy: "rule" | "model";
  highlights?: string[];
}

export type CorroborationStatus = "corroborated" | "registry_only" | "uncorroborated" | "conflict";

export interface CorroborationCheck {
  claim: string;
  selfSource?: Source;
  registryValue?: string;
  independentSupport: Source[];
  independentConflict: Source[];
  status: CorroborationStatus;
}

// How much evidence exists, separate from what the evidence says (A4).
export interface FootprintContext {
  incorporationDate?: string;
  ageMonths?: number;
  independentSourceCount: number;
  earliestIndependentMention?: string;
  thinRecord: boolean;
}

// `domain` is optional so "unknown" can be represented rather than omitted.
export interface ResolvedDomain {
  domain?: string;
  domainSource: "user" | "resolved" | "unknown";
}

export type Severity = "high" | "medium" | "low" | "informational";
export type FindingCategory = "breach" | "litigation" | "regulatory" | "executive" | "other";

export interface Finding {
  id: string; // display id, f1..fn, matching the memo's citations
  sourceId: string; // the stable Source.id this finding is drawn from
  sourceProvenance: Provenance;
  headline: string;
  summary: string;
  url: string;
  publishedDate?: string;
  severity: Severity;
  category: FindingCategory;
}

export type Recommendation = "proceed" | "proceed_with_caution" | "escalate_for_review";

export interface RiskMemo {
  overallRationale: string;
  recommendation: Recommendation;
}

export interface ScreenResponse {
  query: ScreenRequest;
  verification: Verification;
  resolvedDomain: ResolvedDomain;
  sources: Source[];
  corroboration: CorroborationCheck[];
  footprint: FootprintContext;
  findings: Finding[];
  riskMemo: RiskMemo;
  // Human-readable notes about anything that failed or was skipped.
  warnings?: string[];
  timings: { verificationMs: number; searchMs: number; synthesisMs: number; totalMs: number };
}

// /api/screen streams newline-delimited JSON so the UI can show each parallel
// step completing instead of one opaque spinner.
export type ScreenStep =
  | "verification"
  | "self_published"
  | "independent"
  | "provenance"
  | "synthesis";

export type ScreenEvent =
  | { type: "step"; step: ScreenStep; status: "done" | "error"; ms: number }
  | { type: "result"; data: ScreenResponse }
  | { type: "error"; message: string };

export interface MonitorResponse {
  monitorId: string;
  status: "active";
  mode: "exa" | "local";
  nextCheck?: string;
}

// A normalized new-result hit surfaced by a monitor run.
export interface MonitorHit {
  title: string;
  url: string;
  publishedDate?: string;
}

export interface MonitorStatusResponse {
  monitorId: string;
  mode: "exa" | "local";
  lastRunAt?: string;
  hits: MonitorHit[];
}
