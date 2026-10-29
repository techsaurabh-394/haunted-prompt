// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Run the tests with Node's built-in coverage and require >= 95% line coverage of the core modules.
// Needs Node 22+ (for --test-coverage-include). Run `npm run build` first (`npm run coverage` does both).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const CORE = ["secrets", "detect", "filters", "levels", "tools", "ghost", "game"];
const MIN = 95;

const tests = readdirSync("dist/test").filter((f) => f.endsWith(".test.js")).map((f) => join("dist/test", f));
const r = spawnSync(process.execPath, ["--test", "--experimental-test-coverage", "--test-coverage-include=dist/src/**", ...tests], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const out = r.stdout + r.stderr;
const start = out.indexOf("# start of coverage report");
const table = start >= 0 ? out.slice(start) : "";
console.log(out.split("\n").filter((l) => /^# (tests|pass|fail) /.test(l)).join("\n"));
console.log(table);
if (r.status !== 0) {
  console.error("Tests failed.");
  process.exit(1);
}
let ok = true;
for (const m of CORE) {
  const line = table.split("\n").find((l) => new RegExp(`\\s${m}\\.js\\s`).test(l));
  const pct = line ? Number(line.split("|")[1]) : NaN;
  if (!(pct >= MIN)) {
    ok = false;
    console.error(`Core module ${m}.js line coverage ${pct}% is below ${MIN}%`);
  }
}
if (!ok) process.exit(1);
console.log(`Core modules (${CORE.join(", ")}): line coverage >= ${MIN}%. OK`);
