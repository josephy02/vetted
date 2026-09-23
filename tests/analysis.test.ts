import { describe, expect, it } from "vitest";
import {
  buildCorroboration,
  computeFootprint,
  footprintHeadline,
  reconcileStatus,
  renumberCitations,
  traceFindings,
} from "../lib/analysis";
import type { Source } from "../lib/types";

const src = (id: string, over: Partial<Source> = {}): Source => ({
  id,
  url: `https://example.com/${id}`,
  provenance: "independent",
  classifiedBy: "rule",
  ...over,
});

const NOW = new Date("2026-09-22T00:00:00Z");

describe("computeFootprint", () => {
  it("flags a young company with few sources as a thin record", () => {
    const f = computeFootprint({
      incorporationDate: "2025-01-15",
      independentSources: [{ publishedDate: "2026-02-01" }],
      now: NOW,
    });
    expect(f.ageMonths).toBe(20);
    expect(f.independentSourceCount).toBe(1);
    expect(f.thinRecord).toBe(true);
  });

  it("does not flag an established company with real coverage", () => {
    const f = computeFootprint({
      incorporationDate: "2009-03-01",
      independentSources: Array.from({ length: 8 }, () => ({ publishedDate: "2026-01-01" })),
      now: NOW,
    });
    expect(f.thinRecord).toBe(false);
  });

  it("flags a thin record on source count alone when the date is missing", () => {
    const f = computeFootprint({ independentSources: [{}, {}], now: NOW });
    expect(f.ageMonths).toBeUndefined();
    expect(f.thinRecord).toBe(true);
  });

  it("reports the oldest dated independent mention and ignores undated sources", () => {
    const f = computeFootprint({
      independentSources: [
        { publishedDate: "2026-01-01" },
        {},
        { publishedDate: "2021-06-30" },
        { publishedDate: "2024-05-05" },
      ],
      now: NOW,
    });
    expect(f.earliestIndependentMention).toBe("2021-06-30");
  });
});

describe("computeFootprint when the independent search failed", () => {
  it("does not call an established company a thin record just because nothing came back", () => {
    const f = computeFootprint({
      incorporationDate: "2007-10-10",
      independentSources: [],
      searchFailed: true,
      now: NOW,
    });
    expect(f.thinRecord).toBe(false);
  });

  it("still flags a young company on age alone", () => {
    const f = computeFootprint({
      incorporationDate: "2025-06-01",
      independentSources: [],
      searchFailed: true,
      now: NOW,
    });
    expect(f.thinRecord).toBe(true);
  });
});

describe("footprintHeadline", () => {
  it("says young company only when the registry age is under the threshold", () => {
    expect(footprintHeadline({ ageMonths: 21, independentSourceCount: 21, thinRecord: true })).toMatch(
      /^Young company/,
    );
  });

  it("does not call an old company young when only coverage is thin", () => {
    expect(footprintHeadline({ ageMonths: 216, independentSourceCount: 2, thinRecord: true })).toMatch(
      /^Limited independent record/,
    );
  });

  it("does not claim youth when the age is unknown", () => {
    expect(footprintHeadline({ independentSourceCount: 2, thinRecord: true })).toMatch(
      /^Limited independent record/,
    );
  });
});

describe("reconcileStatus", () => {
  it("returns conflict when an independent source contradicts, even with support", () => {
    expect(reconcileStatus({ registry: "agrees", supportCount: 3, conflictCount: 1 })).toBe(
      "conflict",
    );
  });

  it("returns conflict when the registry contradicts and no independent source exists", () => {
    expect(reconcileStatus({ registry: "disagrees", supportCount: 0, conflictCount: 0 })).toBe(
      "conflict",
    );
  });

  it("returns conflict when the registry contradicts despite independent support", () => {
    expect(reconcileStatus({ registry: "disagrees", supportCount: 2, conflictCount: 0 })).toBe(
      "conflict",
    );
  });

  it("returns corroborated when an independent source agrees", () => {
    expect(reconcileStatus({ registry: "silent", supportCount: 1, conflictCount: 0 })).toBe(
      "corroborated",
    );
  });

  it("returns registry_only when only the registry agrees", () => {
    expect(reconcileStatus({ registry: "agrees", supportCount: 0, conflictCount: 0 })).toBe(
      "registry_only",
    );
  });

  it("returns uncorroborated when only the company says it", () => {
    expect(reconcileStatus({ registry: "silent", supportCount: 0, conflictCount: 0 })).toBe(
      "uncorroborated",
    );
  });
});

