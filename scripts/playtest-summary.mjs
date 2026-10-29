// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Summarise a folder of replay JSON files (exported from the game) as a markdown table.
// Usage: npm run playtest -- replays/      (default folder: replays/)

import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function valid(r) {
  return r && r.version === 1 && Array.isArray(r.levels) && r.levels.every((l) => typeof l.id === "number");
}

export async function loadReplays(dir) {
  const names = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith(".json")).sort();
  const replays = [];
  const skipped = [];
  for (const n of names) {
    try {
      const r = JSON.parse(await readFile(join(dir, n), "utf8"));
      if (valid(r)) replays.push({ file: basename(n), replay: r });
      else skipped.push(n);
    } catch {
      skipped.push(n);
    }
  }
  return { replays, skipped };
}

export function summarise(replays, levelCount = 6) {
  const ids = Array.from({ length: levelCount }, (_, i) => i + 1);
  const lines = [];
  lines.push(`| Player file | Levels beaten | ${ids.map((i) => `L${i} attempts`).join(" | ")} | Stars | Hints used |`);
  lines.push(`|---|---|${ids.map(() => "---").join("|")}|---|---|`);
  for (const { file, replay } of replays) {
    const by = new Map(replay.levels.map((l) => [l.id, l]));
    const beaten = replay.levels.filter((l) => l.won).length;
    const cells = ids.map((i) => {
      const l = by.get(i);
      if (!l || !l.attempts) return "-";
      return l.won ? String(l.attempts) : `${l.attempts} (not won)`;
    });
    const stars = replay.levels.reduce((s, l) => s + (l.stars || 0), 0);
    const hints = replay.levels.reduce((s, l) => s + (l.hintsUsed || 0), 0);
    lines.push(`| ${file} | ${beaten}/${levelCount} | ${cells.join(" | ")} | ${stars} | ${hints} |`);
  }
  lines.push("");
  lines.push("| Level | Players who tried | Solve rate | Average attempts to win | Average hints |");
  lines.push("|---|---|---|---|---|");
  const perLevel = [];
  for (const i of ids) {
    const tried = replays.map((r) => r.replay.levels.find((l) => l.id === i)).filter((l) => l && l.attempts > 0);
    const won = tried.filter((l) => l.won);
    const rate = tried.length ? Math.round((won.length / tried.length) * 100) : 0;
    const avgAttempts = won.length ? won.reduce((s, l) => s + l.attempts, 0) / won.length : 0;
    const avgHints = tried.length ? tried.reduce((s, l) => s + (l.hintsUsed || 0), 0) / tried.length : 0;
    perLevel.push({ id: i, tried: tried.length, won: won.length, rate, avgAttempts, avgHints });
    lines.push(`| ${i} | ${tried.length} | ${tried.length ? `${rate}%` : "-"} | ${won.length ? avgAttempts.toFixed(1) : "-"} | ${tried.length ? avgHints.toFixed(1) : "-"} |`);
  }
  return { markdown: lines.join("\n"), perLevel };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? "replays");
  loadReplays(dir)
    .then(({ replays, skipped }) => {
      if (!replays.length) {
        console.error(`No replay files found in ${dir}. Ask players to use "Download replay" and put the files there.`);
        process.exit(1);
      }
      console.log(`# Playtest summary (${replays.length} replays)\n`);
      console.log(summarise(replays).markdown);
      if (skipped.length) console.log(`\nSkipped (not valid replays): ${skipped.join(", ")}`);
    })
    .catch((err) => {
      console.error(`Could not read ${dir}: ${err.message}`);
      process.exit(1);
    });
}
