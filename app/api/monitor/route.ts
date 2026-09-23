import { allow } from "@/lib/cache";
import { createMonitor } from "@/lib/monitors";
import { clientId, parseScreenRequest } from "@/lib/request";

export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = parseScreenRequest(await req.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });

  // Each monitor is a recurring paid Exa search, so creation is throttled like screening.
  if (!allow(`monitor:${clientId(req)}`)) {
    return Response.json(
      { error: "Too many monitors created in the last minute. Please wait and try again." },
      { status: 429 },
    );
  }

  try {
    return Response.json(await createMonitor(parsed));
  } catch (err) {
    console.error("Could not create monitor:", err);
    return Response.json({ error: "Could not create monitor." }, { status: 502 });
  }
}
