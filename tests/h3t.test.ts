// the live AphiaID layer: request URLs, the taxon search parser, the fetch wrapper (status,
// headers, errors) and the 413 fallback, plus the engine reading a real subtree response
// (tests/fixtures/h3t/subtree_137092_res4.parquet: Megaptera novaeangliae, res 4, all years,
// fetched from h3tcache.marinesensitivity.org 2026-10-08: 11,645 cells, 49.7 KB).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getResolution, isValidCell } from "h3-js";
import {
  errorLine,
  fetchSubtree,
  H3T_BASE,
  H3tError,
  isSynonym,
  loadAphiaView,
  parseTaxonInfo,
  parseTaxonSearch,
  probeH3t,
  resolveH3tBase,
  searchUrl,
  subtreeBbox,
  subtreeUrl,
  wormsUrl,
  type FetchLike,
} from "../src/lib/aphia/h3t";
import { Engine } from "../src/lib/engine/engine";
import { viewStats } from "../src/lib/color/ramp";
import { createNodeDb } from "./helpers/nodeDb";

const FIX = resolve(__dirname, "fixtures/h3t");
const B = "https://h3t.example/h3t/";
const PARQUET = new Uint8Array(readFileSync(`${FIX}/subtree_137092_res4.parquet`));

/** a fetch that answers from a table of url → Response factory, logging the URLs asked */
function fakeFetch(routes: (url: string) => Response | Promise<Response>) {
  const asked: string[] = [];
  const f: FetchLike = async (url) => {
    asked.push(url);
    return routes(url);
  };
  return { f, asked };
}
const parquetResponse = () =>
  new Response(PARQUET.slice(), {
    status: 200,
    headers: { "content-type": "application/vnd.apache.parquet", "x-rows": "11645", "x-query-ms": "2396" },
  });
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("subtree request URL", () => {
  it("res, then decade, bbox and format in a fixed order", () => {
    expect(subtreeUrl(B, { aphiaid: 2688, res: 3 })).toBe(`${B}subtree?aphiaid=2688&res=3`);
    expect(subtreeUrl(B, { aphiaid: 2688, res: 4, decade: 1990 })).toBe(`${B}subtree?aphiaid=2688&res=4&decade=1990`);
    expect(subtreeUrl(B, { aphiaid: 137092, res: 7, decade: null, bbox: [-72, 40, -65, 45] })).toBe(
      `${B}subtree?aphiaid=137092&res=7&bbox=-72,40,-65,45`,
    );
    expect(subtreeUrl(B, { aphiaid: 1, res: 6, decade: 2010, bbox: [-122.5, 36, -121.5, 37], format: "json" })).toBe(
      `${B}subtree?aphiaid=1&res=6&decade=2010&bbox=-122.5,36,-121.5,37&format=json`,
    );
    expect(subtreeUrl(B, { aphiaid: 1, res: 2, format: "parquet" })).toBe(`${B}subtree?aphiaid=1&res=2`);
  });

  it("bbox: margin, outward rounding to 0.5°, clamped latitude", () => {
    // Monterey Bay at zoom ~10: 0.4° x 0.2° → +25 % each side → rounded out
    expect(subtreeBbox([-122.1, 36.6, -121.7, 36.8])).toEqual([-122.5, 36.5, -121.5, 37]);
    // small pans inside the same rounding give the same bbox (and so the same cached response)
    expect(subtreeBbox([-122.08, 36.62, -121.68, 36.82])).toEqual(subtreeBbox([-122.1, 36.6, -121.7, 36.8]));
    expect(subtreeBbox([0, 80, 10, 89.9])).toEqual([-2.5, 77.5, 12.5, 90]);
  });

  it("bbox: world copies wrap; across the antimeridian west > east; ≥ 360° is the globe", () => {
    expect(subtreeBbox([190, 10, 200, 20])).toEqual([-172.5, 7.5, -157.5, 22.5]);
    const am = subtreeBbox([170, -20, 190, -10])!;
    expect(am).toEqual([165, -22.5, -165, -7.5]);
    expect(am[0]).toBeGreaterThan(am[2]);
    expect(subtreeBbox([-300, -80, 100, 80])).toEqual([-180, -90, 180, 90]);
    expect(subtreeBbox([10, 0, 10, 5])).toBeNull();
    expect(subtreeBbox([NaN, 0, 10, 5])).toBeNull();
  });

  it("search, taxon and WoRMS links", () => {
    expect(searchUrl(B, " Megaptera n")).toBe(`${B}taxon?q=Megaptera%20n&limit=20`);
    expect(wormsUrl(137092)).toBe("https://www.marinespecies.org/aphia.php?p=taxdetails&id=137092");
  });

  it("service base: default, env, ?h3t= (https or same-origin only)", () => {
    const href = "https://oceanmetrics.io/obis-hex/";
    expect(resolveH3tBase("", undefined, href)).toBe(H3T_BASE);
    expect(resolveH3tBase("", "http://localhost:8889/h3t", href)).toBe("http://localhost:8889/h3t/");
    expect(resolveH3tBase("?h3t=https://h3t.marinesensitivity.org/h3t/", undefined, href)).toBe(
      "https://h3t.marinesensitivity.org/h3t/",
    );
    expect(resolveH3tBase("?h3t=http://evil.example/", undefined, href)).toBe(H3T_BASE);
  });
});

