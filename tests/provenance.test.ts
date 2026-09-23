import { describe, expect, it } from "vitest";
import { classifyByRule, hostOf, isGenericHost, sameSite } from "../lib/provenance";

describe("hostOf", () => {
  it("strips www and lowercases", () => {
    expect(hostOf("https://WWW.Acme.ai/about")).toBe("acme.ai");
  });

  it("returns null for a non-URL", () => {
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("classifyByRule", () => {
  it("labels the company's own domain self_published", () => {
    expect(classifyByRule("https://acme.ai/about", "acme.ai")).toEqual({
      provenance: "self_published",
      classifiedBy: "rule",
    });
  });

  it("labels a subdomain of the company self_published", () => {
    expect(classifyByRule("https://blog.acme.ai/post", "acme.ai")?.provenance).toBe(
      "self_published",
    );
  });

  it("does not match a lookalike domain", () => {
    expect(classifyByRule("https://notacme.ai/about", "acme.ai")).toBeNull();
  });

  it("labels press-release wires self_published", () => {
    expect(classifyByRule("https://www.prnewswire.com/news/x", "acme.ai")?.provenance).toBe(
      "self_published",
    );
  });

  it("labels company social profiles self_published", () => {
    expect(classifyByRule("https://www.linkedin.com/company/acme")?.provenance).toBe(
      "self_published",
    );
  });

  it("labels any .gov independent", () => {
    expect(classifyByRule("https://www.sec.gov/litigation/x")?.provenance).toBe("independent");
  });

  it("labels court records independent", () => {
    expect(classifyByRule("https://www.courtlistener.com/docket/1")?.provenance).toBe(
      "independent",
    );
  });

  it("labels known news outlets independent", () => {
    expect(classifyByRule("https://www.reuters.com/legal/x")?.provenance).toBe("independent");
  });

  it("returns null for an unknown host so the model can decide", () => {
    expect(classifyByRule("https://some-trade-blog.example/post", "acme.ai")).toBeNull();
  });
});

describe("isGenericHost", () => {
  it("is true for aggregators and outlets", () => {
    expect(isGenericHost("linkedin.com")).toBe(true);
    expect(isGenericHost("reuters.com")).toBe(true);
  });

  it("is false for a company site", () => {
    expect(isGenericHost("acme.ai")).toBe(false);
  });
});

describe("sameSite", () => {
  it("matches identical hosts and www variants", () => {
    expect(sameSite("acme.ai", "www.acme.ai")).toBe(true);
  });

  it("matches a subdomain against its parent in either order", () => {
    expect(sameSite("app.acme.ai", "acme.ai")).toBe(true);
    expect(sameSite("acme.ai", "app.acme.ai")).toBe(true);
  });

  it("does not match a lookalike", () => {
    expect(sameSite("thinkingmachines.ai", "thinkingmachineslab.site")).toBe(false);
  });

  it("accepts a registry value given as a URL", () => {
    expect(sameSite("acme.ai", "https://www.acme.ai/")).toBe(true);
  });
});
