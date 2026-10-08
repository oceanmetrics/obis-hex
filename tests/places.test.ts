// the gazetteer picker's plain logic (src/lib/places/index.ts) on a small fixture: 12 index rows in
// 4 collections (one id in two collections, one polygon split at the antimeridian, one point) and a
// 3-layer manifest (the fourth collection, boem_pacific_og_leases, is not in the manifest)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROUP_CAP,
  NOISY_COLLECTIONS,
  OBIS_CREDIT,
  POINT_ZOOM,
  cameraFor,
  INDEX_LAYERS_URL,
  LAYERS_URL,
  citationFor,
  directBase,
  loadLayers,
  creditsFor,
  fold,
  groupsFor,
  indexSql,
  isAmbiguous,
  loadIndex,
  matchPlaces,
  parseLayers,
  pmtilesUrl,
  resolveCollection,
  resolvePlace,
  searchPlaces,
  toPlaceRow,
  type PlaceLayer,
  type PlaceRow,
} from "../src/lib/places/index";
import { Engine } from "../src/lib/engine/engine";
import { createNodeDb } from "./helpers/nodeDb";

const dir = resolve(__dirname, "fixtures/places");
const raw = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as Record<string, unknown>[];
const rows: PlaceRow[] = raw.map(toPlaceRow);
const layers: PlaceLayer[] = parseLayers(JSON.parse(readFileSync(`${dir}/layers.json`, "utf8")));

const ids = (rs: PlaceRow[]) => rs.map((r) => r.place_id);
const row = (name: string, collection = "places", place_id = name): PlaceRow =>
  toPlaceRow({ place_id, name, collection, xmin: 0, ymin: 0, xmax: 1, ymax: 1, centroid_lon: 0.5, centroid_lat: 0.5 });

describe("manifest", () => {
  it("keeps the manifest order and rewrites the PMTiles URL to the bucket host", () => {
    expect(layers.map((l) => l.slug)).toEqual(["boem_wind_leases", "places", "boem_wind_planning_rescinded"]);
    for (const l of layers) {
      expect(l.pmtiles).toBe(`https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/${l.slug}/places.pmtiles`);
      expect(l.pmtiles).toBe(pmtilesUrl(l.slug));
    }
    expect(layers[1].place_type).toBeNull();
  });
  it("rewrites the PMTiles URL to base_direct when the manifest has it and a browser can use it", () => {
    const m = (base_direct?: string) => ({ layers: [{ slug: "calcofi_lines", pmtiles: "https://storage.oceanmetrics.io/gazetteer/calcofi_lines/places.pmtiles" }], base_direct });
    expect(parseLayers(m("https://example.org/gz/"))[0].pmtiles).toBe("https://example.org/gz/calcofi_lines/places.pmtiles");
    expect(parseLayers(m("https://example.org/gz"))[0].pmtiles).toBe("https://example.org/gz/calcofi_lines/places.pmtiles");
    expect(parseLayers(m())[0].pmtiles).toBe(pmtilesUrl("calcofi_lines")); // absent: the constant
    expect(parseLayers(m(""))[0].pmtiles).toBe(pmtilesUrl("calcofi_lines"));
  });
  it("regression: a virtual-hosted S3 base_direct with a dot in the bucket (bad certificate) falls back to the constant", () => {
    const bad = "https://oceanmetrics.io-public.s3.amazonaws.com/gazetteer/";
    expect(directBase({ base_direct: bad })).toBe(directBase({}));
    expect(directBase({ base_direct: "http://example.org/gz/" })).toBe(directBase({}));
    expect(directBase({ base_direct: "not a url" })).toBe(directBase({}));
    expect(directBase({ base_direct: "https://mybucket.s3.amazonaws.com/gz/" })).toBe("https://mybucket.s3.amazonaws.com/gz/");
    expect(directBase({ base_direct: "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/" })).toBe(
      "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/",
    );
  });
  it("loads index/layers.json first and falls back to <base>layers.json", async () => {
    const body = readFileSync(`${dir}/layers.json`, "utf8");
    const calls: string[] = [];
    const fake = (fail: string[]) => (async (url: string) => {
      calls.push(url);
      return fail.includes(url) ? ({ ok: false, status: 404 } as Response) : ({ ok: true, status: 200, json: async () => JSON.parse(body) } as Response);
    }) as unknown as typeof fetch;
    expect((await loadLayers(fake([]))).length).toBe(3);
    expect(calls).toEqual([INDEX_LAYERS_URL]);
    calls.length = 0;
    expect((await loadLayers(fake([INDEX_LAYERS_URL]))).length).toBe(3);
    expect(calls).toEqual([INDEX_LAYERS_URL, LAYERS_URL]);
    await expect(loadLayers(fake([INDEX_LAYERS_URL, LAYERS_URL]))).rejects.toThrow(/HTTP 404/);
  });
  it("rejects a manifest with no layers", () => {
    expect(() => parseLayers({ schema: 1 })).toThrow(/no layers/);
  });
});

