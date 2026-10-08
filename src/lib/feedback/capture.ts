// the feedback screenshot: html-to-image (pinned 1.11.13, as MarineSensitivity/atlas and CalCOFI
// explore; html2canvas rejects color-mix()) over the shell without the header and footer, with the
// map composited from its own canvases (MapLibre's preserveDrawingBuffer plus deck.gl's redraw,
// MapHandle.snapshot()), since a WebGL canvas does not survive html-to-image's clone reliably.
// Reached ONLY through the dynamic import() in App.svelte (tests/help.test.ts checks the wiring);
// html-to-image must never enter index.html's static graph.
import { toCanvas } from "html-to-image";

/** elements never in the picture: the feedback dialog itself, the welcome card, the tour, and the
 * map's WebGL canvases (composited from MapHandle.snapshot() instead) */
export const CAPTURE_SKIP = ["dialog", ".welcome", ".tour-ring", ".tour-card", ".map canvas"];

/** the view (title band + stage: the map, the sentence and the panes) as a canvas; the header and
 * footer are cropped off */
export async function captureView(root: HTMLElement, map: { el: HTMLElement; snapshot: () => HTMLCanvasElement } | null): Promise<HTMLCanvasElement> {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const bg = getComputedStyle(document.body).backgroundColor || "#000";
  const rootBox = root.getBoundingClientRect();
  const top = (root.querySelector(".title-band") ?? root).getBoundingClientRect().top;
  const bottom = (root.querySelector(".stage") ?? root).getBoundingClientRect().bottom;
  const page = await toCanvas(root, {
    pixelRatio: scale,
    cacheBust: false,
    filter: (node) => !(node instanceof Element && CAPTURE_SKIP.some((s) => node.matches(s))),
  });
  const out = document.createElement("canvas");
  out.width = Math.round(rootBox.width * scale);
  out.height = Math.round((bottom - top) * scale);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  if (map) {
    const m = map.el.getBoundingClientRect();
    ctx.drawImage(map.snapshot(), (m.left - rootBox.left) * scale, (m.top - top) * scale, m.width * scale, m.height * scale);
  }
  // the page over the map (its map area is transparent: the canvases were skipped), header cropped
  ctx.drawImage(page, 0, -(top - rootBox.top) * scale);
  return out;
}

export function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));
}
