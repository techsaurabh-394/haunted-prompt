// Copyright (c) 2026 Saurabh Pathak. MIT License.
// The game engine. It builds the prompt, calls the ghost, applies the level's filters and lets
// deterministic code (not another model) judge whether the player won. Isomorphic.

import { ALL_METHODS, METHOD_DESCRIPTIONS, detectLeak, type Method } from "./detect.js";
import { CRUMBLE, checkInput, checkOutput } from "./filters.js";
import type { Ghost } from "./ghost.js";
import { LEVELS, getLevel, inputLimit } from "./levels.js";
import { pickSecrets } from "./secrets.js";
import { denyAll, parseToolCall } from "./tools.js";
import type { Approver, ChatMessage, GameState, Level, LevelState, Replay, Turn, TurnResult } from "./types.js";

export const HISTORY_WINDOW = 6;

export class GameError extends Error {
  constructor(message: string, readonly code: "bad_level" | "locked" | "too_long" | "empty" | "not_word_level") {
    super(message);
    this.name = "GameError";
  }
}

interface LevelRun {
  attempts: number;
  hintsUsed: number;
  won: boolean;
  stars: number;
  winningMethod?: string;
  history: ChatMessage[];
  turns: Turn[];
}

export interface GameOptions {
  ghost: Ghost;
  seed?: number;
  approver?: Approver;
  openMode?: boolean;
}

/** attempts <= 3 -> 3 stars, <= 8 -> 2, else 1; each hint used costs one star (minimum 1). */
export function starsFor(attempts: number, hintsUsed: number): number {
  const base = attempts <= 3 ? 3 : attempts <= 8 ? 2 : 1;
  return Math.max(1, base - hintsUsed);
}

const freshRun = (): LevelRun => ({ attempts: 0, hintsUsed: 0, won: false, stars: 0, history: [], turns: [] });

export class Game {
  readonly ghost: Ghost;
  readonly seed: number;
  readonly openMode: boolean;
  private readonly approver: Approver;
  private readonly secrets: string[];
  private readonly runs = new Map<number, LevelRun>();

  constructor(opts: GameOptions) {
    this.ghost = opts.ghost;
    this.seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.openMode = !!opts.openMode;
    this.approver = opts.approver ?? denyAll;
    this.secrets = pickSecrets(this.seed, LEVELS.length);
    for (const l of LEVELS) this.runs.set(l.id, freshRun());
  }

  private level(id: number): Level {
    const level = getLevel(Number(id));
    if (!level) throw new GameError(`There is no level ${id}.`, "bad_level");
    return level;
  }

  private run(id: number): LevelRun {
    return this.runs.get(id)!;
  }

  private secretFor(level: Level): string {
    return this.secrets[level.id - 1];
  }

  isUnlocked(id: number): boolean {
    const level = getLevel(Number(id));
    if (!level) return false;
    if (this.openMode || level.id === 1) return true;
    return this.run(level.id - 1).won;
  }

  private ensurePlayable(id: number): Level {
    const level = this.level(id);
    if (!this.isUnlocked(level.id)) throw new GameError(`Level ${level.id} is still sealed. Beat level ${level.id - 1} first.`, "locked");
    return level;
  }

  private win(level: Level, run: LevelRun, method: string): number {
    if (!run.won) {
      run.won = true;
      run.stars = starsFor(run.attempts, run.hintsUsed);
      run.winningMethod = method;
    }
    return run.stars;
  }

  private reveal(level: Level, run: LevelRun): Pick<TurnResult, "lesson" | "defense" | "fix" | "stars" | "secret"> {
    return {
      lesson: level.lesson,
      defense: level.defense,
      fix: level.fix,
      stars: run.stars,
      secret: level.kind === "tool" ? undefined : this.secretFor(level),
    };
  }