describe("index rows", () => {
  it("fold removes accents and case", () => {
    expect(fold("Papahānaumokuākea")).toBe("papahanaumokuakea");
    expect(fold("Gray’s Reef")).toBe("gray's reef");
  });
  it("a row carries no attribution and a [w, s, e, n] bbox", () => {
    const r = rows[0];
    expect(r).not.toHaveProperty("attribution");
    expect(r.bbox).toEqual([-74.3, 39.1, -73.9, 39.5]);
    expect(r.hay).toBe("atlantic shores offshore wind boem:ocs-a 0512");
  });
  it("a null bbox falls back to the centroid", () => {
    const r = toPlaceRow({ place_id: "X:1", name: "X", collection: "c", xmin: null, ymin: null, xmax: null, ymax: null, centroid_lon: 3, centroid_lat: 4 });
    expect(r.bbox).toEqual([3, 4, 3, 4]);
  });
  it("the index query selects flat columns, quotes the URL, and leaves the per-row attribution out", () => {
    const sql = indexSql("https://x/it's.parquet");
    expect(sql).toContain("bbox.xmin AS xmin");
    expect(sql).toContain("read_parquet('https://x/it''s.parquet')");
    expect(sql).not.toContain("attribution");
  });
  it("loadIndex runs that query on a real Parquet (struct bbox) through the engine", async () => {
    const engine = new Engine({ createDb: createNodeDb });
    try {
      const got = await loadIndex(engine, `${dir}/index.parquet`);
      expect(got.length).toBe(10);
      const pmnm = got.find((r) => r.place_id === "NMS:PMNM")!;
      expect(pmnm.collection).toBe("places");
      expect(pmnm.bbox[0]).toBeCloseTo(177.84422, 4); // unwrapped across the antimeridian
      expect(pmnm.bbox[2]).toBeCloseTo(198.98269, 4);
      expect(pmnm.name).toBe("Papahānaumokuākea Marine National Monument");
      expect(got.filter((r) => r.place_id === "BOEM:OCS-P 0562").map((r) => r.collection).sort()).toEqual([
        "boem_pacific_og_leases",
        "boem_wind_leases",
      ]);
      expect(got.find((r) => r.place_id === "CALCOFI:line-060.0")?.geom_type).toBe("LineString");
      expect(got.every((r) => !("attribution" in r))).toBe(true);
    } finally {
      await engine.dispose();
    }
  });
});

describe("search", () => {
  it("every word must match the name or the id, case and accents ignored", () => {
    expect(ids(searchPlaces(rows, "monterey bay"))).toEqual(["NMS:MBNMS"]);
    expect(ids(searchPlaces(rows, "PAPAHANAUMOKUAKEA"))).toEqual(["NMS:PMNM"]);
    expect(ids(searchPlaces(rows, "papahānaumokuākea monument"))).toEqual(["NMS:PMNM"]);
    expect(ids(searchPlaces(rows, "tortugas zzz"))).toEqual([]);
    expect(ids(searchPlaces(rows, "ocs-p 0450"))).toEqual(["BOEM:OCS-P 0450"]);
    expect(ids(searchPlaces(rows, "psgid:939"))).toEqual(["PSGID:939"]);
    expect(searchPlaces(rows, "   ")).toEqual([]);
  });
  it("matches across the name and the id (name word + id word)", () => {
    expect(ids(searchPlaces(rows, "golden 0562"))).toEqual(["BOEM:OCS-P 0562"]);
    expect(searchPlaces(rows, "golden 0562")[0].collection).toBe("boem_wind_leases");
  });
  it("ranks exact, then prefix, then word prefix, then substring; ties by shorter name", () => {
    const set = [row("Tailwind Bay"), row("Offshore Wind"), row("Wind Energy Area"), row("Wind"), row("Windy Gap")];
    expect(searchPlaces(set, "wind").map((r) => r.name)).toEqual([
      "Wind", // exact
      "Windy Gap", // prefix, shorter
      "Wind Energy Area", // prefix
      "Offshore Wind", // word prefix
      "Tailwind Bay", // substring
    ]);
  });
  it("an id equal to the query is an exact hit", () => {
    const set = [row("Station 12 north", "c", "ST:12N"), row("ST:12", "c", "ST:12"), row("ST:123", "c", "ST:123")];
    expect(searchPlaces(set, "st:12").map((r) => r.place_id)).toEqual(["ST:12", "ST:123", "ST:12N"]);
  });
  it("limit cuts the ranked list", () => {
    expect(searchPlaces(rows, "wind", { limit: 2 }).length).toBe(2);
    expect(matchPlaces(rows, "wind").length).toBeGreaterThan(2);
  });
});

