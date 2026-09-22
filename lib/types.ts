// Shared request/response shapes for the screening and monitor APIs (spec §8).

export interface ScreenRequest {
  companyName: string;
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
  sourceNote: "baselayer";
}

export interface UnverifiedBusiness {
  verified: false;
  reason: "no_match" | "ambiguous" | "error";
  detail?: string;
  candidates?: { legalName: string; location?: string }[];
}

export type Verification = VerifiedBusiness | UnverifiedBusiness;

export type Severity = "high" | "medium" | "low" | "informational";
export type FindingCategory = "breach" | "litigation" | "regulatory" | "executive" | "other";

export interface Finding {
  id: string;
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
  findings: Finding[];
  riskMemo: RiskMemo;
  // Human-readable notes about anything that failed or was skipped.
  warnings?: string[];
  timings?: { verificationMs: number; searchMs: number; synthesisMs: number };
}

// /api/screen streams newline-delimited JSON so the UI can show each parallel
// step completing instead of one opaque spinner.
export type ScreenStep = "verification" | "search" | "synthesis";

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
