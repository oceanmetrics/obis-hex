import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // pure logic + a node DuckDB-WASM engine test; no DOM
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