describe("taxon search response", () => {
  const search = JSON.parse(readFileSync(`${FIX}/taxon_q_Megaptera.json`, "utf8"));
  it("parses the live response (accepted first; synonyms point at the accepted id)", () => {
    const hits = parseTaxonSearch(search);
    expect(hits).toHaveLength(20);
    expect(hits[0]).toEqual({
      id: 137014,
      scientificName: "Megaptera",
      rank: "Genus",
      status: "accepted",
      accepted_id: 137014,
      records: 506131,
    });
    const syn = hits.find((h) => h.id === 383694)!;
    expect(syn).toMatchObject({ status: "unaccepted", accepted_id: 137092, records: null });
    expect(isSynonym(syn)).toBe(true);
    expect(isSynonym(hits[1])).toBe(false);
  });
  it("skips malformed rows and never throws", () => {
    expect(parseTaxonSearch(null)).toEqual([]);
    expect(parseTaxonSearch({ taxa: "x" })).toEqual([]);
    expect(parseTaxonSearch({ taxa: [{ id: "1" }, { id: 5, scientificName: "A" }, 7] })).toEqual([
      { id: 5, scientificName: "A", rank: "", status: "", accepted_id: 5, records: null },
    ]);
  });
  it("taxon details", () => {
    const info = parseTaxonInfo(JSON.parse(readFileSync(`${FIX}/taxon_383694.json`, "utf8")))!;
    expect(info).toMatchObject({ id: 383694, scientificName: "Megaptera americana", accepted_id: 137092, parent_id: 137014, children: 0 });
    expect(parseTaxonInfo({ detail: "Not Found" })).toBeNull();
  });
});

describe("fetchSubtree", () => {
  it("returns the bytes, X-Rows and X-Query-Ms", async () => {
    const { f } = fakeFetch(parquetResponse);
    const r = await fetchSubtree(`${B}subtree?aphiaid=137092&res=4`, f);
    expect(r.bytes.byteLength).toBe(49744);
    expect(r.meta).toMatchObject({ bytes: 49744, rows: 11645, queryMs: 2396 });
  });
  it("413 / 400 / 504 carry the server's reason", async () => {
    const reason = "result exceeds 200000 cells; use a coarser res or a smaller bbox";
    await expect(fetchSubtree("u", fakeFetch(() => jsonResponse(413, { reason })).f)).rejects.toMatchObject({ status: 413, message: reason });
    const e400 = await fetchSubtree("u", fakeFetch(() => jsonResponse(400, { error: "bad_request", reason: "bbox (w,s,e,n) is required for res >= 6" })).f).catch((e) => e);
    expect(e400).toBeInstanceOf(H3tError);
    expect(errorLine(e400)).toBe("Subtree request refused: bbox (w,s,e,n) is required for res >= 6");
    expect(errorLine(new H3tError(504, "x"))).toMatch(/timed out on the server/);
    expect(errorLine(new H3tError(413, reason))).toMatch(/zoom in/);
  });
  it("times out on the client with a one-line error", async () => {
    const hang: FetchLike = (_u, init) =>
      new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    const e = await fetchSubtree("u", hang, 20).catch((x) => x);
    expect(e).toMatchObject({ status: 0, message: "subtree service timed out after 0 s" });
    const down: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(errorLine(await fetchSubtree("u", down).catch((x) => x))).toBe(
      "Subtree service: subtree service unreachable: Failed to fetch",
    );
  });
  it("health probe", async () => {
    expect(await probeH3t(B, fakeFetch(() => jsonResponse(200, { ok: true })).f)).toBe(true);
    expect(await probeH3t(B, fakeFetch(() => jsonResponse(502, {})).f)).toBe(false);
    const { f, asked } = fakeFetch(() => jsonResponse(200, { ok: false }));
    expect(await probeH3t(B, f)).toBe(false);
    expect(asked[0]).toMatch(/^https:\/\/h3t\.example\/h3t\/health\?t=\d+$/);
  });
});

