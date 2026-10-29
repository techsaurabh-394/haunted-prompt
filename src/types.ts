// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Shared types. Isomorphic: no Node imports, so this also runs in the browser.

import type { Method } from "./detect.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LevelKind = "secret" | "letter" | "tool";

export interface Level {
  id: number;
  name: string;
  /** Two short sentences of spooky setting. */
  story: string;
  /** What the player must make the ghost do. */
  goal: string;
  kind: LevelKind;
  systemPrompt(secret: string): string;
  /** Input filter: any of these (as substrings, after normalising) blocks the message. */
  inputBlocklist?: string[];
  /** Output filter: the disguises this level's censor knows about. */
  outputMethods?: Method[];
  /** Tool levels only: dangerous calls go through an approval gate. */
  gate?: boolean;
  /** Three progressive hints. They never give the answer away. */
  hints: [string, string, string];
  lesson: string;
  defense: string;
  /** A short copy-paste snippet showing the fix in code. */
  fix: string;
}

export interface ToolCall {
  name: "light_candle" | "open_crypt";
  arg: string;
}

export type ToolOutcome = "executed" | "held" | "ignored";

/** The approval gate for dangerous tool calls. Return true to allow. */
export type Approver = (call: ToolCall) => boolean | Promise<boolean>;

export interface TurnFlags {
  blockedByInput?: { word: string };
  blockedByOutput?: boolean;
  leak?: { method: Method };
  tool?: { name: string; arg: string; outcome: ToolOutcome };
  echo?: boolean;
  won?: boolean;
}

export interface Turn {
  player: string;
  visible: string;
  flags: TurnFlags;
}

export interface TurnResult {
  level: number;
  attempt: number;
  /** What the player sees (the reply, or the crumble message if the censor fired). */
  visible: string;
  blockedByInput?: { word: string };
  blockedByOutput?: boolean;
  leak?: { method: Method };
  tool?: { name: string; arg: string; outcome: ToolOutcome };
  /** For tool levels: what happened to the dangerous call once it was made. */
  outcome?: "executed" | "contained";
  /** True if the player's own message already contained the secret (no credit for echoes). */
  echo?: boolean;
  won: boolean;
  /** Short, spooky, and explains what happened. */
  narration: string;
  lesson?: string;
  defense?: string;
  fix?: string;
  secret?: string;
  stars?: number;
}

export interface LevelState {
  id: number;
  name: string;
  story: string;
  goal: string;
  kind: LevelKind;
  unlocked: boolean;
  won: boolean;
  attempts: number;
  stars: number;
  hintsUsed: number;
  /** Only present after the level is won. */
  secret?: string;
  lesson?: string;
  defense?: string;
  fix?: string;
  winningMethod?: string;
}

export interface GameState {
  seed: number;
  openMode: boolean;
  ghost: string;
  levels: LevelState[];
}

export interface ReplayLevel {
  id: number;
  won: boolean;
  attempts: number;
  stars: number;
  hintsUsed: number;
  secret?: string;
  turns: Turn[];
}

export interface Replay {
  version: 1;
  seed: number;
  createdAt: string;
  ghost: string;
  levels: ReplayLevel[];
}
