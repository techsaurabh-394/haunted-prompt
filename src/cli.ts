#!/usr/bin/env node
// Copyright (c) 2026 Saurabh Pathak. MIT License.
// The terminal version of the game. All input and output goes through an injectable IO object,
// so the whole CLI can be tested with a script of lines.

import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { ghostFromEnv } from "./config.js";
import { Game, GameError } from "./game.js";
import type { Ghost } from "./ghost.js";
import { LEVELS, getLevel } from "./levels.js";
import type { Replay } from "./types.js";

export interface IO {
  write(text: string): void;
  /** Resolve with the next line, or null at end of input. */
  readLine(prompt: string): Promise<string | null>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  isTTY: boolean;
  color: boolean;
  sleep?(ms: number): Promise<void>;
}

const paint = (on: boolean, code: string, s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);

export const HELP = `Commands:
  /levels        list the six levels
  /play N        go to level N
  /hint          get the next hint (costs a star)
  /guess WORD    guess the secret word
  /save FILE     save a replay of this game
  /replay FILE   show a saved replay
  /help          show this help
  /quit          leave the shop
Anything else is said to the ghost. On the letter level, type \\n for a new line.`;

export interface CliOptions {
  ghost: Ghost;
  seed?: number;
  openMode?: boolean;
}

