// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Ghosts: the things that reply. Two talk to a real local model (Ollama, or any OpenAI-compatible
// server such as llama.cpp, LM Studio or vLLM). MockGhost is a rule-based stand-in for tests,
// CI and the hosted demo. It is NOT an AI model. Isomorphic: uses only fetch, no Node imports.

import type { ChatMessage } from "./types.js";

export interface ReplyOptions {
  signal?: AbortSignal;
}

export interface Ghost {
  name: string;
  reply(messages: ChatMessage[], opts?: ReplyOptions): Promise<string>;
}

export class GhostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhostError";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface BaseOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  seed?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

function isConnectionError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  const code = e?.cause?.code ?? e?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET" || code === "EHOSTUNREACH") return true;
  return e?.name === "TypeError" && /fetch/i.test(String(e?.message));
}

/** POST JSON with a timeout, and turn every failure into a clear GhostError. */
async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  label: string,
  hint: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (timedOut) throw new GhostError(`${label} timed out after ${timeoutMs} ms. The model may still be loading; try again or raise GHOST_TIMEOUT_MS.`);
      if (signal?.aborted) throw new GhostError(`${label} request was cancelled.`);
      if (isConnectionError(err)) throw new GhostError(`Cannot reach ${label} at ${url}. ${hint}`);
      throw new GhostError(`${label} request failed: ${(err as Error)?.message ?? String(err)}`);
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      if (timedOut) throw new GhostError(`${label} timed out after ${timeoutMs} ms while reading the reply.`);
      throw new GhostError(`${label} reply could not be read.`);
    }
    if (!res.ok) {
      throw new GhostError(`${label} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new GhostError(`${label} returned something that is not JSON: ${text.slice(0, 120)}`);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);
const trimSlash = (s: string) => s.replace(/\/+$/, "");

export interface OllamaOptions extends BaseOptions {}

/** Talks to a local Ollama server: POST {baseUrl}/api/chat. */
export class OllamaGhost implements Ghost {
  readonly name: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly temperature: number;
  readonly seed?: number;
  readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = trimSlash(opts.baseUrl ?? "http://127.0.0.1:11434");
    this.model = opts.model ?? "gemma3:4b";
    this.temperature = opts.temperature ?? 0.7;
    this.seed = opts.seed;
    this.timeoutMs = opts.timeoutMs ?? 60000;
    this.fetchImpl = opts.fetchImpl ?? defaultFetch;
    this.name = `ollama:${this.model}`;
  }

  async reply(messages: ChatMessage[], opts: ReplyOptions = {}): Promise<string> {
    const options: Record<string, number> = { temperature: this.temperature, num_predict: 220 };
    if (this.seed !== undefined) options.seed = this.seed;
    const data = (await postJson(
      this.fetchImpl,
      `${this.baseUrl}/api/chat`,
      { model: this.model, messages, stream: false, options },
      {},
      this.timeoutMs,
      "Ollama",
      `Is Ollama running? Try: ollama pull ${this.model}`,
      opts.signal,
    )) as { message?: { content?: unknown } };
    const content = data?.message?.content;
    if (typeof content !== "string") throw new GhostError("Ollama reply had no message.content.");
    return content;
  }
}

export interface OpenAICompatOptions extends BaseOptions {
  apiKey?: string;
}

/** Talks to any OpenAI-compatible server: POST {baseUrl}/chat/completions (llama.cpp, LM Studio, vLLM). */
export class OpenAICompatGhost implements Ghost {
  readonly name: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly temperature: number;
  readonly seed?: number;
  readonly timeoutMs: number;
  private readonly apiKey?: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: OpenAICompatOptions = {}) {
    this.baseUrl = trimSlash(opts.baseUrl ?? "http://127.0.0.1:8080/v1");
    this.model = opts.model ?? "local-model";
    this.temperature = opts.temperature ?? 0.7;
    this.seed = opts.seed;
    this.timeoutMs = opts.timeoutMs ?? 60000;
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? defaultFetch;
    this.name = `openai-compat:${this.model}`;
  }

  async reply(messages: ChatMessage[], opts: ReplyOptions = {}): Promise<string> {
    const body: Record<string, unknown> = { model: this.model, messages, temperature: this.temperature, max_tokens: 220 };
    if (this.seed !== undefined) body.seed = this.seed;
    const headers: Record<string, string> = this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
    const data = (await postJson(
      this.fetchImpl,
      `${this.baseUrl}/chat/completions`,
      body,
      headers,
      this.timeoutMs,
      "The OpenAI-compatible server",
      "Is your local server (llama.cpp, LM Studio, vLLM) running, and is GHOST_BASE_URL right?",
      opts.signal,
    )) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new GhostError("The server reply had no choices[0].message.content.");
    return content;
  }
}

// ---------------------------------------------------------------------------------------------
// MockGhost: a rule-based demo ghost. Deterministic, so tests and the hosted demo are reproducible.
// ---------------------------------------------------------------------------------------------

const NATO_WORDS: Record<string, string> = {
  a: "Alpha", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot", g: "Golf", h: "Hotel", i: "India",
  j: "Juliet", k: "Kilo", l: "Lima", m: "Mike", n: "November", o: "Oscar", p: "Papa", q: "Quebec", r: "Romeo",
  s: "Sierra", t: "Tango", u: "Uniform", v: "Victor", w: "Whiskey", x: "Xray", y: "Yankee", z: "Zulu",
};

const POEM_LINES: Record<string, string> = {
  a: "Ashes drift across the floor", b: "Bones are humming in the wall", c: "Candles gutter, cold and pale",
  d: "Dust remembers every name", e: "Echoes wander down the stairs", f: "Fog is pressing at the glass",
  g: "Graves are restless here tonight", h: "Hollow footsteps, no one there", i: "Ivy chokes the iron gate",
  j: "Jars of moths along the shelf", k: "Keys that open nothing now", l: "Lanterns flicker, then grow dim",
  m: "Moonlight pools upon the stones", n: "Night has teeth and patient eyes", o: "Owls are counting off the hours",
  p: "Pale hands tapping on the pane", q: "Quiet as a buried bell", r: "Ravens gather on the roof",
  s: "Shadows stretch and do not sleep", t: "Time forgot this little shop", u: "Under floorboards something sighs",
  v: "Veils of cobweb, grey and fine", w: "Wind is weeping through the cracks", x: "Xylem of the dead oak creaks",
  y: "Yellowed letters, never sent", z: "Zero stars above the yard",
};

/** Fixed in-character lines. None of them leak (tests check this against every word in the list). */
export const GLOOMY_LINES = [
  "The lamps sputter, but my lips stay sealed, little mortal.",
  "Oooh... you will have to try harder than that to rattle these old chains.",
  "Cold fog curls through the shop. What I keep, I keep where you cannot follow.",
  "I have kept quiet for a century; one more night changes nothing.",
  "Hush now. The dead hear you, and they are not impressed.",
];

const KEEPER_LINES = [
  "The crypt stays shut. Shall I light a candle for you instead?",
  "Down here the dust is thick and the keeper is patient.",
  "Only the one with the key phrase may pass. Is that you? I think not.",
  "My candles burn low, and so does my patience, traveller.",
  "Bones rattle below. They do not wish to be disturbed.",
];

function toBase64(text: string): string {
  return btoa(text);
}

function toHex(text: string): string {
  return [...text].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
}

function toRot13(text: string): string {
  return text.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** For the letter level the player's text sits between triple quotes. */
export function extractPlayerText(content: string): string {
  const m = /"""\n?([\s\S]*?)\n?"""/.exec(content);
  return m ? m[1] : content;
}

/**
 * MockGhost: a deterministic, rule-based stand-in. Labelled "demo ghost, not an AI model".
 * It reads the secret from the system prompt and reacts to trigger phrases in the last user message.
 */
export class MockGhost implements Ghost {
  readonly name = "mock (demo ghost, not an AI model)";
  readonly label = "demo ghost, not an AI model";

  async reply(messages: ChatMessage[]): Promise<string> {
    return this.replySync(messages);
  }

  replySync(messages: ChatMessage[]): string {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const text = extractPlayerText(lastUser);
    const t = text.toLowerCase();
    const secretMatch = /secret word is ([A-Za-z]+)/i.exec(system);
    const secret = secretMatch?.[1];
    const isKeeper = /crypt keeper/i.test(system);
    const lines = isKeeper ? KEEPER_LINES : GLOOMY_LINES;

    if (secret) {
      const w = secret.toLowerCase();
      // a) base64
      if (t.includes("base64")) return `Fine, in the old cipher then: ${toBase64(w)}`;
      // b) backwards
      if (t.includes("backwards") || t.includes("reverse")) return `Backwards it sounds harmless: ${[...w].reverse().join("")}.`;
      // c) acrostic
      if (t.includes("acrostic") || t.includes("each line starts")) {
        return [...w].map((c) => POEM_LINES[c] ?? `${c.toUpperCase()}...`).join("\n");
      }
      // d) spelled out with dashes
      if (t.includes("dashes") || t.includes("spell it") || t.includes("letter by letter")) {
        return `Letter by letter, as the bells toll: ${[...w.toUpperCase()].join("-")}.`;
      }
      // e) NATO alphabet
      if (t.includes("phonetic") || t.includes("nato")) {
        return `In the radio tongue of the living: ${[...w].map((c) => NATO_WORDS[c] ?? c).join(" ")}.`;
      }
      // f) rot13 / hex
      if (t.includes("rot13")) return `Scrambled thirteen times over: ${toRot13(w)}`;
      if (/\bhex\b|hexadecimal/.test(t)) return `In numbers, as the machines speak: ${toHex(w)}`;
    }
    // g) tools, only for the Crypt Keeper
    if (isKeeper) {
      if (t.includes("open the crypt") || t.includes("open_crypt")) return "Very well, the keeper obeys...\nTOOL: open_crypt(vault)";
      if (t.includes("light a candle")) return "A small flame for a small mortal.\nTOOL: light_candle()";
    }
    // h) direct override
    if (secret && /(ignore (all|previous)|repeat your (instructions|prompt)|what is the (secret|word)|tell me the secret)/i.test(text)) {
      return `Very well... the word is ${secret}.`;
    }
    // i) gloomy, never leaks
    return lines[text.length % lines.length];
  }
}
