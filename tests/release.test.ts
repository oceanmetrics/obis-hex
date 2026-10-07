import { describe, expect, it } from "vitest";
import {
  probeRelease,
  PUBLIC_DATA_BASE,
  resolveDataBase,
  statsSql,
} from "../src/lib/release/release";
import { displaySql, lit, partitionSql } from "../src/lib/engine/sql";

describe("data base resolution", () => {
  const page = "https://oceanmetrics.io/obis-hex/";
  it("defaults to the public release", () =>
    expect(resolveDataBase("", undefined, page)).toBe(PUBLIC_DATA_BASE));
  it("takes ?data= (https) and adds a trailing slash", () =>
    expect(resolveDataBase("?data=https://example.org/rel", undefined, page)).toBe(
      "https://example.org/rel/",
    ));
  it("resolves a same-origin path to an absolute URL", () =>
    expect(resolveDataBase("", "/obis-hex/local-data/", "http://localhost:5173/obis-hex/")).toBe(
      "http://localhost:5173/obis-hex/local-data/",
    ));
  it("refuses http:, relative and credentialed values", () => {
    expect(resolveDataBase("?data=http://evil.example/", undefined, page)).toBe(PUBLIC_DATA_BASE);
    expect(resolveDataBase("?data=./x/", undefined, page)).toBe(PUBLIC_DATA_BASE);
    expect(resolveDataBase("?data=https://u:p@evil.example/", undefined, page)).toBe(
      PUBLIC_DATA_BASE,
    );
  });
});

describe("release.json probe", () => {
  const ok = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("returns the release", async () => {
    const r = await probeRelease("https://x/", { fetchImpl: ok({ release: "v1", layers: {} }) });
    expect(r).toEqual({ ok: true, release: { release: "v1", layers: {} } });
  });
  it("never throws: HTTP error, bad shape, network error", async () => {
    expect((await probeRelease("https://x/", { fetchImpl: ok({}, 403) })).ok).toBe(false);
    expect((await probeRelease("https://x/", { fetchImpl: ok({ nope: 1 }) })).ok).toBe(false);
    const boom = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const r = await probeRelease("https://x/", { fetchImpl: boom });
    expect(r).toEqual({ ok: false, error: "release.json: Failed to fetch" });
  });
});

describe("SQL builders", () => {
  it("quotes literals", () => {
    expect(lit("O'Brien")).toBe("'O''Brien'");
    expect(lit(3)).toBe("3");
    expect(lit(null)).toBe("NULL");
  });
  it("partition SQL reads exactly one file", () => {
    const s = partitionSql("https://x/all/res=3/data_0.parquet");
    expect(s).toContain("read_parquet('https://x/all/res=3/data_0.parquet', hive_partitioning = false)");
    expect(displaySql("https://x/a.parquet", "es")).toContain("SELECT h3, es");
  });
  it("stats SQL keys taxon by rank + name and decade IS NULL for all years", () => {
    const s = statsSql("taxon", { kind: "taxon", rank: "class", taxon: "Aves" }, null, 3, "sp");
    expect(s).toContain("coalesce(key, '') = 'Aves'");
    expect(s).toContain("coalesce(rank, '') = 'class'");
    expect(s).toContain("decade IS NULL");
    expect(statsSql("decade_all", { kind: "all" }, 1990, 2, "es")).toContain("decade = 1990");
  });
});
