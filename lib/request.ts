import type { ScreenRequest } from "./types";

// Validates an untrusted JSON body into a ScreenRequest, or returns an error message.
export function parseScreenRequest(body: unknown): ScreenRequest | string {
  if (!body || typeof body !== "object") return "Invalid JSON body";
  const { companyName, city, state } = body as Record<string, unknown>;

  if (typeof companyName !== "string" || !companyName.trim()) return "companyName is required";
  if (companyName.length > 200) return "companyName is too long";
  if (city !== undefined && (typeof city !== "string" || city.length > 100)) return "Invalid city";
  if (state !== undefined && (typeof state !== "string" || !/^[A-Za-z]{2}$/.test(state.trim()))) {
    return "state must be a 2-letter code";
  }

  return {
    companyName: companyName.trim(),
    ...(city?.trim() ? { city: city.trim() } : {}),
    ...(state?.trim() ? { state: state.trim().toUpperCase() } : {}),
  };
}
