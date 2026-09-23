import type { ScreenRequest } from "./types";

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

// Validates an untrusted JSON body into a ScreenRequest, or returns an error message.
export function parseScreenRequest(body: unknown): ScreenRequest | string {
  if (!body || typeof body !== "object") return "Invalid JSON body";
  const { companyName, domain, city, state } = body as Record<string, unknown>;

  if (typeof companyName !== "string" || !companyName.trim()) return "companyName is required";
  if (companyName.length > 200) return "companyName is too long";
  if (city !== undefined && (typeof city !== "string" || city.length > 100)) return "Invalid city";
  if (state !== undefined && (typeof state !== "string" || !/^[A-Za-z]{2}$/.test(state.trim()))) {
    return "state must be a 2-letter code";
  }

  let normalizedDomain: string | undefined;
  if (domain !== undefined) {
    if (typeof domain !== "string") return "Invalid domain";
    if (domain.trim()) {
      const host = normalizeDomain(domain);
      if (!host) return "domain must look like example.com";
      normalizedDomain = host;
    }
  }

  return {
    companyName: companyName.trim(),
    ...(normalizedDomain ? { domain: normalizedDomain } : {}),
    ...(city?.trim() ? { city: city.trim() } : {}),
    ...(state?.trim() ? { state: state.trim().toUpperCase() } : {}),
  };
}
