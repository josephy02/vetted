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

// Social platforms. Anyone can post on them, so only a company page path is
// labeled by rule; posts, articles and personal profiles go to the model.
const SOCIAL_DOMAINS = [
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
];

const COURT_AND_REGULATOR_DOMAINS = [
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

const NEWS_DOMAINS = [
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

const INDEPENDENT_HOSTS = [...COURT_AND_REGULATOR_DOMAINS, ...NEWS_DOMAINS];

function isCompanyPage(host: string, pathname: string): boolean {
  return under(host, "linkedin.com") && /^\/(company|showcase)\//.test(pathname);
}

// True when two domains (or URLs) belong to the same site, subdomains included.
export function sameSite(a: string, b: string): boolean {
  const host = (d: string) => hostOf(d.includes("://") ? d : `https://${d}`);
  const x = host(a);
  const y = host(b);
  return !!x && !!y && (under(x, y) || under(y, x));
}

// True for hosts that can never be a company's own primary site.
export function isGenericHost(host: string): boolean {
  return [...WIRE_DOMAINS, ...SOCIAL_DOMAINS, ...INDEPENDENT_HOSTS].some((d) => under(host, d));
}

// Returns null when no rule applies; the caller sends those to the model.
export function classifyByRule(
  url: string,
  companyDomain?: string,
): { provenance: Provenance; classifiedBy: "rule" } | null {
  const host = hostOf(url);
  if (!host) return null;

  if (companyDomain && under(host, companyDomain)) {
    return { provenance: "self_published", classifiedBy: "rule" };
  }
  if (WIRE_DOMAINS.some((d) => under(host, d)) || isCompanyPage(host, new URL(url).pathname)) {
    return { provenance: "self_published", classifiedBy: "rule" };
  }
  if (
    host.endsWith(".gov") ||
    host.endsWith(".mil") ||
    INDEPENDENT_HOSTS.some((d) => under(host, d))
  ) {
    return { provenance: "independent", classifiedBy: "rule" };
  }
  return null;
}
