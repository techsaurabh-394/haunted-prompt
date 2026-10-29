// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Build the static demo site: site/index.html + site/core/*.js (the isomorphic engine) + site/.nojekyll.
// The hosted page has no server, so it runs in demo mode with the rule-based MockGhost.
// Usage: node scripts/build-site.mjs [outDir]   (run `npm run build` first; `npm run build:site` does both)

import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CORE_MODULES = ["secrets", "detect", "filters", "levels", "tools", "ghost", "game", "types"];

export async function buildSite(outDir = join(root, "site")) {
  const dist = join(root, "dist", "src");
  for (const m of CORE_MODULES) {
    if (!existsSync(join(dist, `${m}.js`))) throw new Error(`Missing dist/src/${m}.js. Run "npm run build" first.`);
  }
  await rm(join(outDir, "core"), { recursive: true, force: true });
  await mkdir(join(outDir, "core"), { recursive: true });
  for (const m of CORE_MODULES) await copyFile(join(dist, `${m}.js`), join(outDir, "core", `${m}.js`));
  await copyFile(join(root, "public", "index.html"), join(outDir, "index.html"));
  await writeFile(join(outDir, ".nojekyll"), "");
  if (existsSync(join(root, "assets", "social-preview.png"))) {
    await mkdir(join(outDir, "assets"), { recursive: true });
    await copyFile(join(root, "assets", "social-preview.png"), join(outDir, "assets", "social-preview.png"));
  }
  const files = (await readdir(join(outDir, "core"))).sort();
  return { outDir, files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ? resolve(process.argv[2]) : undefined;
  buildSite(out)
    .then(({ outDir, files }) => console.log(`Site built in ${outDir}: index.html, .nojekyll, core/{${files.join(", ")}}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