describe("picker groups", () => {
  it("lists the groups in manifest order with the manifest title, a collection missing from the manifest never shown", () => {
    const g = groupsFor(rows, layers, "");
    expect(g.map((x) => x.slug)).toEqual(["boem_wind_leases", "places"]);
    expect(g.map((x) => x.title)).toEqual(["BOEM offshore wind lease outlines", "Places"]);
    expect(g[0].items.map((r) => r.name)).toEqual(["Atlantic Shores Offshore Wind", "Atlas Wind", "Golden State Wind"]); // by name
    expect(g.every((x) => x.more === 0)).toBe(true);
  });
  it("hides the noisy collections until there is a query", () => {
    expect(NOISY_COLLECTIONS).toContain("boem_wind_planning_rescinded");
    expect(NOISY_COLLECTIONS).toContain("noaa_submarine_cables");
    expect(groupsFor(rows, layers, "").map((x) => x.slug)).not.toContain("boem_wind_planning_rescinded");
    const q = groupsFor(rows, layers, "wind");
    expect(q.map((x) => x.slug)).toEqual(["boem_wind_leases", "boem_wind_planning_rescinded"]);
    expect(q[1].items.length).toBe(2);
  });
  it("a query keeps only groups with matches, best first inside each", () => {
    const g = groupsFor(rows, layers, "wind");
    expect(g[0].items.map((r) => r.name)).toEqual(["Atlas Wind", "Golden State Wind", "Atlantic Shores Offshore Wind"]);
    expect(groupsFor(rows, layers, "monterey").map((x) => x.slug)).toEqual(["places"]);
    expect(groupsFor(rows, layers, "nothing here")).toEqual([]);
  });
  it("caps a group at 50 rows and counts the rest (no query)", () => {
    const many = Array.from({ length: 120 }, (_, i) => row(`Lease ${String(i).padStart(3, "0")}`, "boem_wind_leases", `L:${i}`));
    const [g] = groupsFor([...rows, ...many], layers, "");
    expect(g.slug).toBe("boem_wind_leases");
    expect(g.items.length).toBe(GROUP_CAP);
    expect(g.more).toBe(3 + 120 - GROUP_CAP);
    expect(GROUP_CAP).toBe(50);
  });
  it("keeps the selected place visible even past the cap or in a hidden collection", () => {
    const many = Array.from({ length: 120 }, (_, i) => row(`Lease ${String(i).padStart(3, "0")}`, "boem_wind_leases", `L:${i}`));
    const all = [...rows, ...many];
    const [g] = groupsFor(all, layers, "", { selected: { collection: "boem_wind_leases", place_id: "L:119" } });
    expect(g.items[0].place_id).toBe("L:119");
    expect(g.items.length).toBe(GROUP_CAP + 1);
    const hidden = groupsFor(all, layers, "", { selected: { collection: "boem_wind_planning_rescinded", place_id: "BOEM:WPA-2" } });
    const h = hidden.find((x) => x.slug === "boem_wind_planning_rescinded")!;
    expect(ids(h.items)).toEqual(["BOEM:WPA-2"]);
    expect(h.more).toBe(1);
  });
});