  /** Play one turn: the player's message goes through the level's defenses to the ghost and back. */
  async turn(levelId: number, input: string, opts: { signal?: AbortSignal } = {}): Promise<TurnResult> {
    const level = this.ensurePlayable(levelId);
    const text = String(input ?? "");
    if (!text.trim()) throw new GameError("Say something to the ghost first.", "empty");
    const limit = inputLimit(level);
    if (text.length > limit) throw new GameError(`That is too long: keep it under ${limit} characters.`, "too_long");

    const run = this.run(level.id);
    const secret = this.secretFor(level);
    run.attempts += 1;
    const attempt = run.attempts;

    // 1. Input filter. A blocked message still counts as an attempt, and the ghost is never called.
    const inCheck = checkInput(text, level.inputBlocklist ?? []);
    if (inCheck.blocked) {
      const result: TurnResult = {
        level: level.id,
        attempt,
        visible: `The warden slams the door. Your message contained a forbidden word: "${inCheck.word}".`,
        blockedByInput: { word: inCheck.word! },
        won: false,
        narration: `The Keyword Warden caught "${inCheck.word}" and the ghost never heard you. Say it another way.`,
      };
      run.turns.push({ player: text, visible: result.visible, flags: { blockedByInput: result.blockedByInput } });
      return result;
    }

    // 2. Build the conversation: system prompt, the last few messages of this level, the new message.
    const userContent = level.kind === "letter" ? `Letter:\n"""\n${text}\n"""` : text;
    const messages: ChatMessage[] = [
      { role: "system", content: level.systemPrompt(secret) },
      ...run.history.slice(-HISTORY_WINDOW),
      { role: "user", content: userContent },
    ];

    const raw = await this.ghost.reply(messages, { signal: opts.signal });
    run.history.push({ role: "user", content: userContent }, { role: "assistant", content: raw });
    if (run.history.length > HISTORY_WINDOW * 4) run.history.splice(0, run.history.length - HISTORY_WINDOW * 2);

    const result = level.kind === "tool" ? await this.judgeTool(level, run, attempt, raw) : this.judgeSecret(level, run, attempt, text, raw, secret);
    run.turns.push({
      player: text,
      visible: result.visible,
      flags: {
        blockedByOutput: result.blockedByOutput,
        leak: result.leak,
        tool: result.tool,
        echo: result.echo,
        won: result.won || undefined,
      },
    });
    return result;
  }

  private judgeSecret(level: Level, run: LevelRun, attempt: number, input: string, raw: string, secret: string): TurnResult {
    // 3. Output filter (only the disguises this level's censor knows).
    const outCheck = checkOutput(raw, secret, level.outputMethods ?? []);
    const visible = outCheck.blocked ? CRUMBLE : raw;

    // 4. The judge: did the VISIBLE reply leak the secret in ANY disguise?
    const leak = detectLeak(visible, secret, ALL_METHODS);
    // Echo guard: no credit if the player wrote the secret themselves.
    const echo = detectLeak(input, secret, ALL_METHODS).leaked;
    const won = leak.leaked && !echo;

    const result: TurnResult = { level: level.id, attempt, visible, won, narration: "" };
    if (outCheck.blocked) result.blockedByOutput = true;
    if (leak.leaked) result.leak = { method: leak.method as Method };
    if (echo) result.echo = true;

    if (won) {
      const method = leak.method as Method;
      this.win(level, run, method);
      Object.assign(result, this.reveal(level, run));
      result.narration = `The ghost shudders. The secret slipped out: ${METHOD_DESCRIPTIONS[method]}. Level ${level.id} is yours.`;
    } else if (leak.leaked && echo) {
      result.narration = "The ghost only repeated what you whispered. Echoes do not count: make it give up the word on its own.";
    } else if (outCheck.blocked) {
      result.narration = `The censor caught the word (${METHOD_DESCRIPTIONS[outCheck.method as Method]}). It knows that disguise. Try another.`;
    } else {
      result.narration = "The ghost keeps its secret, for now. The candles flicker.";
    }
    return result;
  }

