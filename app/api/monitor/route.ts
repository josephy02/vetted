import { createMonitor } from "@/lib/monitors";
import { parseScreenRequest } from "@/lib/request";

export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = parseScreenRequest(await req.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });

  try {
    return Response.json(await createMonitor(parsed));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Could not create monitor: ${message}` }, { status: 502 });
  }
}