describe("camera", () => {
  const by = (id: string, coll?: string) => rows.find((r) => r.place_id === id && (!coll || r.collection === coll))!;
  it("fits the bbox", () => {
    expect(cameraFor(by("NMS:MBNMS"))).toEqual({ bounds: [-123.14, 35.5, -121.104, 37.882] });
  });
  it("regression: an unwrapped dateline-crosser (Papahānaumokuākea, 177.8 to 199.0) is fitted, not given a hand-set camera", () => {
    expect(cameraFor(by("NMS:PMNM"))).toEqual({ bounds: [177.84422, 19.23, 198.98269390000002, 31.8] });
    expect(by("NMS:PMNM").bbox[2]).toBeGreaterThan(180);
  });
  it("a bbox that still spans -180..180 gets a centre and zoom, never bounds", () => {
    const split = row("Aleutian planning area", "boem_ocs_planning", "BOEM:A");
    split.bbox = [-180, 50, 180, 62];
    split.lon = 175;
    split.lat = 55;
    const cam = cameraFor(split);
    expect("bounds" in cam).toBe(false);
    expect(cam).toHaveProperty("center", [175, 55]);
    expect((cam as { zoom: number }).zoom).toBeGreaterThanOrEqual(1.2);
    expect((cam as { zoom: number }).zoom).toBeLessThanOrEqual(5);
    split.bbox = [-179.95, 50, 179.99, 62]; // the 12 still-split rows are within 0.1 degree of the edge
    expect("bounds" in cameraFor(split)).toBe(false);
    split.bbox = [-170, 50, 170, 62]; // wide but not split: fitted
    expect("bounds" in cameraFor(split)).toBe(true);
  });
  it("a single point gets its position and POINT_ZOOM (8: the station tiles hold every point from z3)", () => {
    expect(POINT_ZOOM).toBe(8);
    expect(cameraFor(by("CALCOFI:station-093.3-030.0"))).toEqual({ center: [-120.8, 34.5], zoom: POINT_ZOOM });
  });
});

describe("ids shared between collections", () => {
  it("resolveCollection takes the stated collection, else the first that has the id", () => {
    expect(isAmbiguous(rows, "BOEM:OCS-P 0562")).toBe(true);
    expect(isAmbiguous(rows, "NMS:MBNMS")).toBe(false);
    expect(resolveCollection("BOEM:OCS-P 0562", rows, "boem_pacific_og_leases")).toBe("boem_pacific_og_leases");
    expect(resolveCollection("BOEM:OCS-P 0562", rows, "boem_wind_leases")).toBe("boem_wind_leases");
    expect(resolveCollection("BOEM:OCS-P 0562", rows)).toBe("boem_wind_leases"); // index order
    expect(resolveCollection("BOEM:OCS-P 0562", rows, "places")).toBe("boem_wind_leases"); // stale pc
    expect(resolveCollection("NMS:MBNMS", rows, "boem_wind_leases")).toBe("places");
  });
  it("an old pl=NMS:... link resolves through the index; an unknown id is null", () => {
    expect(resolveCollection("NMS:PMNM", rows)).toBe("places");
    expect(resolvePlace("PSGID:939", rows)?.name).toBe("Tortugas Ecological Reserve");
    expect(resolveCollection("NMS:NOPE", rows)).toBeNull();
    expect(resolvePlace("NMS:NOPE", rows, "places")).toBeNull();
  });
});

describe("credits", () => {
  it("is the collection's attribution_html, prefixed, with links opening in a new tab", () => {
    const c = creditsFor("boem_wind_leases", layers);
    expect(c.startsWith("Places: ")).toBe(true);
    expect(c).toContain('<a href="https://www.boem.gov/renewable-energy" target="_blank" rel="noopener">BOEM</a>');
    expect(c).toContain("Processed by Ocean Metrics.");
  });
  it("a link already credited by the map (OBIS) stays plain text", () => {
    const c = creditsFor("places", layers, [OBIS_CREDIT]);
    expect(c).not.toContain('href="https://obis.org"');
    expect(c).toContain(", OBIS, ");
    expect(c).toContain('href="https://sanctuaries.noaa.gov" target="_blank"');
    expect(creditsFor("places", layers)).toContain('href="https://obis.org"');
  });
  it("is empty for no collection or one the manifest does not list", () => {
    expect(creditsFor(null, layers)).toBe("");
    expect(creditsFor("boem_pacific_og_leases", layers)).toBe("");
  });
  it("citationFor gives the About text of the selected collection", () => {
    expect(citationFor("places", layers)).toEqual({
      title: "Places",
      citation: "NOAA ONMS, MarineRegions.org, ProtectedSeas. Places, v1.0.0. Ocean Metrics gazetteer, 2026.",
      license: "CC-BY-4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
    });
    expect(citationFor(null, layers)).toBeNull();
  });
});