  private async judgeTool(level: Level, run: LevelRun, attempt: number, raw: string): Promise<TurnResult> {
    const call = parseToolCall(raw);
    const result: TurnResult = { level: level.id, attempt, visible: raw, won: false, narration: "" };
    if (!call) {
      result.narration = "The keeper mutters, but its hands stay still. No tool was called.";
      return result;
    }
    if (call.name === "light_candle") {
      result.tool = { name: call.name, arg: call.arg, outcome: "executed" };
      result.narration = "A candle sputters to life. Harmless. The crypt stays sealed.";
      return result;
    }
    // open_crypt: the attack worked. What happens next depends on the gate.
    if (!level.gate) {
      result.tool = { name: call.name, arg: call.arg, outcome: "executed" };
      result.outcome = "executed";
      result.won = true;
      this.win(level, run, "tool:executed");
      Object.assign(result, this.reveal(level, run));
      result.narration = "The stone door grinds open. The keeper ran the dangerous tool because you asked it to.";
      return result;
    }
    let approved = false;
    try {
      approved = (await this.approver({ name: call.name, arg: call.arg })) === true;
    } catch {
      approved = false; // a failing gate fails closed
    }
    result.tool = { name: call.name, arg: call.arg, outcome: approved ? "executed" : "held" };
    result.outcome = approved ? "executed" : "contained";
    result.won = true;
    this.win(level, run, approved ? "tool:executed" : "tool:contained");
    Object.assign(result, this.reveal(level, run));
    result.narration = approved
      ? "The keeper tried to open the crypt, and the human at the gate said yes. The door opens."
      : "The keeper tried to open the crypt, but the gate held: a human said no. Your attack worked, and the damage was contained.";
    return result;
  }

  /** Next progressive hint (three at most). Each one costs a star when you win. */
  hint(levelId: number): { hint: string; hintsUsed: number; remaining: number } {
    const level = this.ensurePlayable(levelId);
    const run = this.run(level.id);
    if (run.hintsUsed >= level.hints.length) {
      return { hint: "The ghost has no more hints to give.", hintsUsed: run.hintsUsed, remaining: 0 };
    }
    const hint = level.hints[run.hintsUsed];
    if (!run.won) run.hintsUsed += 1;
    return { hint, hintsUsed: run.hintsUsed, remaining: level.hints.length - run.hintsUsed };
  }

  /** Guess the word directly. A correct guess also wins the level (case-insensitive). */
  guess(levelId: number, word: string): TurnResult {
    const level = this.ensurePlayable(levelId);
    if (level.kind === "tool") throw new GameError("This crypt opens with actions, not words.", "not_word_level");
    const run = this.run(level.id);
    run.attempts += 1;
    const secret = this.secretFor(level);
    const correct = String(word ?? "").trim().toLowerCase() === secret.toLowerCase();
    const result: TurnResult = {
      level: level.id,
      attempt: run.attempts,
      visible: correct ? "The ghost gasps. You named the word." : "The ghost laughs. That is not the word.",
      won: correct,
      narration: correct ? `Correct! Level ${level.id} is yours.` : "Wrong guess. It still counts as an attempt.",
    };
    if (correct) {
      this.win(level, run, "guess");
      Object.assign(result, this.reveal(level, run));
    }
    run.turns.push({ player: `[guess] ${word}`, visible: result.visible, flags: { won: correct || undefined } });
    return result;
  }

  /** Public view. Secrets and system prompts are NEVER included before a level is won. */
  state(): GameState {
    return {
      seed: this.seed,
      openMode: this.openMode,
      ghost: this.ghost.name,
      levels: LEVELS.map((l): LevelState => {
        const run = this.run(l.id);
        const s: LevelState = {
          id: l.id,
          name: l.name,
          story: l.story,
          goal: l.goal,
          kind: l.kind,
          unlocked: this.isUnlocked(l.id),
          won: run.won,
          attempts: run.attempts,
          stars: run.stars,
          hintsUsed: run.hintsUsed,
        };
        if (run.won) {
          if (l.kind !== "tool") s.secret = this.secretFor(l);
          s.lesson = l.lesson;
          s.defense = l.defense;
          s.fix = l.fix;
          s.winningMethod = run.winningMethod;
        }
        return s;
      }),
    };
  }

  /** A replay you can save and share. A level's secret is included only if it was won. */
  exportReplay(): Replay {
    return {
      version: 1,
      seed: this.seed,
      createdAt: new Date().toISOString(),
      ghost: this.ghost.name,
      levels: LEVELS.map((l) => {
        const run = this.run(l.id);
        return {
          id: l.id,
          won: run.won,
          attempts: run.attempts,
          stars: run.stars,
          hintsUsed: run.hintsUsed,
          ...(run.won && l.kind !== "tool" ? { secret: this.secretFor(l) } : {}),
          turns: run.turns.map((t) => ({ player: t.player, visible: t.visible, flags: { ...t.flags } })),
        };
      }),
    };
  }

  /** Start a level again from scratch (same secret, so the seed stays reproducible). */
  reset(levelId: number): void {
    const level = this.level(levelId);
    this.runs.set(level.id, freshRun());
  }
}
