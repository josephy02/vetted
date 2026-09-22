import { checkMonitor } from "@/lib/monitors";

export const maxDuration = 60;

// Returns new findings the monitor has surfaced since it was created.
export async function GET(_req: Request, ctx: RouteContext<"/api/monitor/[id]">) {
  const { id } = await ctx.params;
  try {
    const status = await checkMonitor(id);
    if (!status) return Response.json({ error: "Monitor not found" }, { status: 404 });
    return Response.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Could not check monitor: ${message}` }, { status: 502 });
  }
}
