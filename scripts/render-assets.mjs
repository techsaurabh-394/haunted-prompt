// Copyright (c) 2026 Saurabh Pathak. MIT License.
// OPTIONAL maintainer script: render every SVG in assets/ to PNG, check that no two text labels
// overlap, and build the 1280x640 social preview (assets/social-preview.png).
// Needs Playwright with Chromium (not a project dependency): npm i -D playwright && npx playwright install chromium
// Usage: node scripts/render-assets.mjs [outDir]

import { readFile, readdir, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(root, "assets", "rendered"));
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. This optional script needs: npm i -D playwright");
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
let problems = 0;
const svgs = (await readdir(join(root, "assets"))).filter((f) => f.endsWith(".svg"));
for (const f of svgs) {
  const svg = await readFile(join(root, "assets", f), "utf8");
  const w = Number(/width="(\d+)"/.exec(svg)[1]);
  const h = Number(/height="(\d+)"/.exec(svg)[1]);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  // reduced motion: we check the static (animation-off) frame, which must show everything
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<html><body style="margin:0;background:#0f0b16">${svg}</body></html>`);
  const report = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("text")].map((t) => ({ text: t.textContent, r: t.getBoundingClientRect() }));
    const svgBox = document.querySelector("svg").getBoundingClientRect();
    const overlaps = [];
    const outside = [];
    const small = [];
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i].r;
      if (a.left < svgBox.left - 0.5 || a.right > svgBox.right + 0.5 || a.top < svgBox.top - 0.5 || a.bottom > svgBox.bottom + 0.5) outside.push(boxes[i].text);
      const size = parseFloat(getComputedStyle(document.querySelectorAll("text")[i]).fontSize);
      if (size < 12) small.push(`${boxes[i].text} (${size}px)`);
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j].r;
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 1 && iy > 1) overlaps.push(`${boxes[i].text} <-> ${boxes[j].text}`);
      }
    }
    return { count: boxes.length, overlaps, outside, small };
  });
  await page.screenshot({ path: join(outDir, f.replace(/\.svg$/, ".png")) });
  await page.close();
  const bad = report.overlaps.length + report.outside.length + report.small.length;
  problems += bad;
  console.log(`${f}: ${report.count} labels, overlaps ${report.overlaps.length}, outside ${report.outside.length}, under 12px ${report.small.length}`);
  for (const o of [...report.overlaps, ...report.outside, ...report.small]) console.log(`   ${o}`);
}

// Social preview: 1280x640, built from the banner art.
const banner = await readFile(join(root, "assets", "banner.svg"), "utf8");
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.setContent(`<html><body style="margin:0;width:1280px;height:640px;background:#0f0b16;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="width:1200px">${banner.replace('width="1200" height="300"', 'width="1200" height="300"')}</div>
  <div style="color:#bdb3cc;font-size:26px;margin-top:28px">A prompt-injection game · local open-weight model · deterministic judge</div>
  <div style="color:#ffb454;font-size:24px;margin-top:14px">github.com/techsaurabh-394/haunted-prompt</div>
</body></html>`);
await page.screenshot({ path: join(root, "assets", "social-preview.png") });
await browser.close();
console.log(`PNG previews in ${outDir}; social preview at assets/social-preview.png`);
if (problems) {
  console.error(`${problems} layout problem(s) found.`);
  process.exit(1);
}
