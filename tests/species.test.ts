// the species in one hexagon: the cell endpoint's URL, its parser, the fetch (cache, errors, abort),
// the totals check and the table helpers, against real responses (tests/fixtures/h3t/cell_*.json,
// made 2026-10-15 by the h3t /h3t/cell endpoint on the Mac mini over obis_h3_global_v20260728):
//   872834c65ffffff (res 7, Monterey Bay), all taxa: 54 species, 4,885 records = idx_h3 n, sp
//   852834c7fffffff (res 5), eov=marineMammals, decade=2010: 17 species, 3,638 records = the
//     store's n and sp for that EOV and decade
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { H3tError, type FetchLike } from "../src/lib/aphia/h3t";
import {
  cellSpeciesUrl,
  filterSpecies,
  loadCellSpecies,
  obisChecklistUrl,
  parseCellSpecies,
  sortSpecies,
  speciesCsv,
  speciesCsvName,
  speciesErrorLine,
  storeRelease,
  totalsNote,
  yearsText,
  type CellSpeciesList,
} from "../src/lib/cell/species";

const FIX = resolve(__dirname, "fixtures/h3t");
const ALL = JSON.parse(readFileSync(`${FIX}/cell_872834c65ffffff.json`, "utf8"));
const MAM = JSON.parse(readFileSync(`${FIX}/cell_852834c7fffffff_eov-marineMammals_decade-2010.json`, "utf8"));
const B = "https://h3t.example/h3t/";

const list = (j: unknown) => parseCellSpecies(j) as CellSpeciesList;

