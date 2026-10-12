import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { citeText, dataDateText, footerReleaseText } from "../src/lib/export/cite";
import type { ReleaseJson } from "../src/lib/release/release";

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/release/release.json"), "utf8"),
) as ReleaseJson;

describe("data build date (0.5.1)", () => {
  it("the fixture's built_at is the UTC date, YYYY-MM-DD", () => {
    expect(fixture.built_at).toBe("2026-10-07T21:22:23Z");
    expect(dataDateText(fixture)).toBe("2026-10-07");
  });
  it("is null when built_at is absent, null, not a string or malformed", () => {
    expect(dataDateText(null)).toBeNull();
    expect(dataDateText(undefined)).toBeNull();
    expect(dataDateText({ ...fixture, built_at: undefined })).toBeNull();
    expect(dataDateText({ built_at: 20261007 })).toBeNull();
    expect(dataDateText({ built_at: "yesterday" })).toBeNull();
    expect(dataDateText({ built_at: "" })).toBeNull();
  });
  it("accepts a bare date", () => expect(dataDateText({ built_at: "2026-10-07" })).toBe("2026-10-07"));
  it("the citation states it only when given", () => {
    const base = { release: "v20260728", snapshot: "2026-07-28", appVersion: "0.5.1", url: "u" };
    expect(citeText({ ...base, builtAt: "2026-10-07" })).toContain("release v20260728, data built 2026-10-07 (OBIS data as of");
    expect(citeText(base)).toContain("release v20260728 (OBIS data as of");
  });
  it("the citation names the WoRMS version when the release has one (0.9.1)", () => {
    const base = { release: "v20261012", snapshot: "2026-10-11", appVersion: "0.9.1", url: "u" };
    expect(citeText({ ...base, worms: "2026-10-01" })).toContain("(OBIS data as of 2026-10-11; WoRMS 2026-10-01; indicators by");
    expect(citeText(base)).not.toContain("WoRMS 2");
  });
});

describe("footer release text (0.9.1)", () => {
  const base = { snapshot: "2026-10-11", worms: "2026-10-01", res: "res 1 (auto)", version: "0.9.1" };
  it("the OBIS data date, the WoRMS version, resolution and version, in that order", () => {
    expect(footerReleaseText(base)).toBe("OBIS 2026-10-11 · WoRMS 2026-10-01 · res 1 (auto) · v0.9.1");
  });
  it("carries no release id and no data build date (they are in About and Cite this data)", () => {
    expect(footerReleaseText(base)).not.toMatch(/release|data |v2026/);
  });
  it("a release without worms_version (before obisindicators 0.7.2): OBIS only", () => {
    expect(footerReleaseText({ ...base, worms: undefined })).toBe("OBIS 2026-10-11 · res 1 (auto) · v0.9.1");
  });
  it("before release.json loads: the resolution and the version only", () => {
    expect(footerReleaseText({ res: "res 5 (fixed)", version: "0.9.1" })).toBe("res 5 (fixed) · v0.9.1");
  });
});
