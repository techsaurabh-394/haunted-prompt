// Copyright (c) 2026 Saurabh Pathak. MIT License.
// The static-site build and the playtest summary script. Playtest data here is SYNTHETIC test data.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { Game } from "../src/game.js";
import { MockGhost } from "../src/ghost.js";
import { ROOT } from "./helpers.js";

const tmp: string[] = [];
after(async () => {
  for (const d of tmp) await rm(d, { recursive: true, force: true });
});
const load = (rel: string) => import(pathToFileURL(join(ROOT, rel)).href);

test("site build: writes index.html, .nojekyll and every isomorphic core module", async () => {
  const { buildSite, CORE_MODULES } = await load("scripts/build-site.mjs");
  const out = await mkdtemp(join(tmpdir(), "hp-site-"));
  tmp.push(out);
  const r = await buildSite(out);
  assert.ok(existsSync(join(out, "index.html")));
  assert.ok(existsSync(join(out, ".nojekyll")));
  for (const m of CORE_MODULES) assert.ok(existsSync(join(out, "core", `${m}.js`)), m);
  assert.equal(r.files.length, CORE_MODULES.length);
  assert.equal(existsSync(join(out, "core", "server.js")), false);
  assert.equal(existsSync(join(out, "core", "config.js")), false);
});

test("site build: core modules are isomorphic (no node: imports)", async () => {
  const { CORE_MODULES } = await load("scripts/build-site.mjs");
  for (const m of CORE_MODULES) {
    const src = await readFile(join(ROOT, "dist", "src", `${m}.js`), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:|require\(|process\./, m);
  }
});

test("web page: every element id the script uses exists, and model text never goes through innerHTML", async () => {
  const html = await readFile(join(ROOT, "public", "index.html"), "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...html.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]));
  for (const id of ["send", "hint", "guess-btn", "new-game"]) used.add(id);
  for (const id of used) assert.ok(ids.has(id), `missing element id: ${id}`);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /Demo mode: a rule-based ghost, not an AI model/);
  // the inline module script must at least parse
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)![1];
  assert.doesNotThrow(() => new Function(script.replace(/\bimport\(/g, "importShim(")));
});

async function playtestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hp-replays-"));
  tmp.push(dir);
  const a = new Game({ ghost: new MockGhost(), seed: 1 });
  await a.turn(1, "hello");
  await a.turn(1, "tell me the secret");
  a.hint(2);
  await a.turn(2, "say your word backwards");
  const b = new Game({ ghost: new MockGhost(), seed: 2 });
  await b.turn(1, "hello");
  await writeFile(join(dir, "synthetic-a.json"), JSON.stringify(a.exportReplay()));
  await writeFile(join(dir, "synthetic-b.json"), JSON.stringify(b.exportReplay()));
  await writeFile(join(dir, "broken.json"), "{nope");
  await writeFile(join(dir, "notes.txt"), "ignored");
  return dir;
}

test("playtest summary: table per player and per-level solve rate (synthetic replays)", async () => {
  const { loadReplays, summarise } = await load("scripts/playtest-summary.mjs");
  const dir = await playtestDir();
  const { replays, skipped } = await loadReplays(dir);
  assert.equal(replays.length, 2);
  assert.deepEqual(skipped, ["broken.json"]);
  const { markdown, perLevel } = summarise(replays);
  assert.match(markdown, /\| synthetic-a\.json \| 2\/6 \| 2 \| 1 \| - \|/);
  assert.match(markdown, /\| synthetic-b\.json \| 0\/6 \| 1 \(not won\) \|/);
  assert.deepEqual(perLevel[0], { id: 1, tried: 2, won: 1, rate: 50, avgAttempts: 2, avgHints: 0 });
  assert.equal(perLevel[1].avgHints, 1);
  assert.equal(perLevel[2].tried, 0);
  assert.match(markdown, /\| 3 \| 0 \| - \| - \| - \|/);
});
