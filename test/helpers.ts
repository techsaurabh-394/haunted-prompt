// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Shared test helpers (not a test file itself).

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ghost } from "../src/ghost.js";
import type { ChatMessage } from "../src/types.js";

/** Project root (tests run from dist/test). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A ghost that records every call and answers with a fixed function. */
export class ScriptedGhost implements Ghost {
  name = "scripted";
  calls: ChatMessage[][] = [];
  constructor(private answer: (messages: ChatMessage[]) => string | Promise<string>) {}
  async reply(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages.map((m) => ({ ...m })));
    return this.answer(messages);
  }
}

export const secretFrom = (messages: ChatMessage[]): string => /secret word is ([A-Za-z]+)/i.exec(messages[0].content)?.[1] ?? "";

export const b64 = (t: string) => Buffer.from(t).toString("base64");
export const hex = (t: string) => [...t].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
export const rot13 = (t: string) =>
  t.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
