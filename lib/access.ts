import "server-only";
import crypto from "node:crypto";

// When ACCESS_CODE is set, live (billed) endpoints require it in the
// x-access-code header. Unset, the app is open, which is the local default.
export function hasAccess(req: Request): boolean {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return true;
  const given = req.headers.get("x-access-code") ?? "";
  // Hashing both sides gives equal-length buffers for the constant-time compare.
  const hash = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(hash(given), hash(expected));
}

export function accessDenied(): Response {
  return Response.json({ error: "This deployment needs an access code for live screenings." }, { status: 401 });
}
