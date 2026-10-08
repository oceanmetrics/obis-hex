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
    expect(citeText({ ...base, builtAt: "2026-10-07" })).toContain("release v20260728, data built 2026-10-07 (OBIS snapshot");
    expect(citeText(base)).toContain("release v20260728 (OBIS snapshot");
  });
});

describe("footer release text (0.6.1)", () => {
  const base = { snapshot: "2026-07-28", dataDate: "2026-10-07", release: "v20260728", res: "res 1 (auto)", version: "0.6.1" };
  it("snapshot, data date, release, resolution, version, in that order", () => {
    expect(footerReleaseText(base)).toBe("OBIS 2026-07-28 · data 2026-10-07 · release v20260728 · res 1 (auto) · v0.6.1");
  });
  it("leaves the data date out when the release has no built_at", () => {
    expect(footerReleaseText({ ...base, dataDate: null })).toBe("OBIS 2026-07-28 · release v20260728 · res 1 (auto) · v0.6.1");
  });
  it("before release.json loads: the resolution and the version only", () => {
    expect(footerReleaseText({ res: "res 5 (fixed)", version: "0.6.1" })).toBe("res 5 (fixed) · v0.6.1");
  });
});