describe("buildCorroboration", () => {
  it("ignores a self-published source offered as independent support", () => {
    const sources = new Map([
      ["s1", src("s1", { provenance: "self_published" })],
      ["s2", src("s2", { provenance: "self_published" })],
    ]);
    const [check] = buildCorroboration(
      [
        {
          claim: "Founded in 2023",
          selfSourceId: "s1",
          registryValue: null,
          registryAgrees: null,
          independentSupportIds: ["s2"],
          independentConflictIds: [],
        },
      ],
      sources,
    );
    expect(check.independentSupport).toEqual([]);
    expect(check.status).toBe("uncorroborated");
  });

  it("only attributes a claim to a source the rules confirmed the company controls", () => {
    const sources = new Map([
      // A lookalike domain the model tiebreaker labeled self_published.
      ["s1", src("s1", { provenance: "self_published", classifiedBy: "model" })],
      ["s2", src("s2", { provenance: "independent" })],
    ]);
    const [fromLookalike, fromIndependent] = buildCorroboration(
      [
        {
          claim: "Founded in 2025",
          selfSourceId: "s1",
          registryValue: null,
          registryAgrees: null,
          independentSupportIds: [],
          independentConflictIds: [],
        },
        {
          claim: "Headquartered in SF",
          selfSourceId: "s2",
          registryValue: null,
          registryAgrees: null,
          independentSupportIds: [],
          independentConflictIds: [],
        },
      ],
      sources,
    );
    expect(fromLookalike.selfSource).toBeUndefined();
    expect(fromIndependent.selfSource).toBeUndefined();
  });

  it("marks a registry contradiction as a conflict, not registry_only", () => {
    const [check] = buildCorroboration(
      [
        {
          claim: "Incorporated in Delaware as Acme AI, Inc.",
          selfSourceId: null,
          registryValue: "Acme Holdings LLC, Wyoming",
          registryAgrees: false,
          independentSupportIds: [],
          independentConflictIds: [],
        },
      ],
      new Map(),
    );
    expect(check.status).toBe("conflict");
  });

  it("does not treat a registry value as agreement when the model gives no verdict", () => {
    const [check] = buildCorroboration(
      [
        {
          claim: "Headquartered in Austin",
          selfSourceId: null,
          registryValue: "Austin, TX",
          registryAgrees: null,
          independentSupportIds: [],
          independentConflictIds: [],
        },
      ],
      new Map(),
    );
    expect(check.status).toBe("uncorroborated");
  });

  it("drops ids that match no retrieved source", () => {
    const sources = new Map([["s1", src("s1")]]);
    const [check] = buildCorroboration(
      [
        {
          claim: "Headquartered in Austin",
          selfSourceId: "nope",
          registryValue: "Austin, TX",
          registryAgrees: true,
          independentSupportIds: ["s1", "ghost"],
          independentConflictIds: [],
        },
      ],
      sources,
    );
    expect(check.selfSource).toBeUndefined();
    expect(check.independentSupport).toHaveLength(1);
    expect(check.status).toBe("corroborated");
  });
});

describe("traceFindings", () => {
  it("drops findings whose source was never retrieved", () => {
    const sources = new Map([["s1", src("s1")]]);
    const { findings } = traceFindings(
      [
        { sourceId: "s1", headline: "A", summary: "a", severity: "low", category: "other" },
        { sourceId: "ghost", headline: "B", summary: "b", severity: "high", category: "breach" },
      ],
      sources,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].sourceId).toBe("s1");
  });

  it("orders by severity and renumbers f1..fn", () => {
    const sources = new Map([
      ["s1", src("s1", { publishedDate: "2026-01-01" })],
      ["s2", src("s2", { publishedDate: "2026-02-01" })],
    ]);
    const { findings, renumber } = traceFindings(
      [
        { sourceId: "s1", headline: "Low", summary: "l", severity: "low", category: "other" },
        { sourceId: "s2", headline: "High", summary: "h", severity: "high", category: "breach" },
      ],
      sources,
    );
    expect(findings.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(findings[0].headline).toBe("High");
    expect(renumber.get("s2")).toBe("f1");
  });

  it("carries the source's provenance onto the finding", () => {
    const sources = new Map([["s1", src("s1", { provenance: "self_published" })]]);
    const { findings } = traceFindings(
      [{ sourceId: "s1", headline: "A", summary: "a", severity: "low", category: "other" }],
      sources,
    );
    expect(findings[0].sourceProvenance).toBe("self_published");
  });
});

describe("renumberCitations", () => {
  it("rewrites source ids to finding numbers", () => {
    const map = new Map([["s2", "f1"]]);
    expect(renumberCitations("The breach [s2] is active.", map)).toBe(
      "The breach [f1] is active.",
    );
  });

  it("strips source ids the model wrote in parentheses", () => {
    expect(renumberCitations("One search result (s15) concerned another company.", new Map())).toBe(
      "One search result concerned another company.",
    );
  });

  it("strips citations that did not survive as findings, without leaving a gap", () => {
    const map = new Map([["s2", "f1"]]);
    expect(renumberCitations("Nothing material [s9].", map)).toBe("Nothing material.");
  });
});
