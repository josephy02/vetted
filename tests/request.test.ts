import { describe, expect, it } from "vitest";
import { normalizeDomain, parseScreenRequest } from "../lib/request";

describe("normalizeDomain", () => {
  it("accepts a bare domain", () => {
    expect(normalizeDomain("acme.ai")).toBe("acme.ai");
  });

  it("strips scheme, www and path", () => {
    expect(normalizeDomain("https://www.Acme.ai/about?x=1")).toBe("acme.ai");
  });

  it("keeps subdomains that are not www", () => {
    expect(normalizeDomain("app.acme.ai")).toBe("app.acme.ai");
  });

  it("rejects anything without a dot", () => {
    expect(normalizeDomain("acme")).toBeNull();
    expect(normalizeDomain("  ")).toBeNull();
  });

  it("rejects a domain with spaces", () => {
    expect(normalizeDomain("not a domain.com")).toBeNull();
  });
});

describe("parseScreenRequest", () => {
  it("normalizes a supplied domain", () => {
    const parsed = parseScreenRequest({ companyName: "Acme", domain: "HTTPS://www.acme.ai/" });
    expect(parsed).toEqual({ companyName: "Acme", domain: "acme.ai" });
  });

  it("rejects a malformed domain rather than ignoring it", () => {
    expect(parseScreenRequest({ companyName: "Acme", domain: "acme" })).toBe(
      "domain must look like example.com",
    );
  });

  it("still accepts a request with no domain", () => {
    expect(parseScreenRequest({ companyName: "Acme", state: "ca" })).toEqual({
      companyName: "Acme",
      state: "CA",
    });
  });
});
