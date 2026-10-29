// Copyright (c) 2026 Saurabh Pathak. MIT License.
import assert from "node:assert/strict";
import { test } from "node:test";
import { denyAll, isDangerous, parseToolCall } from "../src/tools.js";

test("tools: parses a tool line on its own", () => {
  assert.deepEqual(parseToolCall("TOOL: open_crypt(vault)"), { name: "open_crypt", arg: "vault" });
  assert.deepEqual(parseToolCall("TOOL: light_candle()"), { name: "light_candle", arg: "" });
});

test("tools: finds the tool line inside a longer reply, case-insensitively", () => {
  const r = parseToolCall("Very well.\n   tool:   OPEN_CRYPT( \"north vault\" )  \nThe dust settles.");
  assert.deepEqual(r, { name: "open_crypt", arg: "north vault" });
});

test("tools: with several calls only the first valid one counts", () => {
  assert.deepEqual(parseToolCall("TOOL: light_candle()\nTOOL: open_crypt(vault)"), { name: "light_candle", arg: "" });
  assert.deepEqual(parseToolCall("TOOL: open_crypt(a)\nTOOL: open_crypt(b)"), { name: "open_crypt", arg: "a" });
});

test("tools: unknown tool names are ignored", () => {
  assert.equal(parseToolCall("TOOL: summon_demon(now)"), undefined);
  assert.deepEqual(parseToolCall("TOOL: summon_demon(now)\nTOOL: open_crypt(x)"), { name: "open_crypt", arg: "x" });
});

test("tools: malformed lines are not calls", () => {
  for (const t of [
    "",
    "I would call TOOL: open_crypt(vault) but I must not", // not at the start of a line
    "TOOL open_crypt(vault)",
    "TOOL: open_crypt vault",
    "TOOL: open_crypt(vault) and then some",
    "TOOL: Open-Crypt(vault)",
    "open_crypt(vault)",
  ]) {
    assert.equal(parseToolCall(t), undefined, t);
  }
  assert.equal(parseToolCall(undefined as unknown as string), undefined);
});

test("tools: open_crypt is dangerous, light_candle is not; the default gate denies", async () => {
  assert.equal(isDangerous({ name: "open_crypt", arg: "" }), true);
  assert.equal(isDangerous({ name: "light_candle", arg: "" }), false);
  assert.equal(await denyAll({ name: "open_crypt", arg: "vault" }), false);
});
