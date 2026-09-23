import "server-only";
import crypto from "node:crypto";
import { createExaMonitor, listExaMonitorHits, searchIndependentAdverse } from "./exa";
import type { MonitorHit, MonitorResponse, MonitorStatusResponse, ScreenRequest } from "./types";

// In-memory state for this server instance. Exa Monitors keep their own run
// history, so only webhook secrets and pushed hits live here; the local
// fallback keeps its baseline here too.

interface LocalMonitor {
  request: ScreenRequest;
  seenUrls: Set<string>;
  hits: MonitorHit[];
  lastRunAt: string;
}

const local = new Map<string, LocalMonitor>();
const webhookSecrets = new Map<string, string>();
const pushedHits = new Map<string, MonitorHit[]>();

function publicOrigin(): string | undefined {
  const url =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);
  return url?.startsWith("https://") ? url.replace(/\/$/, "") : undefined;
}

export async function createMonitor(req: ScreenRequest): Promise<MonitorResponse> {
  const origin = publicOrigin();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  if (origin) {
    const monitor = await createExaMonitor(req, `${origin}/api/monitor/webhook`);
    webhookSecrets.set(monitor.id, monitor.webhookSecret);
    return {
      monitorId: monitor.id,
      status: "active",
      mode: "exa",
      nextCheck: monitor.nextRunAt ?? tomorrow,
    };
  }

  // Fallback: record today's results as the baseline and diff on each check.
  const baseline = await searchIndependentAdverse(req, req.domain);
  const id = `local_${crypto.randomUUID()}`;
  local.set(id, {
    request: req,
    seenUrls: new Set(baseline.map((r) => r.url)),
    hits: [],
    lastRunAt: new Date().toISOString(),
  });
  return { monitorId: id, status: "active", mode: "local", nextCheck: tomorrow };
}

export async function checkMonitor(id: string): Promise<MonitorStatusResponse | null> {
  const entry = local.get(id);
  if (entry) {
    const results = await searchIndependentAdverse(entry.request, entry.request.domain);
    for (const r of results) {
      if (entry.seenUrls.has(r.url)) continue;
      entry.seenUrls.add(r.url);
      entry.hits.unshift({ title: r.title ?? r.url, url: r.url, publishedDate: r.publishedDate });
    }
    entry.lastRunAt = new Date().toISOString();
    return { monitorId: id, mode: "local", lastRunAt: entry.lastRunAt, hits: entry.hits };
  }

  if (id.startsWith("local_")) return null;
  const { hits, lastRunAt } = await listExaMonitorHits(id);
  const pushed = pushedHits.get(id) ?? [];
  const seen = new Set(hits.map((h) => h.url));
  return {
    monitorId: id,
    mode: "exa",
    lastRunAt,
    hits: [...pushed.filter((h) => !seen.has(h.url)), ...hits],
  };
}

// Verifies an `Exa-Signature: t=<ts>,v1=<hex>` header over `<ts>.<raw body>`.
export function verifyWebhook(monitorId: string, rawBody: string, header: string | null): boolean {
  const secret = webhookSecrets.get(monitorId);
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest();
  const actual = Buffer.from(parts.v1, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function recordPushedHits(monitorId: string, hits: MonitorHit[]): void {
  pushedHits.set(monitorId, [...hits, ...(pushedHits.get(monitorId) ?? [])]);
}
