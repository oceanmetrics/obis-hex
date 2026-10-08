// the one MapLibre map + a deck.gl overlay for the hexagons. Wiring copied from the atlas
// (src/lib/map/map.ts): NAMED maplibre-gl 6 imports (no default export), the worker via
// `?worker&url` + setWorkerUrl (plain `?url` drops the worker's shared chunk), and
// preserveDrawingBuffer in canvasContextAttributes. deck.gl runs as an overlaid MapboxOverlay
// (its own canvas, its own picking), as CalCOFI explore did before it went interleaved; nothing
// here needs a deck layer under a basemap layer, so theme swaps are a plain setStyle().
// (Interleaved deck 9.4 does not run on MapLibre 6: it reads `map.transform`, gone in 6, and throws
// every frame. So the hexagons are always above the map's own layers, and the gazetteer outline is
// drawn by a second, transparent MapLibre map stacked above deck; see `createOutlineMap`.)
import { Map as MapLibreMap, setWorkerUrl, addProtocol, AttributionControl, NavigationControl } from "maplibre-gl";
import type { FilterSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { OBIS_CREDIT, pmtilesUrl } from "../places/urls";

/** CARTO's keyless vector GL styles (the raster endpoints now need a key; atlas basemap.ts). */
export const BASEMAP_STYLE: Record<"dark" | "light", string> = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

let wired = false;

// the Ocean Metrics gazetteer: one PMTiles per collection (`<bucket>/gazetteer/<collection>/places.pmtiles`,
// source layer == the collection's slug, feature property `place_id`), read by HTTP range requests.
// The selected place's collection is added as a source on demand (`pmtilesUrl()` in places/index.ts,
// the bucket host, because storage.oceanmetrics.io answers a 302 without CORS headers) and its credit
// goes into the attribution control (the manifest's `attribution_html`, `creditsFor()`).
/** the place to outline: its collection (the PMTiles and its source layer) and its feature id;
 * `credit` is the collection's attribution line for the map's attribution control */
export interface PlaceTarget {
  collection: string;
  place_id: string;
  credit?: string;
}

/** the source and layer ids of one collection on the outline map */
export const outlineIds = (collection: string) => ({
  source: `gz-${collection}`,
  casing: `gz-${collection}-casing`,
  line: `gz-${collection}-line`,
  pointCasing: `gz-${collection}-point-casing`,
  point: `gz-${collection}-point`,
});

/** the map filter that matches one place id; an unset place matches nothing */
export function placeFilter(placeId: string | null): ["==", ["get", string], string] {
  return ["==", ["get", "place_id"], placeId ?? ""];
}

/** polygons and lines are drawn as lines, points as circles: one filter per kind, so a collection
 * of any geometry type (a polygon, a CalCOFI line, a GEBCO point) shows */
export function kindFilter(placeId: string | null, point: boolean): FilterSpecification {
  return ["all", placeFilter(placeId), [point ? "==" : "!=", ["geometry-type"], "Point"]] as FilterSpecification;
}

/** outline colours per basemap theme: the kit's place facet navy (`--facet-place`) on the light
 * basemap, white on the dark one, each with a casing of the opposite tone so it also reads over the
 * hexagons' viridis */
export const OUTLINE_COLORS: Record<"dark" | "light", { line: string; casing: string }> = {
  dark: { line: "#ffffff", casing: "#01375f" },
  light: { line: "#01375f", casing: "#ffffff" },
};

export type Projection = "globe" | "flat";

export interface MapHandle {
  map: MapLibreMap;
  overlay: MapboxOverlay;
  setTheme(theme: "dark" | "light"): void;
  setProjection(p: Projection): void;
  /** show or hide the basemap's labels (its symbol layers) */
  setLabels(on: boolean): void;
  /** outline one gazetteer place (its collection's PMTiles and `place_id`) and credit its collection, or none (null) */
  setPlace(target: PlaceTarget | null): void;
  /** the map and hexagons as one canvas (basemap + deck overlay), for the PNG export */
  snapshot(): HTMLCanvasElement;
  /** the visible bounds [west, south, east, north] (west may be < -180 with world copies) */
  bounds(): [number, number, number, number];
  setLayers(layers: Layer[]): void;
  destroy(): void;
}

export function createMap(
  container: HTMLElement,
  opts: {
    theme: "dark" | "light";
    projection: Projection;
    labels?: boolean;
    place?: PlaceTarget | null;
    center: [number, number];
    zoom: number;
    onView: (v: { lon: number; lat: number; zoom: number }) => void;
    getTooltip: (info: PickingInfo) => { html: string } | null;
    onClick: (info: PickingInfo) => void;
  },
): MapHandle {
  if (!wired) {
    setWorkerUrl(maplibreWorkerUrl);
    addProtocol("pmtiles", new Protocol().tile);
    wired = true;
  }
  let theme = opts.theme;
  let place: PlaceTarget | null = opts.place ?? null;
  let projection = opts.projection;
  let labels = opts.labels ?? true;
  const map = new MapLibreMap({
    container,
    style: BASEMAP_STYLE[theme],
    center: opts.center,
    zoom: opts.zoom,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    renderWorldCopies: true,
  });
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  // MapLibre has no setter for a custom attribution, so the control is replaced when the credited
  // collection changes
  let attrib: AttributionControl | null = null;
  const setCredit = (credit: string | undefined) => {
    if (attrib) map.removeControl(attrib);
    attrib = new AttributionControl({ compact: true, customAttribution: credit ? [OBIS_CREDIT, credit] : [OBIS_CREDIT] });
    map.addControl(attrib);
  };
  setCredit(place?.credit);
  map.resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
  ro?.observe(container);

  const overlay = new MapboxOverlay({
    interleaved: false,
    layers: [],
    getTooltip: (info: PickingInfo) => opts.getTooltip(info),
    onClick: (info: PickingInfo) => opts.onClick(info),
  });
  map.addControl(overlay);

  // the projection is part of the style in MapLibre: (re)apply it whenever a style loads
  const applyProjection = () => {
    map.setProjection({ type: projection === "globe" ? "globe" : "mercator" });
  };
  map.on("style.load", applyProjection);
  const applyLabels = () => {
    for (const l of map.getStyle()?.layers ?? [])
      if (l.type === "symbol") map.setLayoutProperty(l.id, "visibility", labels ? "visible" : "none");
  };
  map.on("style.load", () => {
    if (!labels) applyLabels();
  });

  const outline = createOutlineMap(map, { theme, projection, place });

  map.on("moveend", () => {
    const c = map.getCenter();
    opts.onView({ lon: c.lng, lat: c.lat, zoom: map.getZoom() });
  });

  return {
    map,
    overlay,
    setTheme(t) {
      if (t === theme) return;
      theme = t;
      map.setStyle(BASEMAP_STYLE[t]);
      outline.setTheme(t);
    },
    setProjection(p) {
      if (p === projection) return;
      projection = p;
      if (map.isStyleLoaded()) applyProjection();
      outline.setProjection(p);
    },
    setLabels(on) {
      if (on === labels) return;
      labels = on;
      if (map.isStyleLoaded()) applyLabels();
    },
    setPlace(target) {
      if (target?.credit !== place?.credit) setCredit(target?.credit);
      place = target;
      outline.setPlace(target);
    },
    snapshot() {
      const base = map.getCanvas();
      const out = document.createElement("canvas");
      out.width = base.width;
      out.height = base.height;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(base, 0, 0);
      // deck draws into its own canvas; redraw it now so its buffer is current in this task
      const deck = (overlay as unknown as { _deck?: { redraw(r?: string): void; canvas?: HTMLCanvasElement } })._deck;
      deck?.redraw("png");
      if (deck?.canvas) ctx.drawImage(deck.canvas, 0, 0, out.width, out.height);
      const o = outline.canvas();
      if (place && o) ctx.drawImage(o, 0, 0, out.width, out.height);
      return out;
    },
    bounds() {
      const b = map.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    },
    setLayers(layers) {
      // interleaved: the hexagons are drawn inside the map's own canvas, below the gazetteer outline
      // (deck's `beforeId` places the layer group), so the outline stays visible over the cells
      overlay.setProps({ layers: layers });
    },
    destroy() {
      ro?.disconnect();
      outline.destroy();
      map.remove();
    },
  };
}

/** A second MapLibre map with no basemap, stacked above the main map and deck's canvas
 * (pointer-events: none), that draws only the selected place's outline from the gazetteer PMTiles.
 * deck draws on its own canvas above every MapLibre layer, so an outline on the main map would sit
 * under the (85% opaque) hexagons; this one sits above them. It follows the main map's camera
 * (centre, zoom, bearing, pitch, padding) on every move, uses the same projection, and its style never
 * changes, so the basemap swap needs no re-adding of its source or layers. */
export function createOutlineMap(
  main: MapLibreMap,
  init: { theme: "dark" | "light"; projection: Projection; place: PlaceTarget | null },
) {
  const el = document.createElement("div");
  el.className = "place-outline";
  el.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:3;";
  // after the canvas container (map + deck), before the control container (buttons stay on top)
  const ctrl = main.getContainer().querySelector(".maplibregl-control-container");
  main.getContainer().insertBefore(el, ctrl);
  // deck's canvas lives in MapLibre's top-left control corner (z-index 2), so the outline (3) is above
  // it, and the other corners (buttons, attribution) are lifted above the outline (4)
  if (!document.getElementById("place-outline-css")) {
    const st = document.createElement("style");
    st.id = "place-outline-css";
    st.textContent =
      ".maplibregl-ctrl-top-right,.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left{z-index:4!important}";
    document.head.append(st);
  }
  let place: PlaceTarget | null = init.place;
  let theme = init.theme;
  let ready = false;
  /** collections whose source and layers are on the map */
  const added = new Set<string>();
  const map = new MapLibreMap({
    container: el,
    style: { version: 8, sources: {}, layers: [] },
    center: main.getCenter(),
    zoom: main.getZoom(),
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    renderWorldCopies: true,
  });
  const sync = () => {
    map.jumpTo({
      center: main.getCenter(),
      zoom: main.getZoom(),
      bearing: main.getBearing(),
      pitch: main.getPitch(),
      padding: main.getPadding(),
    });
  };
  const onResize = () => {
    map.resize();
    sync();
  };
  // add a collection's source and its line and circle layers (each with a casing) the first time it is used
  const ensure = (collection: string) => {
    if (added.has(collection)) return;
    added.add(collection);
    const ids = outlineIds(collection);
    const c = OUTLINE_COLORS[theme];
    map.addSource(ids.source, { type: "vector", url: `pmtiles://${pmtilesUrl(collection)}` });
    const base = { source: ids.source, "source-layer": collection } as const;
    map.addLayer({ id: ids.casing, type: "line", ...base, filter: kindFilter(null, false), layout: { "line-join": "round" },
      paint: { "line-color": c.casing, "line-width": 5, "line-opacity": 0.7 } });
    map.addLayer({ id: ids.line, type: "line", ...base, filter: kindFilter(null, false), layout: { "line-join": "round" },
      paint: { "line-color": c.line, "line-width": 2.5 } });
    map.addLayer({ id: ids.pointCasing, type: "circle", ...base, filter: kindFilter(null, true),
      paint: { "circle-radius": 8, "circle-color": c.casing, "circle-opacity": 0.7 } });
    map.addLayer({ id: ids.point, type: "circle", ...base, filter: kindFilter(null, true),
      paint: { "circle-radius": 5, "circle-color": c.line, "circle-stroke-color": c.casing, "circle-stroke-width": 1 } });
  };
  // show the selected place and clear every other collection's filter
  const apply = () => {
    if (!ready) return;
    if (place) ensure(place.collection);
    for (const coll of added) {
      const ids = outlineIds(coll);
      const id = place?.collection === coll ? place.place_id : null;
      for (const l of [ids.casing, ids.line]) map.setFilter(l, kindFilter(id, false));
      for (const l of [ids.pointCasing, ids.point]) map.setFilter(l, kindFilter(id, true));
    }
  };
  map.on("load", () => {
    map.setProjection({ type: init.projection === "globe" ? "globe" : "mercator" });
    ready = true;
    apply();
    sync();
  });
  main.on("move", sync);
  main.on("resize", onResize);
  return {
    setPlace(target: PlaceTarget | null) {
      place = target;
      apply();
    },
    setTheme(t: "dark" | "light") {
      theme = t;
      const c = OUTLINE_COLORS[t];
      for (const coll of added) {
        const ids = outlineIds(coll);
        map.setPaintProperty(ids.line, "line-color", c.line);
        map.setPaintProperty(ids.casing, "line-color", c.casing);
        map.setPaintProperty(ids.point, "circle-color", c.line);
        map.setPaintProperty(ids.point, "circle-stroke-color", c.casing);
        map.setPaintProperty(ids.pointCasing, "circle-color", c.casing);
      }
    },
    setProjection(p: Projection) {
      init.projection = p;
      if (!ready) return; // applied on load
      map.setProjection({ type: p === "globe" ? "globe" : "mercator" });
      sync();
    },
    canvas: () => map.getCanvas(),
    destroy() {
      main.off("move", sync);
      main.off("resize", onResize);
      map.remove();
      el.remove();
    },
  };
}
