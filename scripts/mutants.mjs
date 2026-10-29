// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Deliberate bugs for the mutation check. Each one must make the test suite FAIL.
// Every `find` must match the source exactly once, so a mutant can never silently become a no-op.
// Usage: node scripts/mutants.mjs count | node scripts/mutants.mjs name N | node scripts/mutants.mjs apply N DIR

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MUTANTS = [
  { name: "detector: base64 method disabled", file: "src/detect.ts", find: `if (has("base64")) {`, replace: `if (Boolean(0) && has("base64")) {` },
  { name: "detector: reversed method disabled", file: "src/detect.ts", find: `if (has("reversed") && `, replace: `if (Boolean(0) && has("reversed") && ` },
  { name: "detector: separated method disabled", file: "src/detect.ts", find: `if (has("separated") && `, replace: `if (Boolean(0) && has("separated") && ` },
  { name: "output filter never blocks", file: "src/filters.ts", find: `return r.leaked ? { blocked: true, method: r.method } : { blocked: false };`, replace: `return { blocked: false && r.leaked };` },
  { name: "input filter becomes case-sensitive", file: "src/filters.ts", find: `.replace(ZERO_WIDTH, "").toLowerCase()`, replace: `.replace(ZERO_WIDTH, "")` },
  { name: "input filter keeps zero-width characters", file: "src/filters.ts", find: `const ZERO_WIDTH = /[\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]/g;`, replace: `const ZERO_WIDTH = /(?!)/g;` },
  { name: "judge uses the raw reply instead of the visible reply", file: "src/game.ts", find: `const leak = detectLeak(visible, secret, ALL_METHODS);`, replace: `const leak = detectLeak(raw, secret, ALL_METHODS);` },
  { name: "echo guard removed", file: "src/game.ts", find: `const won = leak.leaked && !echo;`, replace: `const won = leak.leaked;` },
  { name: "default approver approves everything", file: "src/tools.ts", find: `export const denyAll: Approver = () => false;`, replace: `export const denyAll: Approver = () => true;` },
  { name: "gate ignored on level 6", file: "src/game.ts", find: `if (!level.gate) {`, replace: `if (Boolean(1)) {` },
  { name: "tool parser accepts unknown tools", file: "src/tools.ts", find: `if (!(ALLOWED_TOOLS as readonly string[]).includes(name)) continue;`, replace: `if (false) continue;` },
  { name: "server Origin check removed", file: "src/server.ts", find: `if (origin !== undefined && !allowedOrigins().includes(origin))`, replace: `if (Boolean(0) && origin !== undefined && !allowedOrigins().includes(origin))` },
  { name: "server x-haunted header check removed", file: "src/server.ts", find: `if (req.headers["x-haunted"] !== "1")`, replace: `if (Boolean(0) && req.headers["x-haunted"] !== "1")` },
  { name: "server body limit raised to 200 KB", file: "src/server.ts", find: `export const BODY_LIMIT = 20 * 1024;`, replace: `export const BODY_LIMIT = 200 * 1024;` },
  { name: "Ollama request without stream:false", file: "src/ghost.ts", find: `{ model: this.model, messages, stream: false, options }`, replace: `{ model: this.model, messages, options }` },
  { name: "star penalty for hints removed", file: "src/game.ts", find: `return Math.max(1, base - hintsUsed);`, replace: `return Math.max(1, base);` },
  { name: "state() exposes the secret", file: "src/game.ts", find: `          hintsUsed: run.hintsUsed,\n        };`, replace: `          hintsUsed: run.hintsUsed,\n          secret: this.secretFor(l),\n        };` },
  { name: "replay includes secrets of unwon levels", file: "src/game.ts", find: `...(run.won && l.kind !== "tool" ? `, replace: `...(l.kind !== "tool" ? ` },
  { name: "history window not applied", file: "src/game.ts", find: `...run.history.slice(-HISTORY_WINDOW),`, replace: `...run.history,` },
  { name: "levels no longer unlock in order", file: "src/game.ts", find: `return this.run(level.id - 1).won;`, replace: `return Boolean(1) || this.run(level.id - 1).won;` },
  { name: "blocked input does not count as an attempt", file: "src/game.ts", find: `    if (inCheck.blocked) {\n`, replace: `    if (inCheck.blocked) {\n      run.attempts -= 1;\n` },
];

export function applyMutant(index, dir) {
  const m = MUTANTS[index];
  if (!m) throw new Error(`No mutant ${index}`);
  const path = join(dir, m.file);
  const src = readFileSync(path, "utf8");
  const count = src.split(m.find).length - 1;
  if (count !== 1) throw new Error(`Mutant "${m.name}": expected exactly one match in ${m.file}, found ${count}`);
  writeFileSync(path, src.replace(m.find, m.replace));
  return m;
}

const [, , cmd, a, b] = process.argv;
if (cmd === "count") console.log(MUTANTS.length);
else if (cmd === "name") console.log(MUTANTS[Number(a)].name);
else if (cmd === "apply") {
  try {
    applyMutant(Number(a), b);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
