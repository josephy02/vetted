import "server-only";

// In-memory TTL cache and throttle. Baselayer bills per business search, so
// repeat screenings of the same vendor during a demo should not re-bill. This
// lives per server instance, which is enough for a single-session demo.

const TTL_MS = 60 * 60 * 1000;
const store = new Map<string, { value: unknown; expires: number }>();

export function cacheKey(parts: (string | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim().toLowerCase()).join("|");
}

export function getCached<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function setCached(key: string, value: unknown): void {
  store.set(key, { value, expires: Date.now() + TTL_MS });
}

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

// Returns true if the caller is under the limit (and records the call).
export function allow(clientId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(clientId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return false;
  recent.push(now);
  hits.set(clientId, recent);
  return true;
}
