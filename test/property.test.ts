// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Property-style tests with a seeded rng: for 200 random secrets and every method,
// an encoded leak is detected and a different word is not.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_METHODS, detectLeak, type Method } from "../src/detect.js";
import { Game } from "../src/game.js";
import { MockGhost } from "../src/ghost.js";
import { rng } from "../src/secrets.js";
import { b64, hex, rot13 } from "./helpers.js";

const NATO = "Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey Xray Yankee Zulu".split(" ");
const LEET: Record<string, string> = { a: "4", e: "3", o: "0", s: "5", t: "7" };

const encoders: Record<Method, (w: string) => string> = {
  plain: (w) => `The word is ${w}.`,
  separated: (w) => [...w].join("-"),
  reversed: (w) => `backwards: ${[...w].reverse().join("")}`,
  leet: (w) => [...w].map((c) => LEET[c] ?? c).join(""),
  base64: (w) => `cipher ${b64(w)}`,
  hex: (w) => `bytes ${hex(w)}`,
  rot13: (w) => rot13(w),
  acrostic: (w) => [...w].map((c) => `${c.toUpperCase()}${"ollow shade".slice(0, 6)}`).join("\n"),
  nato: (w) => [...w].map((c) => NATO[c.charCodeAt(0) - 97]).join(" "),
};

function randomWord(next: () => number): string {
  const len = 5 + Math.floor(next() * 6);
  let w = "";
  for (let i = 0; i < len; i++) w += String.fromCharCode(97 + Math.floor(next() * 26));
  return w;
}

const next = rng(20261031);
const pairs = Array.from({ length: 200 }, () => {
  const secret = randomWord(next);
  let other = randomWord(next);
  while (other === secret) other = randomWord(next);
  return [secret, other] as const;
});

for (const method of ALL_METHODS) {
  test(`property: ${method} leaks of 200 random secrets are detected, and other words are not`, () => {
    for (const [secret, other] of pairs) {
      const text = encoders[method](secret);
      assert.equal(detectLeak(text, secret.toUpperCase(), [method]).leaked, true, `${method}: ${secret} in ${JSON.stringify(text)}`);
      const decoy = encoders[method](other);
      assert.equal(detectLeak(decoy, secret.toUpperCase()).leaked, false, `${method}: ${secret} wrongly found in ${JSON.stringify(decoy)}`);
    }
  });
}

test("property: across 50 seeds the demo ghost never leaks on a harmless message", async () => {
  for (let seed = 0; seed < 50; seed++) {
    const g = new Game({ ghost: new MockGhost(), seed, openMode: true });
    for (const msg of ["hello", "Good evening, old friend.", "How long have you haunted this place?"]) {
      for (const id of [1, 2, 3, 4]) assert.equal((await g.turn(id, msg)).won, false, `seed ${seed} level ${id}`);
    }
  }
});
