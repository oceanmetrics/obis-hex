// the UI assessment's capture script (erddap-places/docs/ui-assessment/shoot.mjs, "oh"), moved here
// for the after set: the same four states, dark and light, at phone 390×844, laptop 1280×800 and
// projector 1920×1080, into docs/ui-assessment/after/. Ready = `.shell[data-ready="1"]` and the
// footer's timing, then network idle + 2 s (as before). Every state but the first-visit ones opens
// with `?tour=off`, so no welcome card or tour lands in it (0.5.0); `welcome_*` is a first visit and
// `tour-stop-1_*` is `?tour=on`.
//
//   node scripts/shoot.mjs                                          # the deployed app
//   OBIS_HEX_URL=http://localhost:4173/obis-hex/ node scripts/shoot.mjs   # a local preview
//   node scripts/shoot.mjs initial                                  # one state only (or extras, cell, banner)
//   PW_CHANNEL=chrome uses the installed Chrome instead of Playwright's chromium
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OH = process.env.OBIS_HEX_URL ?? "https://oceanmetrics.io/obis-hex/";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "ui-assessment", "after");
const VP = {
  phone: { width: 390, height: 844 },
  laptop: { width: 1280, height: 800 },
  projector: { width: 1920, height: 1080 },
};
const only = process.argv[2];
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  channel: process.env.PW_CHANNEL || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function shot({ url, file, vp, after }) {
  const ctx = await b.newContext({ viewport: VP[vp], deviceScaleFactor: 1, isMobile: vp === "phone", hasTouch: vp === "phone" });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(url, { waitUntil: "domcontentloaded" });
  let note = "";
  try {
    await p.waitForSelector('.shell[data-ready="1"]', { timeout: 180000 });
    await p.waitForFunction(() => /ms/.test(document.querySelector(".mbon-footer")?.textContent ?? ""), null, { timeout: 60000 });
    note = (await p.locator(".view-title").innerText()).replace(/\s*\n\s*/g, " ") + " || " + (await p.locator(".mbon-footer").innerText()).replace(/\n/g, " ");
  } catch (e) {
    note = "READY TIMEOUT: " + e.message.split("\n")[0];
  }
  await p.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000);
  if (after) await after(p);
  await p.screenshot({ path: file });
  console.log(`${file} [${((Date.now() - t0) / 1000).toFixed(1)} s] ${note}`);
  await ctx.close();
}

const Q = `${OH}?tour=off`;
const states = [
  ["initial", (t) => (t === "dark" ? Q : `${Q}#t=light`)],
  ["welcome", (t) => `${OH}#t=${t}`],
  ["tour-stop-1", (t) => `${OH}?tour=on#t=${t}`],
  ["eov-seabirds_res3", (t) => `${Q}#i=es&l=eov:seabirds&p=all&r=3&o=0.85&t=${t}&d=release&g=flat&c=-20,5,1.4`],
  ["aves_res7_monterey", (t) => `${Q}#i=es&l=taxon:class:Aves&p=all&r=7&o=0.85&t=${t}&d=release&g=flat&c=-122.05,36.75,9.2`],
  ["eov-seabirds_globe", (t) => `${Q}#i=es&l=eov:seabirds&p=all&r=2&o=0.85&t=${t}&d=release&g=globe&c=-150,20,1.6`],
];
for (const [name, u] of states) {
  if (only && only !== name) continue;
  for (const t of ["dark", "light"]) for (const vp of Object.keys(VP))
    await shot({ url: u(t), vp, file: `${OUT}/${name}_${t}_${vp}.png` });
}
// two extra states: the taxon chip open, and the Share tab with SQL & timing open (laptop, light)
if (!only || only === "extras") {
  const sea = `${Q}#i=es&l=eov:seabirds&p=all&r=3&o=0.85&t=light&d=release&g=flat&c=-20,5,1.4`;
  await shot({ url: sea, vp: "laptop", file: `${OUT}/chip-taxon_light_laptop.png`, after: async (p) => {
    await p.locator(".view-title .chip").first().click();
    await p.waitForTimeout(400);
  } });
  await shot({ url: `${sea}&k=share`, vp: "laptop", file: `${OUT}/share-tab_light_laptop.png`, after: async (p) => {
    await p.locator("details.sqlt > summary").click();
    await p.locator("details.sqlt .timing").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.waitForTimeout(400);
  } });
}
// the Cell pane on a Monterey Bay hexagon (0.11.0): its species (projector, where the whole pane fits),
// then the pane expanded to all of them (laptop); light, the Time strip folded
if (!only || only === "cell") {
  const cell = `${Q}#i=sp&l=all&p=all&r=7&o=0.85&t=light&d=release&g=flat&c=-122,36.8,9.5&tc=1&x=872834c65ffffff&xo=1`;
  const species = async (p) => {
    await p.locator('[data-tour="cell-species"] tbody tr').first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(400);
  };
  await shot({ url: cell, vp: "projector", file: `${OUT}/cell-species_light_projector.png`, after: species });
  await shot({ url: cell, vp: "laptop", file: `${OUT}/cell-species-expanded_light_laptop.png`, after: async (p) => {
    await species(p);
    await p.getByRole("button", { name: /^All [\d,]+ species/ }).click();
    await p.waitForTimeout(600);
    await p.locator('[data-tour="cell-species"]').evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.waitForTimeout(200);
  } });
}
// the freeze banner (0.11.3): light and dark at 390 px and 1280 px; its note checks the banner's box, that the page does
// not scroll (the stage gives up the banner's height) and the link's address
if (!only || only === "banner") {
  const view = `${Q}#i=es&l=eov:seabirds&p=all&r=3&o=0.85&d=release&g=flat&c=-20,5,1.4`;
  for (const t of ["light", "dark"]) for (const vp of ["phone", "laptop"]) {
    const file = `${OUT}/banner_${t}_${vp}.png`;
    await shot({ url: `${view}&t=${t}`, vp, file, after: async (p) => {
      console.log(await p.evaluate(() => {
        const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return `${Math.round(r.top)}+${Math.round(r.height)}`; };
        return `  freeze ${q(".freeze")} | stage ${q(".stage")} | footer ${q(".mbon-footer")} | scroll ${document.documentElement.scrollHeight}/${innerHeight} x ${document.documentElement.scrollWidth}/${innerWidth} | link ${document.querySelector(".freeze a")?.getAttribute("href")}`;
      }));
    } });
  }
}
await b.close();
