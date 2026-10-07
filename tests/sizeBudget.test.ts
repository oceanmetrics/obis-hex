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
});
