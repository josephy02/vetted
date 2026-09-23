import { monitorCompanyName } from "@/lib/exa";
import { recordPushedHits, verifyWebhook } from "@/lib/monitors";
import { relevantHits } from "@/lib/relevance";

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
    const companyName = await monitorCompanyName(monitorId).catch(() => undefined);
    if (!companyName) return Response.json({ error: "Unknown monitor" }, { status: 404 });
    recordPushedHits(monitorId, relevantHits(companyName, event.data?.output?.results ?? []));
  }

  return Response.json({ received: true });
}
