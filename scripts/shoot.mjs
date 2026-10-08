// the UI assessment's capture script (erddap-places/docs/ui-assessment/shoot.mjs, "oh"), moved here
// for the after set: the same four states, dark and light, at phone 390×844, laptop 1280×800 and
// projector 1920×1080, into docs/ui-assessment/after/. Ready = `.shell[data-ready="1"]` and the
// footer's timing, then network idle + 2 s (as before). Every state but the first-visit ones opens
// with `?tour=off`, so no welcome card or tour lands in it (0.5.0); `welcome_*` is a first visit and
// `tour-stop-1_*` is `?tour=on`.
//
//   node scripts/shoot.mjs                                          # the deployed app
//   OBIS_HEX_URL=http://localhost:4173/obis-hex/ node scripts/shoot.mjs   # a local preview
//   node scripts/shoot.mjs initial                                  # one state only
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
await b.close();
