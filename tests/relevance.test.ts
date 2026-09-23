import { describe, expect, it } from "vitest";
import { mentionsCompany, relevantHits } from "../lib/relevance";

describe("mentionsCompany", () => {
  it("matches the name as a whole word, ignoring case", () => {
    expect(mentionsCompany("Mercury", ["MERCURY notified customers of a breach"])).toBe(true);
  });

  it("does not match the name inside another word", () => {
    expect(mentionsCompany("Mercury", ["A mercurial CEO steps down"])).toBe(false);
    expect(mentionsCompany("CDK", ["CDKs are a class of enzymes"])).toBe(false);
  });

  it("matches a multi-word name across any whitespace", () => {
    expect(mentionsCompany("CDK Global", ["Ransomware hits CDK Global dealers"])).toBe(true);
  });

  it("ignores a legal suffix in the entered name", () => {
    expect(mentionsCompany("Acme Logistics, Inc.", ["Acme Logistics sued over delays"])).toBe(true);
  });

  it("escapes regex characters in the name", () => {
    expect(mentionsCompany("C3.ai", ["C3.ai faces shareholder suit"])).toBe(true);
    expect(mentionsCompany("C3.ai", ["C3xai is unrelated"])).toBe(false);
  });
});

describe("relevantHits", () => {
  // The four results a "Mercury" monitor actually returned, none about Mercury.
  const unrelated = [
    {
      title: "TradeZero Fined $750,000 After Data Breach Exposes Massachusetts Customers",
      url: "https://massachusettsnewstoday.com/tradezero",
      publishedDate: "2026-09-21",
    },
    {
      title: "$2.8M FinWise Bank Settlement Resolves Lawsuit Over 2024 Data Breach",
      url: "https://www.classaction.org/finwise",
      publishedDate: "2026-09-22",
    },
    {
      title: "Federal Trade Commission approves $100 million settlement with Corpay",
      url: "https://dig.watch/corpay",
      publishedDate: "2026-09-22",
    },
    {
      title: "Credit Acceptance to Pay $700 Million in Debt Relief, Restitution and Penalties",
      url: "https://recordinglaw.com/credit-acceptance",
      publishedDate: "2026-09-21",
    },
  ];

  it("drops results that never name the company", () => {
    expect(relevantHits("Mercury", unrelated)).toEqual([]);
  });

  it("keeps a result that names the company in its title", () => {
    const hit = {
      title: "Mercury notified customers of a February 2025 data breach",
      url: "https://federmanlaw.com/mercury",
      publishedDate: "2025-04-11",
      highlights: ["unrelated passage"],
    };
    expect(relevantHits("Mercury", [...unrelated, hit])).toEqual([
      { title: hit.title, url: hit.url, publishedDate: hit.publishedDate },
    ]);
  });

  it("keeps a result that names the company only in a highlight", () => {
    const hit = {
      title: "Fintech partner banks face new scrutiny",
      url: "https://example.com/banks",
      highlights: ["Regulators questioned how Mercury onboarded overseas customers."],
    };
    expect(relevantHits("Mercury", [hit])).toEqual([{ title: hit.title, url: hit.url }]);
  });

  it("skips results without a URL and falls back to the URL as the title", () => {
    expect(
      relevantHits("Mercury", [
        { title: "Mercury news", url: "" },
        { url: "https://example.com/x", highlights: ["Mercury was fined."] },
      ]),
    ).toEqual([{ title: "https://example.com/x", url: "https://example.com/x" }]);
  });
});
