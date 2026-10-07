// paper 2's app figures, reproduced from URL states (the URL is the view). Opens the app in
// headless Chromium (Playwright) at 1512×798, waits until the view has loaded, and saves
// figures/figA_*.png.
//
//   npm run figures                                   # the deployed app, https://oceanmetrics.io/obis-hex/
//   OBIS_HEX_URL=http://localhost:5173/obis-hex/ npm run figures   # a local dev or preview server
//
// Chromium runs WebGL on SwiftShader (no GPU needed), so this also works over ssh or in CI.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const APP = process.env.OBIS_HEX_URL ?? "https://oceanmetrics.io/obis-hex/";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "figures");

export const FIGURES = [
  {
    file: "figA_app_alltaxa_globe_dark.png",
    what: "all taxa, ES(50), res 1, dark basemap, globe",
    hash: "#i=es&l=all&p=all&r=1&o=0.85&t=dark&d=release&g=globe&c=-30,15,1.5",
  },
  {
    file: "figA_app_seagrasses_globe.png",
    what: "seagrasses EOV, ES(50), res 1, globe",
    hash: "#i=es&l=eov:seagrasses&p=all&r=1&o=0.85&t=light&d=release&g=globe&c=-30,15,1.5",
  },
  {
    file: "figA_app_seagrasses_caribbean.png",
    what: "seagrasses EOV, ES(50), res 4, the Caribbean (resolution control in the side panel)",
    hash: "#i=es&l=eov:seagrasses&p=all&r=4&o=0.85&t=light&d=release&g=flat&c=-80.5,19.5,4.3",
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  for (const f of FIGURES) {
    const page = await browser.newPage({ viewport: { width: 1512, height: 798 } });
    await page.goto(`${APP}${f.hash}`);
    // the shell flags data-ready once the release, the view's partition(s) and the layer are in
    await page.waitForSelector('.shell[data-ready="1"]', { timeout: 120_000 });
    await page.waitForLoadState("networkidle"); // basemap tiles and fonts
    await page.waitForTimeout(1500); // the globe settles and deck redraws
    const title = await page.locator(".stats .title").innerText();
    await page.screenshot({ path: join(OUT, f.file) });
    console.log(`${f.file}: ${f.what}\n  ${title}\n  ${APP}${f.hash}`);
    await page.close();
  }
} finally {
  await browser.close();
}