function fakeFetch(routes: (url: string) => Response | Promise<Response>) {
  const asked: string[] = [];
  const f: FetchLike = async (url) => {
    asked.push(url);
    return routes(url);
  };
  return { f, asked };
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("cellSpeciesUrl", () => {
  const h3 = "872834C65FFFFFF";
  it("puts the parameters in a fixed order, one layer filter each", () => {
    expect(cellSpeciesUrl(B, { h3, sel: { kind: "all" }, decade: null, release: "v20260728" })).toBe(
      `${B}cell?h3=872834c65ffffff&release=v20260728`,
    );
    expect(cellSpeciesUrl(B, { h3, sel: { kind: "eov", eov: "marineMammals" }, decade: 2010, release: "v20260728" })).toBe(
      `${B}cell?h3=872834c65ffffff&eov=marineMammals&decade=2010&release=v20260728`,
    );
    expect(cellSpeciesUrl(B, { h3, sel: { kind: "aphia", id: 2688 }, decade: null, release: null })).toBe(
      `${B}cell?h3=872834c65ffffff&aphiaid=2688`,
    );
  });
  it("encodes a taxon name once", () => {
    expect(
      cellSpeciesUrl(B, { h3, sel: { kind: "taxon", rank: "phylum", taxon: "Apicomplexa incertae sedis" }, decade: null, release: null }),
    ).toBe(`${B}cell?h3=872834c65ffffff&rank=phylum&taxon=Apicomplexa%20incertae%20sedis`);
  });
});

describe("parseCellSpecies", () => {
  it("reads a real response; the list adds up to the hexagon's indicators", () => {
    const l = list(ALL);
    expect([l.h3, l.res, l.store]).toEqual(["872834c65ffffff", 7, "obis_h3_global_v20260728.duckdb"]);
    expect([l.n, l.sp]).toEqual([4885, 54]); // idx_h3 res 7 for this cell
    expect(l.species[0]).toEqual({
      species: "Megaptera novaeangliae", aphiaid: 137092, phylum: "Chordata", class: "Mammalia",
      order: "Cetartiodactyla", family: "Balaenopteridae", records: 3948, year_min: 1992, year_max: 2026,
    });
    expect(l.species.filter((s) => s.year_min === null)).toHaveLength(2);
    const m = list(MAM);
    expect([m.n, m.sp, m.species[0].records]).toEqual([3638, 17, 2910]);
    expect(m.species.every((s) => s.year_min! >= 2010 && s.year_max! <= 2019)).toBe(true);
  });
  it("never throws: not a list is null, malformed rows are dropped and the totals recounted", () => {
    for (const bad of [null, 42, "x", {}, { h3: "8", res: 7 }, { h3: "8", res: "7", species: [] }]) expect(parseCellSpecies(bad)).toBeNull();
    const l = list({ h3: "8", res: 7, n: 999, sp: 9, species: [{ species: "A b", records: 3 }, { species: "", records: 1 }, { records: 2 }, null] });
    expect([l.n, l.sp, l.store, l.species[0].year_min, l.species[0].aphiaid]).toEqual([3, 1, "", null, null]);
  });
});

describe("totalsNote", () => {
  const l = list(ALL);
  it("is empty when the list matches the hexagon", () => {
    expect(totalsNote(l, { n: 4885, sp: 54 }, "v20260728")).toBe("");
  });
  it("names the two releases when the service runs another one", () => {
    expect(storeRelease(l.store)).toBe("v20260728");
    expect(totalsNote(l, { n: 5000, sp: 55 }, "v20261101")).toBe(
      "Species from release v20260728, the map from v20261101: their totals differ.",
    );
  });
  it("says so when the same release does not add up", () => {
    expect(totalsNote(l, { n: 5000, sp: 54 }, "v20260728")).toBe(
      "These 54 species and 4,885 records do not match the hexagon's values.",
    );
  });
});

describe("loadCellSpecies", () => {
  it("fetches once per URL, then answers from the cache", async () => {
    const { f, asked } = fakeFetch(() => json(200, ALL));
    const url = `${B}cell?h3=872834c65ffffff&cache-test=1`;
    const a = await loadCellSpecies(url, f);
    const b = await loadCellSpecies(url, f);
    expect(a).toBe(b);
    expect(asked).toEqual([url]);
  });
  it("turns errors into H3tError with the server's reason", async () => {
    const e = await loadCellSpecies(`${B}cell?h3=x`, fakeFetch(() => json(400, { error: "bad_request", reason: "h3 is not an H3 cell index" })).f).catch((x) => x);
    expect(e).toBeInstanceOf(H3tError);
    expect([e.status, speciesErrorLine(e)]).toEqual([400, "Species list request refused: h3 is not an H3 cell index"]);
    const e2 = await loadCellSpecies(`${B}cell?h3=y`, fakeFetch(() => json(200, { nope: 1 })).f).catch((x) => x);
    expect([e2.status, e2.message]).toEqual([0, "the response is not a species list"]);
    const e3 = await loadCellSpecies(`${B}cell?h3=z`, async () => { throw new TypeError("Failed to fetch"); }).catch((x) => x);
    expect(speciesErrorLine(e3)).toBe("Species list: unreachable: Failed to fetch");
  });
  it("times out as an H3tError, and an abort by the caller is not one", async () => {
    const hang: FetchLike = (_u, init) =>
      new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    const t = await loadCellSpecies(`${B}cell?h3=t`, hang, undefined, 10).catch((x) => x);
    expect([t.status, t.message]).toEqual([0, "timed out after 0 s"]);
    const ctl = new AbortController();
    const p = loadCellSpecies(`${B}cell?h3=a`, hang, ctl.signal).catch((x) => x);
    ctl.abort();
    const a = await p;
    expect(a).not.toBeInstanceOf(H3tError);
    expect(a.name).toBe("AbortError");
  });
  it("does not cache a failure", async () => {
    let n = 0;
    const f: FetchLike = async () => (++n === 1 ? json(503, { reason: "busy" }) : json(200, MAM));
    const url = `${B}cell?h3=852834c7fffffff&retry=1`;
    await expect(loadCellSpecies(url, f)).rejects.toMatchObject({ status: 503 });
    expect((await loadCellSpecies(url, f)).sp).toBe(17);
  });
});

describe("the table", () => {
  const rows = list(ALL).species;
  it("sorts by any column, empty years last both ways, ties by name", () => {
    expect(sortSpecies(rows, "records", true).map((r) => r.records)).toEqual(rows.map((r) => r.records));
    const asc = sortSpecies(rows, "year_min", false);
    const desc = sortSpecies(rows, "year_min", true);
    expect(asc.at(-1)!.year_min).toBeNull();
    expect(desc.at(-1)!.year_min).toBeNull();
    expect(asc[0].year_min).toBeLessThanOrEqual(asc[1].year_min!);
    expect(sortSpecies(rows, "species", false)[0].species <= sortSpecies(rows, "species", false)[1].species).toBe(true);
  });
  it("filters on every word, in the name or the taxonomy", () => {
    expect(filterSpecies(rows, "").length).toBe(54);
    expect(filterSpecies(rows, "MEGAPTERA").map((r) => r.species)).toEqual(["Megaptera novaeangliae"]);
    const delph = filterSpecies(rows, "delphinidae");
    expect(delph.length).toBeGreaterThan(1);
    expect(delph.every((r) => r.family === "Delphinidae")).toBe(true);
    expect(filterSpecies(rows, "delphinidae orca").map((r) => r.species)).toEqual(["Orcinus orca"]);
  });
  it("shows years as a range, one year, or a dash", () => {
    expect([yearsText(1992, 2026), yearsText(2019, 2019), yearsText(null, null)]).toEqual(["1992–2026", "2019", "—"]);
  });
});

describe("CSV", () => {
  it("has one row per species with its share of the records", () => {
    const csv = speciesCsv(list(ALL)).trim().split("\n");
    expect(csv[0]).toBe("h3,res,species,aphiaid,phylum,class,order,family,records,share_of_records,year_min,year_max");
    expect(csv).toHaveLength(55);
    expect(csv[1]).toBe("872834c65ffffff,7,Megaptera novaeangliae,137092,Chordata,Mammalia,Cetartiodactyla,Balaenopteridae,3948,0.808188,1992,2026");
  });
  it("quotes a comma and leaves empty values empty", () => {
    const l = list({ h3: "8", res: 1, species: [{ species: 'A "b", c', records: 1 }] });
    expect(speciesCsv(l).split("\n")[1]).toBe('8,1,"A ""b"", c",,,,,,1,1,,');
  });
  it("names the file after the hexagon, layer, period and release", () => {
    expect(speciesCsvName("872834c65ffffff", "all", null, "v20260728")).toBe("obis-hex_species_872834c65ffffff_all_all-years_v20260728.csv");
    expect(speciesCsvName("852834c7fffffff", "taxon:phylum:Apicomplexa%20incertae%20sedis", 2010, null)).toBe(
      "obis-hex_species_852834c7fffffff_taxon-phylum-Apicomplexa-incertae-sedis_2010s.csv",
    );
  });
});

describe("obisChecklistUrl", () => {
  it("sends the hexagon as a closed WKT polygon in lng lat order, and the decade as dates", () => {
    const u = new URL(obisChecklistUrl("872834c65ffffff", 2010));
    expect(u.origin + u.pathname).toBe("https://api.obis.org/v3/checklist");
    const wkt = u.searchParams.get("geometry")!;
    const pts = wkt.replace(/^POLYGON\(\(|\)\)$/g, "").split(", ");
    expect(pts).toHaveLength(7);
    expect(pts[0]).toBe(pts[6]);
    const [lng, lat] = pts[0].split(" ").map(Number);
    expect(lng).toBeCloseTo(-122, 0);
    expect(lat).toBeCloseTo(36.8, 0);
    expect([u.searchParams.get("startdate"), u.searchParams.get("enddate")]).toEqual(["2010-01-01", "2019-12-31"]);
    expect(new URL(obisChecklistUrl("872834c65ffffff", null)).searchParams.has("startdate")).toBe(false);
  });
});

describe("the species list stays lazy", () => {
  const src = join(__dirname, "..", "src");
  const files = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)]));
  it("only CellSpecies imports lib/cell/species for values, and CellSpecies is reached by import() only", () => {
    for (const f of files(src)) {
      const s = readFileSync(f, "utf8");
      if (/^\s*import\s+(?!type\b)[^(;]*["'][^"']*lib\/cell\/species["']/m.test(s))
        expect(f, "static import of the species code").toMatch(/CellSpecies\.svelte$/);
      if (/^\s*import[^(;]*["'][^"']*CellSpecies\.svelte["']/m.test(s)) expect.fail(`static import of CellSpecies in ${f}`);
    }
    expect(readFileSync(join(src, "components/CellPanel.svelte"), "utf8")).toContain('import("./CellSpecies.svelte")');
    expect(readFileSync(join(src, "App.svelte"), "utf8")).toContain('import("./lib/cell/species")');
  });
});
