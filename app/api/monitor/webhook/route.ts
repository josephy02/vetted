import { recordPushedHits, verifyWebhook } from "@/lib/monitors";
import type { MonitorHit } from "@/lib/types";

// Receives `monitor.run.completed` deliveries from Exa Monitors.
export async function POST(req: Request) {
  const raw = await req.text();

  let event: {
    type?: string;
    data?: { monitorId?: string; output?: { results?: Record<string, unknown>[] | null } | null };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const monitorId = event.data?.monitorId;
  if (!monitorId || !verifyWebhook(monitorId, raw, req.headers.get("exa-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type === "monitor.run.completed") {
    const hits: MonitorHit[] = (event.data?.output?.results ?? []).map((r) => ({
      title: String(r.title ?? r.url),
      url: String(r.url),
      publishedDate: r.publishedDate ? String(r.publishedDate) : undefined,
    }));
    recordPushedHits(monitorId, hits);
  }

  return Response.json({ received: true });
}
