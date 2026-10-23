#!/usr/bin/env node
// copies the redirect page template (redirect.html + redirect.js) from erddap-places, where it is written, into
// public/redirect/. One template, two identical copies: tests/redirectPage.test.ts pins their checksum, so a change in
// either repo fails until the other follows. config.json and the codec are this app's own and are not copied.
//   node scripts/sync-redirect.mjs [../erddap-places/app/static/redirect]
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(process.argv[2] ?? join(root, "..", "erddap-places", "app", "static", "redirect"));
for (const f of ["redirect.html", "redirect.js"]) {
  if (!existsSync(join(from, f))) {
    process.stderr.write(`missing ${join(from, f)}\n`);
    process.exit(1);
  }
  copyFileSync(join(from, f), join(root, "public", "redirect", f));
  process.stdout.write(`copied ${f}\n`);
}
