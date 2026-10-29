// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Pick a ghost from environment variables. Node-side helper (the browser always uses MockGhost).

import { MockGhost, OllamaGhost, OpenAICompatGhost, type Ghost } from "./ghost.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, min: number, max: number): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ConfigError(`${key} must be a number between ${min} and ${max} (got "${raw}").`);
  }
  return n;
}

function url(env: Env, key: string): string | undefined {
  const raw = env[key];
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol");
  } catch {
    throw new ConfigError(`${key} must be an http(s) URL, for example http://127.0.0.1:11434 (got "${raw}").`);
  }
  return raw;
}

/**
 * GHOST_BACKEND = ollama (default) | openai | mock
 * GHOST_MODEL, GHOST_BASE_URL, GHOST_API_KEY, GHOST_SEED, GHOST_TEMPERATURE, GHOST_TIMEOUT_MS
 */
export function ghostFromEnv(env: Env): Ghost {
  const backend = (env.GHOST_BACKEND ?? "ollama").trim().toLowerCase() || "ollama";
  const seed = num(env, "GHOST_SEED", 0, 2 ** 31 - 1);
  const temperature = num(env, "GHOST_TEMPERATURE", 0, 2);
  const timeoutMs = num(env, "GHOST_TIMEOUT_MS", 1000, 600000);
  const baseUrl = url(env, "GHOST_BASE_URL");
  const model = env.GHOST_MODEL?.trim() || undefined;
  switch (backend) {
    case "ollama":
      return new OllamaGhost({ baseUrl, model, seed, temperature, timeoutMs });
    case "openai":
      if (!baseUrl) throw new ConfigError("GHOST_BACKEND=openai needs GHOST_BASE_URL, for example http://127.0.0.1:8080/v1");
      return new OpenAICompatGhost({ baseUrl, model, seed, temperature, timeoutMs, apiKey: env.GHOST_API_KEY });
    case "mock":
      return new MockGhost();
    default:
      throw new ConfigError(`Unknown GHOST_BACKEND "${backend}". Use ollama, openai or mock.`);
  }
}