describe("engine on a real subtree response", () => {
  const engine = new Engine({ createDb: createNodeDb });
  afterAll(() => engine.dispose());

  it("loads the Parquet into part_cache: valid res-4 cells, all indicators", async () => {
    const url = `${B}subtree?aphiaid=137092&res=4`;
    let calls = 0;
    const p = await engine.loadRemote(url, async () => {
      calls++;
      return PARQUET.slice();
    });
    expect(p.fetched).toBe(true);
    expect(p.rows).toBe(11645);
    expect(p.h3.every((h) => isValidCell(h) && getResolution(h) === 4)).toBe(true);
    expect(new Set(p.h3).size).toBe(p.rows);
    expect(p.values.n.every((v) => v >= 1)).toBe(true);
    expect(p.values.sp.every((v) => v === 1)).toBe(true); // one species
    // ES(50) is NULL (NaN) exactly where n < 50
    const nanEs = p.values.es.filter((v, i) => Number.isNaN(v) && p.values.n[i] < 50).length;
    expect(nanEs).toBe(p.values.es.filter(Number.isNaN).length);
    expect(viewStats(p.values.n).valued).toBe(11645);
    // the second load is the DuckDB cache, no fetch
    const again = await engine.loadRemote(url, async () => {
      calls++;
      return PARQUET.slice();
    });
    expect(again.fetched).toBe(false);
    expect(again.rows).toBe(11645);
    expect(calls).toBe(1);
  });

  it("concurrent loads of one URL fetch once; a failed fetch is not cached", async () => {
    const e = new Engine({ createDb: createNodeDb });
    let calls = 0;
    const fetchIt = async () => {
      calls++;
      return PARQUET.slice();
    };
    const [a, b] = await Promise.all([e.loadRemote("u1", fetchIt), e.loadRemote("u1", fetchIt)]);
    expect(calls).toBe(1);
    expect(a.rows).toBe(b.rows);
    await expect(e.loadRemote("u2", async () => { throw new H3tError(413, "big"); })).rejects.toBeInstanceOf(H3tError);
    expect((await e.loadRemote("u2", fetchIt)).rows).toBe(11645);
    await e.dispose();
  });

  it("loadAphiaView: one global request below res 6, bbox from 6, 413 steps down with a notice", async () => {
    const e = new Engine({ createDb: createNodeDb });
    const { f, asked } = fakeFetch((url) =>
      url.includes("res=4") ? parquetResponse() : jsonResponse(413, { reason: "result exceeds 200000 cells" }),
    );
    const v = await loadAphiaView(e, B, { aphiaid: 137092, res: 5, decade: null, bounds: null }, f);
    expect(asked).toEqual([`${B}subtree?aphiaid=137092&res=5`, `${B}subtree?aphiaid=137092&res=4`]);
    expect(v).toMatchObject({ res: 4, fetched: true, notice: "Over 200,000 cells at res 5 (the service's cap): showing res 4." });
    expect(v.meta).toMatchObject({ rows: 11645, queryMs: 2396, bytes: 49744 });

    // res 7 in a view: bbox requests, then res 5 global (no bbox) after two 413s
    asked.length = 0;
    const v7 = await loadAphiaView(e, B, { aphiaid: 137092, res: 7, decade: 1990, bounds: [-122.1, 36.6, -121.7, 36.8] }, f);
    expect(asked).toEqual([
      `${B}subtree?aphiaid=137092&res=7&decade=1990&bbox=-122.5,36.5,-121.5,37`,
      `${B}subtree?aphiaid=137092&res=6&decade=1990&bbox=-122.5,36.5,-121.5,37`,
      `${B}subtree?aphiaid=137092&res=5&decade=1990`,
      `${B}subtree?aphiaid=137092&res=4&decade=1990`,
    ]);
    expect(v7.res).toBe(4);
    expect(v7.notice).toBe("Over 200,000 cells at res 7 in this view: showing res 4. Zoom in for res 7.");

    // the 413s are remembered: the same view again asks nothing new
    asked.length = 0;
    const again = await loadAphiaView(e, B, { aphiaid: 137092, res: 5, decade: null, bounds: null }, f);
    expect(asked).toEqual([]);
    expect(again).toMatchObject({ res: 4, fetched: false });
    expect(again.meta.queryMs).toBe(2396);

    // res >= 6 without bounds goes straight to res 5; other errors propagate
    const bad = fakeFetch(() => jsonResponse(400, { reason: "aphiaid unknown" }));
    await expect(loadAphiaView(e, B, { aphiaid: 9, res: 6, decade: null, bounds: null }, bad.f)).rejects.toMatchObject({ status: 400 });
    expect(bad.asked).toEqual([`${B}subtree?aphiaid=9&res=5`]);
    await e.dispose();
  });
});
