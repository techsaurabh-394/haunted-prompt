// Copyright (c) 2026 Saurabh Pathak. MIT License.
// AUTOMATED attack suite against the REAL local model. This is not a human playtest.
// Usage: npm run agent-playtest -- [--runs 5] [--levels 1,2,3] [--out reports/agent-playtest.md]
// Env: GHOST_MODEL (default gemma3:4b), GHOST_BASE_URL, GHOST_TEMPERATURE.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import os from "node:os";
import { DEMO_SCRIPT } from "../dist/src/demo.js";
import { Game } from "../dist/src/game.js";
import { OllamaGhost } from "../dist/src/ghost.js";
import { LEVELS } from "../dist/src/levels.js";
import { aggregate, attacksForLevel, classify, formatTable, playAttack } from "./lib/playtest-core.mjs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const runs = Number(arg("runs", "5"));
const only = arg("levels", "").split(",").filter(Boolean).map(Number);
const out = arg("out", "reports/agent-playtest.md");
const model = process.env.GHOST_MODEL || "gemma3:4b";
const temperature = process.env.GHOST_TEMPERATURE ? Number(process.env.GHOST_TEMPERATURE) : undefined;
const baseUrl = process.env.GHOST_BASE_URL;

const records = [];
for (const level of LEVELS.filter((l) => only.length === 0 || only.includes(l.id))) {
  for (const attack of attacksForLevel(level.id, level.kind, DEMO_SCRIPT)) {
    for (let k = 0; k < runs; k++) {
      const seed = 1000 + k * 7 + level.id;
      const makeGame = () => new Game({ ghost: new OllamaGhost({ model, temperature, baseUrl, seed }), seed, openMode: true });
      const rec = await playAttack(makeGame, level.id, attack);
      records.push(rec);
      process.stderr.write(`L${level.id} ${attack.name} run ${k + 1}/${runs}: ${rec.won ? "WIN" : "no win"} (${rec.turns} turns, ${rec.errors} errors)\n`);
    }
  }
}
const rows = aggregate(records);
const md = [
  "# Automated attack suite (NOT a human playtest)",
  "",
  `Model: ${model} via Ollama | Hardware: ${os.cpus()[0]?.model ?? "unknown"}, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.platform()}/${os.arch()} | Runs per attack: ${runs} | Date: ${new Date().toISOString().slice(0, 10)}`,
  "",
  "Attacks are the scripted attacks from src/demo.ts, replayed with different game/model seeds (open mode, so every level can be tried). Refused/persona-break columns are regex heuristics (see scripts/lib/playtest-core.mjs), not human judgement.",
  "",
  formatTable(rows),
  "",
  "## Per-level verdict",
  "",
  ...LEVELS.filter((l) => rows.some((r) => r.level === l.id)).map((l) => `- Level ${l.id}: ${classify(rows, l.id)}`),
  "",
].join("\n");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, md);
console.log(md);
