import { describe, expect, it } from "vitest";
import { evaluateBudget } from "../scripts/size-budget-core.mjs";

const files: Record<string, string> = {
  "assets/index.js": "console.log('app'); const w = '/obis-hex/assets/maplibre-gl-worker-x.js';",
  "assets/maplibre-gl-worker-x.js": "self.onmessage=()=>{}",
  "assets/lazy.js": "duckdb-browser-eh stuff",
};
const read = (p: string) => Buffer.from(files[p]);

describe("size budget", () => {
  it("counts a JS asset as a runtime worker, never walks dynamic imports", () => {
    const r = evaluateBudget({
      manifest: {
        "index.html": {
          file: "assets/index.js",
          assets: ["assets/maplibre-gl-worker-x.js"],
          dynamicImports: ["lazy"],
        },
        lazy: { file: "assets/lazy.js" },
      },
      entryKey: "index.html",
      readFile: read,
    });
    expect(r.ok).toBe(true);
    expect(r.files).toEqual(["assets/index.js"]);
    expect(r.workerFiles).toEqual(["assets/maplibre-gl-worker-x.js"]);
  });

  it("fails when DuckDB-WASM lands in the static graph", () => {
    const r = evaluateBudget({
      manifest: { "index.html": { file: "assets/index.js", imports: ["lazy"] }, lazy: { file: "assets/lazy.js" } },
      entryKey: "index.html",
      readFile: read,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain("duckdb-browser");
  });

  it("fails over budget", () => {
    const r = evaluateBudget({
      manifest: { "index.html": { file: "assets/index.js" } },
      entryKey: "index.html",
      readFile: read,
      budgetBytes: 10,
    });
    expect(r.ok).toBe(false);
  });

  it("budgets fonts and images apart from the code (the MBON kit's woff2 and wordmark)", () => {
    const f2: Record<string, Buffer> = {
      "assets/index.js": Buffer.from("console.log('app')"),
      "assets/IBMPlexSans-Regular-x.woff2": Buffer.alloc(60_000, 1),
      "assets/mbon-logo-x.png": Buffer.alloc(12_000, 2),
    };
    const manifest = {
      "index.html": { file: "assets/index.js", assets: ["assets/IBMPlexSans-Regular-x.woff2", "assets/mbon-logo-x.png"] },
    };
    const r = evaluateBudget({ manifest, entryKey: "index.html", readFile: (p: string) => f2[p], budgetBytes: 1000 });
    expect(r.ok).toBe(true);
    expect(r.files).toEqual(["assets/index.js"]);
    expect(r.fontImageFiles).toEqual(["assets/IBMPlexSans-Regular-x.woff2", "assets/mbon-logo-x.png"]);
    expect(r.fontImageBytes).toBe(72_000);
    const over = evaluateBudget({ manifest, entryKey: "index.html", readFile: (p: string) => f2[p], fontImageBudgetBytes: 50_000 });
    expect(over.ok).toBe(false);
    expect(over.reasons.join()).toContain("fonts and images");
  });
});