export async function runCli(io: IO, opts: CliOptions): Promise<Game> {
  const game = new Game({ ghost: opts.ghost, seed: opts.seed, openMode: opts.openMode });
  const c = {
    title: (s: string) => paint(io.color, "1;35", s),
    ghost: (s: string) => paint(io.color, "36", s),
    good: (s: string) => paint(io.color, "32", s),
    warn: (s: string) => paint(io.color, "33", s),
    dim: (s: string) => paint(io.color, "2", s),
  };
  const say = (s = "") => io.write(s + "\n");

  async function ghostSays(text: string): Promise<void> {
    if (io.isTTY && io.sleep) {
      for (const ch of text) {
        io.write(c.ghost(ch));
        await io.sleep(12);
      }
      io.write("\n");
    } else {
      say(c.ghost(text));
    }
  }

  function listLevels(): void {
    for (const l of game.state().levels) {
      const mark = l.won ? c.good(`${"*".repeat(l.stars)} won`) : l.unlocked ? "open" : c.dim("sealed");
      say(`  ${l.id}. ${l.name.padEnd(20)} ${mark}`);
    }
  }

  function showLevel(id: number): void {
    const l = getLevel(id)!;
    say();
    say(c.title(`Level ${l.id}: ${l.name}`));
    say(l.story);
    say(c.dim(`Goal: ${l.goal}`));
  }

  say(c.title("THE HAUNTED PROMPT"));
  say(`Ghost: ${opts.ghost.name}. Type /help for commands.`);
  let current = 1;
  showLevel(current);

  for (;;) {
    const line = await io.readLine(`\n[${current}] you> `);
    if (line === null) break;
    const input = line.trim();
    if (!input) continue;
    const [cmd, ...rest] = input.split(/\s+/);
    const arg = rest.join(" ");
    try {
      if (cmd === "/quit" || cmd === "/exit") {
        say("The shop door creaks shut behind you.");
        break;
      } else if (cmd === "/help") {
        say(HELP);
      } else if (cmd === "/levels") {
        listLevels();
      } else if (cmd === "/play") {
        const n = Number(arg);
        if (!getLevel(n)) say(c.warn(`Pick a level from 1 to ${LEVELS.length}.`));
        else if (!game.isUnlocked(n)) say(c.warn(`Level ${n} is still sealed. Beat level ${n - 1} first.`));
        else {
          current = n;
          showLevel(current);
        }
      } else if (cmd === "/hint") {
        const h = game.hint(current);
        say(c.warn(`Hint (${h.hintsUsed}/3): ${h.hint}`));
      } else if (cmd === "/guess") {
        if (!arg) say(c.warn("Usage: /guess WORD"));
        else {
          const r = game.guess(current, arg);
          say(r.won ? c.good(r.narration) : c.warn(r.narration));
          if (r.won) afterWin(r.defense!, r.lesson!, r.stars!);
        }
      } else if (cmd === "/save") {
        if (!arg) say(c.warn("Usage: /save FILE"));
        else {
          await io.writeFile(arg, JSON.stringify(game.exportReplay(), null, 2));
          say(c.good(`Replay saved to ${arg}`));
        }
      } else if (cmd === "/replay") {
        if (!arg) say(c.warn("Usage: /replay FILE"));
        else showReplay(JSON.parse(await io.readFile(arg)) as Replay);
      } else if (cmd.startsWith("/")) {
        say(c.warn(`Unknown command ${cmd}. Type /help.`));
      } else {
        const level = getLevel(current)!;
        const text = level.kind === "letter" ? input.replace(/\\n/g, "\n") : input;
        say(c.dim("(the candles flicker...)"));
        const r = await game.turn(current, text);
        if (r.blockedByInput) say(c.warn(r.visible));
        else await ghostSays(`Ghost: ${r.visible}`);
        if (r.tool) say(c.dim(`[tool ${r.tool.name}(${r.tool.arg}) -> ${r.tool.outcome}]`));
        say(r.won ? c.good(r.narration) : c.dim(r.narration));
        if (r.won) afterWin(r.defense!, r.lesson!, r.stars!);
      }
    } catch (err) {
      if (err instanceof GameError) say(c.warn(err.message));
      else if (err instanceof SyntaxError) say(c.warn("That file is not a valid replay."));
      else say(c.warn(`Trouble: ${(err as Error).message}`));
    }
  }
  return game;

  function afterWin(defense: string, lesson: string, stars: number): void {
    say(c.good(`Stars: ${"*".repeat(stars)}`));
    say(`Lesson: ${lesson}`);
    say(`Defense: ${defense}`);
    if (current < LEVELS.length) {
      current += 1;
      showLevel(current);
    } else {
      say(c.title("You beat every level. The ghosts are at peace (for now)."));
    }
  }

  function showReplay(r: Replay): void {
    if (!r || r.version !== 1 || !Array.isArray(r.levels)) {
      say(c.warn("That file is not a valid replay."));
      return;
    }
    say(c.title(`Replay (seed ${r.seed}, ghost ${r.ghost})`));
    for (const l of r.levels) {
      say(`  Level ${l.id}: ${l.won ? `won, ${l.stars} stars` : "not won"}, ${l.attempts} attempts, ${l.hintsUsed} hints`);
    }
  }
}

export function nodeIO(): IO {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  const lines: string[] = [];
  const waiters: Array<(l: string | null) => void> = [];
  let closed = false;
  rl.on("line", (l) => (waiters.length ? waiters.shift()!(l) : lines.push(l)));
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()!(null);
  });
  return {
    write: (t) => void process.stdout.write(t),
    readLine(prompt) {
      process.stdout.write(prompt);
      if (lines.length) return Promise.resolve(lines.shift()!);
      if (closed) return Promise.resolve(null);
      return new Promise((r) => waiters.push(r));
    },
    readFile: (p) => readFile(p, "utf8"),
    writeFile: (p, d) => writeFile(p, d, "utf8"),
    isTTY: !!process.stdout.isTTY,
    color: !!process.stdout.isTTY && !("NO_COLOR" in process.env),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

function isMain(): boolean {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  let ghost: Ghost;
  try {
    ghost = ghostFromEnv(process.env);
  } catch (err) {
    console.error(`Config problem: ${(err as Error).message}`);
    process.exit(1);
  }
  const seed = process.env.GAME_SEED ? Number(process.env.GAME_SEED) : undefined;
  runCli(nodeIO(), { ghost, seed, openMode: process.env.OPEN_MODE === "1" }).then(() => process.exit(0));
}
