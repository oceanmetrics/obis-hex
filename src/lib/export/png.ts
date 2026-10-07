// the PNG export: the map (basemap + hexagons) with the title sentence stamped above it and the
// colour scale, release and permalink below, so a saved image explains itself.
import { VIRIDIS, type Domain } from "../color/ramp";
import { fmt } from "../format";

export interface Stamp {
  title: string;
  sub: string;
  indicator: string;
  domain: Domain | null;
  footer: string;
  dark: boolean;
}

export function stampPng(map: HTMLCanvasElement, s: Stamp): HTMLCanvasElement {
  const dpr = Math.max(1, map.width / Math.max(1, map.clientWidth || map.width));
  const W = map.width;
  const pad = 14 * dpr;
  const top = 64 * dpr;
  const bottom = 58 * dpr;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = map.height + top + bottom;
  const ctx = out.getContext("2d")!;
  const bg = s.dark ? "#04131f" : "#ffffff";
  const fg = s.dark ? "#eaf3f7" : "#0f2230";
  const muted = s.dark ? "#8499a3" : "#44606e";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(map, 0, top);
  ctx.fillStyle = fg;
  ctx.font = `600 ${18 * dpr}px "Space Grotesk", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(s.title, pad, pad, W - 2 * pad);
  ctx.fillStyle = muted;
  ctx.font = `${12 * dpr}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillText(s.sub, pad, pad + 26 * dpr, W - 2 * pad);
  // colour scale
  const y = top + map.height + 10 * dpr;
  const bw = Math.min(260 * dpr, W / 3);
  if (s.domain) {
    const g = ctx.createLinearGradient(pad, 0, pad + bw, 0);
    VIRIDIS.forEach((c, i) => g.addColorStop(i / (VIRIDIS.length - 1), `rgb(${c.join(",")})`));
    ctx.fillStyle = g;
    ctx.fillRect(pad, y, bw, 10 * dpr);
    ctx.fillStyle = muted;
    ctx.font = `${11 * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillText(`${s.indicator}  ≤ ${fmt(s.domain[0])}`, pad, y + 16 * dpr);
    const hi = `≥ ${fmt(s.domain[1])}`;
    ctx.fillText(hi, pad + bw - ctx.measureText(hi).width, y + 16 * dpr);
  }
  ctx.fillStyle = muted;
  ctx.font = `${11 * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
  const fx = pad + bw + 24 * dpr;
  ctx.fillText(s.footer, fx, y, W - fx - pad);
  return out;
}

export async function downloadCanvas(c: HTMLCanvasElement, name: string): Promise<void> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** a file name for the view: obis-hex_<layer>_<period>_res<r>_<indicator>.png */
export function pngName(layer: string, decade: number | null, res: number, indicator: string): string {
  let name = layer;
  try {
    name = decodeURIComponent(layer);
  } catch {
    /* keep the raw key */
  }
  const slug = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `obis-hex_${slug}_${decade === null ? "all" : decade}_res${res}_${indicator}.png`;
}
