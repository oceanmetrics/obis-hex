// the hexagon layer: deck.gl H3HexagonLayer straight from the partition's h3 strings (no geometry
// is shipped; deck derives each hexagon from its index). Data is the columnar partition, passed as
// `{ length }` so accessors index the typed arrays directly instead of materializing row objects.
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import type { Partition } from "../engine/engine";
import type { Indicator } from "../data/layers";
import { rampColor, type Domain } from "../color/ramp";

export const NULL_COLOR: [number, number, number, number] = [0, 0, 0, 0];

/** per-cell RGBA, computed once per (partition, indicator, domain) so a pan never recolours. */
export function cellColors(values: Float64Array, domain: Domain | null): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v) || !domain) continue; // transparent: NULL (e.g. ES(50) where n < 50)
    const c = rampColor(v, domain);
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function hexLayer(p: Partition, indicator: Indicator, colors: Uint8ClampedArray, opacity: number) {
  return new H3HexagonLayer({
    id: "hexes",
    data: { length: p.rows },
    getHexagon: (_: unknown, { index }: { index: number }) => p.h3[index],
    getFillColor: (_: unknown, { index }: { index: number }) => [
      colors[index * 4],
      colors[index * 4 + 1],
      colors[index * 4 + 2],
      colors[index * 4 + 3],
    ],
    filled: true,
    stroked: false,
    extruded: false,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 110],
    highPrecision: "auto",
    opacity,
    updateTriggers: { getFillColor: [p.url, indicator, colors] },
  });
}
