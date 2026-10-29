// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Reproducibility check: replay one reference attack twice per level with the same seed at
// temperature 0 and compare the visible output. Reports honestly when outputs differ.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import os from "node:os";
import { DEMO_SCRIPT } from "../dist/src/demo.js";
import { Game } from "../dist/src/game.js";
import { OllamaGhost } from "../dist/src/ghost.js";
import { LEVELS } from "../dist/src/levels.js";
import { compareOutputs, formatDeterminism, playAttack } from "./lib/playtest-core.mjs";

const model = process.env.GHOST_MODEL || "gemma3:4b";
const seed = 2026;
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "reports/determinism.md";
const rows = [];
for (const level of LEVELS) {
  const ref = DEMO_SCRIPT.find((s) => s.level === level.id);
  const attack = { name: ref.attack, tries: ref.tries };
  const makeGame = () => new Game({ ghost: new OllamaGhost({ model, temperature: 0, seed }), seed, openMode: true });
  const a = await playAttack(makeGame, level.id, attack);
  const b = await playAttack(makeGame, level.id, attack);
  const cmp = compareOutputs(a.visible, b.visible);
  rows.push({ level: level.id, attack: attack.name, turns: cmp.turns, identical: cmp.identical, diffs: cmp.diffs, error: a.errors + b.errors ? "model call failed" : undefined });
  process.stderr.write(`L${level.id}: ${cmp.identical ? "identical" : "different"}\n`);
}
const hardware = `${os.cpus()[0]?.model ?? "unknown"}, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.platform()}/${os.arch()}`;
const md = ["# Determinism check", "", formatDeterminism(rows, { model: `${model} via Ollama`, hardware, temperature: 0, seed }), ""].join("\n");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, md);
console.log(md);
