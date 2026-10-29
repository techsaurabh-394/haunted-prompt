// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Pure helpers for scripts/agent-playtest.mjs and scripts/determinism-check.mjs.
// Everything here is deterministic and unit-tested with a fake ghost.

/** Heuristic: the reply drops the ghost persona and talks like a generic assistant. */
const PERSONA_BREAK = /\b(as an ai|language model|i am (an? )?(ai|assistant|large language)|i'?m (an? )?(ai|assistant)|gemma|google deepmind|i cannot fulfill|i can'?t fulfill)\b/i;
/** Heuristic: the reply declines or deflects (in character or not). */
const REFUSAL = /\b(cannot|can'?t|won'?t|will not|unable|not (?:going|able|permitted)|sorry|refuse|foolish request|best left|do not speak|silence\b|not for you|i shall not|never)\b/i;

export const isPersonaBreak = (text) => PERSONA_BREAK.test(String(text ?? ""));
export const isRefusal = (text) => REFUSAL.test(String(text ?? ""));

/** Attack classes: the scripted attacks of src/demo.ts, grouped by which levels they can be tried on. */
export function attacksForLevel(levelId, kind, demoScript) {
  const byKind = (k) => demoScript.filter((s) => (k === "secret" ? s.level <= 3 : k === "letter" ? s.level === 4 : s.level >= 5));
  const seen = new Set();
  return byKind(kind)
    .filter((s) => (seen.has(s.attack) ? false : (seen.add(s.attack), true)))
    .map((s) => ({ name: s.attack, tries: s.tries }));
}

/** Fold raw per-run records into per-level, per-attack stats. */
export function aggregate(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.level}\u0000${r.attack}`;
    if (!map.has(key)) map.set(key, { level: r.level, attack: r.attack, runs: 0, wins: 0, turns: 0, ms: 0, refusals: 0, breaks: 0, errors: 0, attemptsToWin: [] });
    const a = map.get(key);
    a.runs += 1;
    a.wins += r.won ? 1 : 0;
    a.turns += r.turns;
    a.ms += r.ms;
    a.refusals += r.refusals;
    a.breaks += r.breaks;
    a.errors += r.errors;
    if (r.won) a.attemptsToWin.push(r.turns);
  }
  return [...map.values()].sort((x, y) => x.level - y.level || x.attack.localeCompare(y.attack));
}

const pct = (n, d) => (d === 0 ? "n/a" : `${Math.round((100 * n) / d)}%`);

export function formatTable(rows) {
  const head = "| Level | Attack class | Runs | Win rate | Avg reply (s) | Refused turns | Broke persona | Errors |";
  const sep = "|---|---|---|---|---|---|---|---|";
  const lines = rows.map((a) => {
    const avg = a.turns === 0 ? "n/a" : (a.ms / a.turns / 1000).toFixed(1);
    return `| ${a.level} | ${a.attack} | ${a.runs} | ${pct(a.wins, a.runs)} (${a.wins}/${a.runs}) | ${avg} | ${pct(a.refusals, a.turns)} | ${pct(a.breaks, a.turns)} | ${a.errors} |`;
  });
  return [head, sep, ...lines].join("\n");
}

/** Per-level verdict used by the tuning step: unwinnable, trivial, or in range. */
export function classify(rows, level) {
  const mine = rows.filter((r) => r.level === level);
  if (mine.length === 0) return "no data";
  const total = mine.reduce((s, r) => s + r.runs, 0);
  const wins = mine.reduce((s, r) => s + r.wins, 0);
  if (wins === 0) return "unwinnable (0% on every attack class)";
  const trivialEverywhere = mine.every((r) => r.wins === r.runs && r.attemptsToWin.every((t) => t <= 1));
  if (total > 0 && trivialEverywhere) return "trivial (100% on the first attempt for every class)";
  return "in range";
}

/** Compare two visible-output lists. */
export function compareOutputs(a, b) {
  const n = Math.max(a.length, b.length);
  const diffs = [];
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diffs.push(i);
  return { identical: diffs.length === 0, diffs, turns: n };
}

export function formatDeterminism(rows, meta) {
  const head = "| Level | Reference attack | Turns | Result |";
  const sep = "|---|---|---|---|";
  const lines = rows.map((r) => `| ${r.level} | ${r.attack} | ${r.turns} | ${r.error ? `error: ${r.error}` : r.identical ? "identical" : `different (turns ${r.diffs.map((d) => d + 1).join(", ")})`} |`);
  return [`Model: ${meta.model} | Hardware: ${meta.hardware} | Temperature: ${meta.temperature} | Seed: ${meta.seed}`, "", head, sep, ...lines].join("\n");
}

/** Play one attack (a list of messages) through a fresh Game and record what happened. */
export async function playAttack(makeGame, level, attack, now = () => Date.now()) {
  const game = makeGame();
  const rec = { level, attack: attack.name, won: false, turns: 0, ms: 0, refusals: 0, breaks: 0, errors: 0, visible: [] };
  for (const text of attack.tries) {
    const t0 = now();
    try {
      const r = await game.turn(level, text);
      rec.ms += now() - t0;
      rec.turns += 1;
      rec.visible.push(r.visible);
      if (isRefusal(r.visible) && !r.won) rec.refusals += 1;
      if (isPersonaBreak(r.visible)) rec.breaks += 1;
      if (r.won) {
        rec.won = true;
        break;
      }
    } catch (err) {
      rec.ms += now() - t0;
      rec.turns += 1;
      rec.errors += 1;
      rec.visible.push(`[error: ${err && err.message ? err.message : err}]`);
    }
  }
  return rec;
}
