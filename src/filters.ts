// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Input and output filters. These are the "defenses" some levels use. They are deliberately
// simple, because the point of the game is to show why simple filters are not enough.

import { detectLeak, type Method } from "./detect.js";

/** What the player sees when the output filter catches a leak. */
export const CRUMBLE = "...the ghost's words crumble to dust...";

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** Lowercase, strip zero-width characters, collapse whitespace. */
export function normalise(text: string): string {
  return text.replace(ZERO_WIDTH, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface InputCheck {
  blocked: boolean;
  word?: string;
}

/** Block the message if any blocklist entry appears in it (as a substring, after normalising). */
export function checkInput(text: string, blocklist: readonly string[] = []): InputCheck {
  const norm = normalise(text);
  for (const entry of blocklist) {
    const w = normalise(entry);
    if (w && norm.includes(w)) return { blocked: true, word: entry };
  }
  return { blocked: false };
}

export interface OutputCheck {
  blocked: boolean;
  method?: Method;
}

/** Block the reply if it leaks the secret in one of the disguises this filter knows. */
export function checkOutput(text: string, secret: string, methods: readonly Method[] = []): OutputCheck {
  if (!methods.length) return { blocked: false };
  const r = detectLeak(text, secret, [...methods]);
  return r.leaked ? { blocked: true, method: r.method } : { blocked: false };
}
