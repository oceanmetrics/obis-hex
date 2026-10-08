import { describe, expect, it, vi } from "vitest";
import {
  dataBaseOverride,
  LATEST_URL,
  probeRelease,
  PUBLIC_DATA_BASE,
  resolveDataBase,
  statsSql,
} from "../src/lib/release/release";
import { displaySql, lit, partitionSql } from "../src/lib/engine/sql";

describe("data base resolution", () => {
  const page = "https://oceanmetrics.io/obis-hex/";
  const NEW = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/v20261101/";
  const latest = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const never = vi.fn(async () => {
    throw new Error("latest.json must not be fetched");
  }) as unknown as typeof fetch;

  it("the fallback constant is the v20260728 release", () =>
    expect(PUBLIC_DATA_BASE).toBe(
      "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/v20260728/",
    ));

  describe("latest.json", () => {
    it("is used when neither ?data= nor VITE_DATA_BASE is set (read with no-cache)", async () => {
      const f = latest({ release: "v20261101", base: NEW, obis_snapshot: "2026-11-01" });
      expect(await resolveDataBase("", undefined, page, { fetchImpl: f })).toBe(NEW);
      expect(f).toHaveBeenCalledWith(LATEST_URL, expect.objectContaining({ cache: "no-cache" }));
    });
    it("adds the trailing slash a base without one lacks", async () =>
      expect(
        await resolveDataBase("", undefined, page, { fetchImpl: latest({ base: NEW.slice(0, -1) }) }),
      ).toBe(NEW));
    it("404 (before the first refresh) falls back to the constant", async () =>
      expect(await resolveDataBase("", undefined, page, { fetchImpl: latest({}, 404) })).toBe(
        PUBLIC_DATA_BASE,
      ));
    it("a network error falls back", async () => {
      const boom = (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch;
      expect(await resolveDataBase("", undefined, page, { fetchImpl: boom })).toBe(PUBLIC_DATA_BASE);
    });
    it("a fetch that never answers times out and falls back", async () => {
      const hang = (() => new Promise(() => {})) as unknown as typeof fetch;
      const t0 = Date.now();
      expect(await resolveDataBase("", undefined, page, { fetchImpl: hang, timeoutMs: 30 })).toBe(
        PUBLIC_DATA_BASE,
      );
      expect(Date.now() - t0).toBeLessThan(1000);
    });
    it("bad JSON, a missing base, an http: or credentialed base all fall back", async () => {
      const text = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
      expect(await resolveDataBase("", undefined, page, { fetchImpl: text })).toBe(PUBLIC_DATA_BASE);
      for (const body of [{ release: "v1" }, { base: 5 }, { base: "http://evil.example/" }, { base: "https://u:p@evil.example/" }, { base: "/local/" }])
        expect(await resolveDataBase("", undefined, page, { fetchImpl: latest(body) })).toBe(PUBLIC_DATA_BASE);
    });
  });

  describe("override precedence (latest.json is not even fetched)", () => {
    it("?data= wins over VITE_DATA_BASE and latest.json", async () =>
      expect(
        await resolveDataBase("?data=https://example.org/rel", "https://env.example/x/", page, { fetchImpl: never }),
      ).toBe("https://example.org/rel/"));
    it("VITE_DATA_BASE wins over latest.json; a same-origin path becomes absolute", async () => {
      expect(
        await resolveDataBase("", "/obis-hex/local-data/", "http://localhost:5173/obis-hex/", { fetchImpl: never }),
      ).toBe("http://localhost:5173/obis-hex/local-data/");
      expect(await resolveDataBase("", "https://env.example/x", page, { fetchImpl: never })).toBe(
        "https://env.example/x/",
      );
    });
    it("an unusable ?data= is skipped, then VITE_DATA_BASE, then latest.json", async () => {
      expect(
        await resolveDataBase("?data=http://evil.example/", "https://env.example/x/", page, { fetchImpl: never }),
      ).toBe("https://env.example/x/");
      expect(await resolveDataBase("?data=./x/", undefined, page, { fetchImpl: latest({ base: NEW }) })).toBe(NEW);
      expect(await resolveDataBase("?data=https://u:p@evil.example/", undefined, page, { fetchImpl: latest({}, 404) })).toBe(
        PUBLIC_DATA_BASE,
      );
    });
  });

  describe("dataBaseOverride (synchronous)", () => {
    it("is null with no override, and the normalized base with one", () => {
      expect(dataBaseOverride("", undefined, page)).toBeNull();
      expect(dataBaseOverride("?data=https://example.org/rel", undefined, page)).toBe("https://example.org/rel/");
    });
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
