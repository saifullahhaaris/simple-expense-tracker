import { build } from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
await build({
  entryPoints: [path.join(here, "harness.ts")], bundle: true, format: "iife", outfile: out, platform: "browser",
  plugins: [{ name: "fake-supabase", setup(b) {
    b.onResolve({ filter: /\/supabase$/ }, args => args.importer.includes("/src/lib/") ? { path: path.join(here, "fake-supabase.ts") } : undefined);
  } }]
});
console.log("bundled");
