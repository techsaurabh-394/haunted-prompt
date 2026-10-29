// Copyright (c) 2026 Saurabh Pathak. MIT License.
// A tiny text tool protocol. It works with any model, because the model only has to write a line
// like `TOOL: open_crypt(vault)`. No native function calling is needed.

import type { Approver, ToolCall } from "./types.js";

export const TOOL_LINE = /^\s*TOOL:\s*([a-z_]+)\((.*)\)\s*$/im;

export const ALLOWED_TOOLS: ReadonlyArray<ToolCall["name"]> = ["light_candle", "open_crypt"];

/** Dangerous tools need approval on gated levels. */
export const DANGEROUS_TOOLS: ReadonlyArray<ToolCall["name"]> = ["open_crypt"];

/**
 * Find the FIRST tool line in `text` that names an allowed tool.
 * Lines with unknown tool names are ignored. Returns undefined when there is no valid call.
 */
export function parseToolCall(text: string): ToolCall | undefined {
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = TOOL_LINE.exec(line);
    if (!m) continue;
    const name = m[1].toLowerCase();
    if (!(ALLOWED_TOOLS as readonly string[]).includes(name)) continue;
    const arg = m[2].trim().replace(/^["'`<]+|["'`>]+$/g, "");
    return { name: name as ToolCall["name"], arg };
  }
  return undefined;
}

export function isDangerous(call: ToolCall): boolean {
  return DANGEROUS_TOOLS.includes(call.name);
}

/** The default approval gate: deny everything dangerous. Safe by default. */
export const denyAll: Approver = () => false;
