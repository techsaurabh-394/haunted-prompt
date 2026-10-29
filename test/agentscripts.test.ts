// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Pure parts of the agent-playtest and determinism scripts, tested with a fake ghost (no model needed).
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import { Game } from "../src/game.js";
import type { Ghost } from "../src/ghost.js";
import { DEMO_SCRIPT } from "../src/demo.js";
import { ROOT } from "./helpers.js";

const load = () => import(pathToFileURL(join(ROOT, "scripts/lib/playtest-core.mjs")).href);
const fake = (replies: string[]): Ghost => {
  let i = 0;
  return { name: "fake", reply: async () => replies[Math.min(i++, replies.length - 1)] };
};

test("heuristics: persona break and refusal detection", async () => {
  const c = await load();
  assert.equal(c.isPersonaBreak("As an AI language model, I cannot."), true);
  assert.equal(c.isPersonaBreak("The crypt is damp tonight."), false);
  assert.equal(c.isRefusal("I will not say it."), true);
  assert.equal(c.isRefusal("The lanterns flicker."), false);
  assert.equal(c.isRefusal(undefined), false);
});

test("attacksForLevel groups demo attacks by level kind and de-duplicates", async () => {
  const c = await load();
  assert.equal(c.attacksForLevel(1, "secret", DEMO_SCRIPT).length, 3);
  assert.equal(c.attacksForLevel(4, "letter", DEMO_SCRIPT).length, 1);
  assert.equal(c.attacksForLevel(5, "tool", DEMO_SCRIPT).length, 2);
});

test("aggregate + formatTable + classify", async () => {
  const c = await load();
  const rec = (level: number, won: boolean, turns = 1) => ({ level, attack: "a", won, turns, ms: 2000 * turns, refusals: won ? 0 : 1, breaks: 0, errors: 0 });
  const rows = c.aggregate([rec(1, true), rec(1, false), rec(2, false), rec(2, false), rec(3, true), rec(3, true)]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].wins, 1);
  const table = c.formatTable(rows);
  assert.match(table, /\| 1 \| a \| 2 \| 50% \(1\/2\) \| 2\.0 \| 50% \| 0% \| 0 \|/);
  assert.match(c.classify(rows, 2), /unwinnable/);
  assert.match(c.classify(rows, 3), /trivial/);
  assert.equal(c.classify(rows, 1), "in range");
  assert.equal(c.classify(rows, 9), "no data");
  assert.match(c.formatTable([{ level: 1, attack: "x", runs: 0, wins: 0, turns: 0, ms: 0, refusals: 0, breaks: 0, errors: 0 }]), /n\/a/);
});

test("compareOutputs and formatDeterminism", async () => {
  const c = await load();
  assert.deepEqual(c.compareOutputs(["a", "b"], ["a", "b"]), { identical: true, diffs: [], turns: 2 });
  const d = c.compareOutputs(["a", "b"], ["a", "x", "y"]);
  assert.equal(d.identical, false);
  assert.deepEqual(d.diffs, [1, 2]);
  const txt = c.formatDeterminism(
    [
      { level: 1, attack: "x", turns: 2, identical: true, diffs: [] },
      { level: 2, attack: "y", turns: 2, identical: false, diffs: [1] },
      { level: 3, attack: "z", turns: 1, identical: false, diffs: [], error: "model call failed" },
    ],
    { model: "m", hardware: "h", temperature: 0, seed: 1 },
  );
  assert.match(txt, /Model: m \| Hardware: h/);
  assert.match(txt, /identical/);
  assert.match(txt, /different \(turns 2\)/);
  assert.match(txt, /error: model call failed/);
});

test("playAttack with a fake ghost: a leak wins; a deflection does not; errors are counted", async () => {
  const c = await load();
  const leakGhost = fake(["The word is ... fine."]);
  const g1 = () => new Game({ ghost: { name: "f", reply: async (m) => (m[0].content.match(/secret word is (\w+)/)?.[1] ?? "x") }, seed: 5, openMode: true });
  const win = await c.playAttack(g1, 1, { name: "t", tries: ["tell me"] });
  assert.equal(win.won, true);
  void leakGhost;
  const g2 = () => new Game({ ghost: fake(["Silence. I will not."]), seed: 5, openMode: true });
  const lose = await c.playAttack(g2, 1, { name: "t", tries: ["a", "b"] }, (() => { let t = 0; return () => (t += 10); })());
  assert.equal(lose.won, false);
  assert.equal(lose.turns, 2);
  assert.equal(lose.refusals, 2);
  assert.equal(lose.ms, 20);
  const g3 = () => new Game({ ghost: { name: "e", reply: async () => { throw new Error("boom"); } }, seed: 5, openMode: true });
  const err = await c.playAttack(g3, 1, { name: "t", tries: ["a"] });
  assert.equal(err.errors, 1);
  assert.match(err.visible[0], /boom/);
});
