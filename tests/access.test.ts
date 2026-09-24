import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { hasAccess } = await import("../lib/access");

const req = (code?: string) =>
  new Request("http://x", { headers: code === undefined ? {} : { "x-access-code": code } });

describe("hasAccess", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows everything when no code is configured", () => {
    vi.stubEnv("ACCESS_CODE", "");
    expect(hasAccess(req())).toBe(true);
  });

  it("requires the configured code", () => {
    vi.stubEnv("ACCESS_CODE", "letmein");
    expect(hasAccess(req("letmein"))).toBe(true);
    expect(hasAccess(req("wrong"))).toBe(false);
    expect(hasAccess(req())).toBe(false);
  });
});
