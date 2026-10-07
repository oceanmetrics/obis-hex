// the one MapLibre map + a deck.gl overlay for the hexagons. Wiring copied from the atlas
// (src/lib/map/map.ts): NAMED maplibre-gl 6 imports (no default export), the worker via
// `?worker&url` + setWorkerUrl (plain `?url` drops the worker's shared chunk), and
// preserveDrawingBuffer in canvasContextAttributes. deck.gl runs as an overlaid MapboxOverlay
// (its own canvas, its own picking), as CalCOFI explore did before it went interleaved; nothing
// here needs a deck layer under a basemap layer, so theme swaps are a plain setStyle().
import { Map as MapLibreMap, setWorkerUrl, AttributionControl, NavigationControl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";

/** CARTO's keyless vector GL styles (the raster endpoints now need a key; atlas basemap.ts). */
export const BASEMAP_STYLE: Record<"dark" | "light", string> = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

let wired = false;

export type Projection = "globe" | "flat";

export interface MapHandle {
  map: MapLibreMap;
  overlay: MapboxOverlay;
  setTheme(theme: "dark" | "light"): void;
  setProjection(p: Projection): void;
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
    center: [number, number];
    zoom: number;
    onView: (v: { lon: number; lat: number; zoom: number }) => void;
    getTooltip: (info: PickingInfo) => { html: string } | null;
    onClick: (info: PickingInfo) => void;
  },
): MapHandle {
  if (!wired) {
    setWorkerUrl(maplibreWorkerUrl);
    wired = true;
  }
  let theme = opts.theme;
  let projection = opts.projection;
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
  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: '<a href="https://obis.org" target="_blank" rel="noopener">OBIS</a>',
    }),
  );
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
    },
    setProjection(p) {
      if (p === projection) return;
      projection = p;
      if (map.isStyleLoaded()) applyProjection();
    },
    bounds() {
      const b = map.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    },
    setLayers(layers) {
      overlay.setProps({ layers });
    },
    destroy() {
      ro?.disconnect();
      map.remove();
    },
  };
}
