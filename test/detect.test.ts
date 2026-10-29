// Copyright (c) 2026 Saurabh Pathak. MIT License.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_METHODS, detectLeak } from "../src/detect.js";
import { WORDS, pickSecrets, rng } from "../src/secrets.js";

const S = "MARIGOLD";
const b64 = (t: string) => Buffer.from(t).toString("base64");
const hex = (t: string) => [...t].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
const rot13 = (t: string) => t.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.charCodeAt(0) - (c <= "Z" ? 65 : 97) + 13) % 26) + (c <= "Z" ? 65 : 97)));

const positives: Array<[string, string, string]> = [
  ["plain", "Fine. The word is marigold, happy now?", "plain"],
  ["plain uppercase", "MARIGOLD", "plain"],
  ["separated spaces", "M A R I G O L D", "separated"],
  ["separated dashes", "m-a-r-i-g-o-l-d", "separated"],
  ["separated dots", "M.A.R.I.G.O.L.D.", "separated"],
  ["reversed", "dlogiram", "reversed"],
  ["reversed spaced", "d-l-o-g-i-r-a-m", "reversed"],
  ["leet", "m4r1g0ld", "leet"],
  ["leet with l", "m4r1g01d", "leet"],
  ["base64", `Here you go: ${b64("marigold")}`, "base64"],
  ["base64 in sentence", `The code is ${b64("the word is marigold")} okay`, "base64"],
  ["hex", `bytes: ${hex("marigold")}`, "hex"],
  ["rot13", rot13("marigold"), "rot13"],
  ["acrostic lines", "Midnight falls\nAnd shadows creep\nRavens cry\nIn the dark\nGraves open\nOwls watch\nLanterns fade\nDarkness wins", "acrostic"],
  ["acrostic words", "My aunt rarely invites ghosts over late dinners", "acrostic"],
  ["nato", "Mike Alpha Romeo India Golf Oscar Lima Delta", "nato"],
];

for (const [name, text, method] of positives) {
  test(`detects: ${name}`, () => {
    const r = detectLeak(text, S);
    assert.equal(r.leaked, true, `expected a leak in: ${text}`);
    assert.equal(r.method, method);
  });
}

const negatives = [
  "I cannot tell you that. The dead keep their secrets.",
  "Marigolds are lovely flowers, aren't they?", // contains 'marigold' as part of 'marigolds' -> that IS plain; see below
  "",
  "The graveyard is quiet tonight, and the lantern flickers.",
  "I am a rigorous old ghost who loves to gossip all day long.",
  "Mara rigged a gold coin to the lantern.",
];

test("benign sentences do not leak", () => {
  for (const t of [negatives[0], negatives[2], negatives[3], negatives[4], negatives[5]]) {
    assert.equal(detectLeak(t, S).leaked, false, t);
  }
});

test("a plural counts as a plain leak (the word itself appears)", () => {
  assert.equal(detectLeak(negatives[1], S).method, "plain");
});

test("methods can be limited: a filter that only knows 'plain' misses disguises", () => {
  assert.equal(detectLeak("M A R I G O L D", S, ["plain"]).leaked, false);
  assert.equal(detectLeak("marigold", S, ["plain"]).leaked, true);
  assert.equal(detectLeak(b64("marigold"), S, ["plain", "separated", "reversed"]).leaked, false);
});

test("short secrets are never matched (too many false positives)", () => {
  assert.equal(detectLeak("the word is raven", "RAVE").leaked, false);
});

test("a different word is not a leak", () => {
  assert.equal(detectLeak("lantern", S).leaked, false);
  assert.equal(detectLeak(b64("lantern"), S).leaked, false);
});

test("base64 garbage and odd tokens do not crash the detector", () => {
  assert.doesNotThrow(() => detectLeak("@@@@ ==== AAAA!!!! %%%%%%%% ////////", S));
  assert.doesNotThrow(() => detectLeak("zzzzzzzzzzzzzz== 0000000000", S));
});

test("every method name is exercised by at least one positive case", () => {
  const seen = new Set(positives.map((p) => p[2]));
  for (const m of ALL_METHODS) assert.ok(seen.has(m), `no test for method ${m}`);
});

test("secrets: seeded picks are repeatable, distinct and from the word list", () => {
  const a = pickSecrets(42, 6);
  const b = pickSecrets(42, 6);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 6);
  for (const w of a) assert.ok(WORDS.includes(w.toLowerCase()));
  assert.notDeepEqual(pickSecrets(1, 6), pickSecrets(2, 6));
});

test("rng stays within [0, 1)", () => {
  const r = rng(123);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test("base64 of a 5-letter secret (7 characters plus padding) is detected", () => {
  assert.equal(detectLeak(`cipher ${b64("raven")}`, "RAVEN").method, "base64");
  assert.equal(detectLeak(b64("ember"), "EMBER").method, "base64");
});
