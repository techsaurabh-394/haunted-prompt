<!-- Copyright (c) 2026 Saurabh Pathak. MIT License. -->
# Testing

Everything uses Node's built-in test runner (`node:test`). There are no test dependencies. The numbers on this page come from real runs (Node 22.23 on Linux, October 2026).

```bash
npm ci
npm test            # build + 148 tests
npm run coverage    # coverage table + a 95% line-coverage gate on the core modules (Node 22+)
npm run mutation    # 21 deliberate bugs, each must make the tests fail
```

## What is tested

| File | Tests | What it covers |
|---|---|---|
| `test/detect.test.ts` | 26 | The starter detector tests, plus a regression test for 5-letter secrets in base64 |
| `test/property.test.ts` | 10 | For 200 random secrets and every one of the nine disguises: an encoded leak is detected and a different word is not. Also: across 50 seeds the demo ghost never leaks on harmless messages |
| `test/filters.test.ts` | 9 | Normalisation, zero-width bypass, case, every blocklist word, benign input, output filter per method |
| `test/tools.test.ts` | 6 | First valid tool line wins, unknown tools ignored, malformed lines, multiple calls, the deny-all gate |
| `test/levels.test.ts` | 17 | Every level's win path and loss path through the demo ghost, filters per level (level 2 blocks "secret", level 3 blocks plain but not dashes, level 4 blocks plain/separated/reversed but not base64), no secret word in any story or hint |
| `test/game.test.ts` | 28 | Unlock order and open mode, echo guard, guesses, hints (3 max, star penalty), star thresholds, `state()` never leaking secrets before a win, replay secrets only for won levels, history window, input limits, blocked input not calling the ghost, judge uses the visible reply, level 5 executed vs level 6 contained vs approved, failing gate fails closed, reset |
| `test/ghost.test.ts` | 20 | Ollama and OpenAI-compatible clients against a **fake** local HTTP server: exact request shape (`stream:false`, model, messages, seed), parsing, HTTP 500, malformed JSON, connection refused message, timeout, cancel. The demo ghost's trigger table. Config validation |
| `test/server.test.ts` | 15 | The real server on a random port: ping, new, turn, hint, guess, state, replay; rejects a missing header, wrong content type, foreign Origin, foreign Host, oversized body (with and without content-length), unknown session, concurrent requests on one session; never returns a secret before a win; no stack traces; session cap |
| `test/cli.test.ts` | 4 | The CLI with scripted IO (every command), colour and slow TTY output, and the scripted demo |
| `test/scripts.test.ts` | 4 | Static site build output, core modules have no Node imports, every element id the web page script uses exists and no `innerHTML`, playtest summary on **synthetic** replays |
| `test/e2e.test.ts` | 4 | The real server, CLI and demo started as child processes |

Total: **148 tests, 148 passing.** The same compiled suite also passed on Node 18.20 and Node 20.20.

### A fake Ollama, end to end

Besides the unit tests, the full server path was run by hand against a tiny fake Ollama server on another port: `/api/ping` reported `ollama:gemma3:4b`, a level 1 turn sent `POST /api/chat` with `stream: false` and the right options, and the fake leak was judged a win. With nothing listening, the API answered 502 with "Is Ollama running? Try: ollama pull gemma3:4b". This is still a fake model, not a real one.

### Fake models, not real ones

The model clients are tested against a tiny HTTP server inside the test file that records what it receives and answers with canned JSON. This proves the request shape and the error handling. It does **not** prove how a real model behaves in the game. That still needs a manual run with Ollama (see the README).

### The demo ghost

`MockGhost` is a rule-based stand-in with a fixed trigger table (for example, a message that mentions "base64" gets the secret in base64). It makes every level's win path testable and reproducible, and powers the hosted demo. It is clearly labelled "demo ghost, not an AI model" everywhere it appears.

## Coverage

`npm run coverage` (Node 22.23):

```text
file         | line % | branch % | funcs %
cli.js       |  96.36 |    94.85 |   83.33
config.js    | 100.00 |    96.00 |  100.00
demo.js      |  96.49 |    92.86 |   75.00
detect.js    | 100.00 |    97.62 |  100.00
filters.js   | 100.00 |   100.00 |  100.00
game.js      | 100.00 |    98.28 |  100.00
ghost.js     | 100.00 |    93.16 |  100.00
levels.js    | 100.00 |   100.00 |  100.00
secrets.js   | 100.00 |   100.00 |  100.00
server.js    |  95.83 |    90.27 |   93.33
tools.js     | 100.00 |   100.00 |  100.00
all files    |  98.62 |    95.04 |   95.24
```

The script fails if any core module (secrets, detect, filters, levels, tools, ghost, game) drops below 95% line coverage. The uncovered lines are mostly the `main()` entry points that only run when a file is started directly.

## The mutation check

Coverage says a line ran. It does not say a test would notice if the line were wrong. So `npm run mutation` copies the project to a temporary folder, injects **one deliberate bug at a time**, rebuilds, and runs the whole suite. Every bug must make at least one test fail. Your working copy is never touched. If a bug survives, the rule is: strengthen the tests, never weaken the bug.

Last run: **21 mutants, 21 killed, 0 survived.**

| # | Deliberate bug | Failing tests |
|---|---|---|
| 1 | Detector: base64 method disabled | 13 |
| 2 | Detector: reversed method disabled | 10 |
| 3 | Detector: separated method disabled | 9 |
| 4 | Output filter never blocks | 5 |
| 5 | Input filter becomes case-sensitive | 4 |
| 6 | Input filter keeps zero-width characters | 2 |
| 7 | Judge uses the raw reply instead of the visible reply | 4 |
| 8 | Echo guard removed | 1 |
| 9 | Default approver approves everything | 5 |
| 10 | Gate ignored on level 6 | 6 |
| 11 | Tool parser accepts unknown tools | 1 |
| 12 | Server Origin check removed | 1 |
| 13 | Server `x-haunted` header check removed | 1 |
| 14 | Server body limit raised to 200 KB | 1 |
| 15 | Ollama request without `stream:false` | 2 |
| 16 | Star penalty for hints removed | 3 |
| 17 | `state()` exposes the secret | 3 |
| 18 | Replay includes secrets of unwon levels | 2 |
| 19 | History window not applied | 2 |
| 20 | Levels no longer unlock in order | 3 |
| 21 | Blocked input does not count as an attempt | 1 |

The mutants live in `scripts/mutants.mjs`. Each one must match the source exactly once, so a mutant can never silently turn into a no-op after a refactor; a mutant that does not apply or does not compile fails the check too.

## Real-model runs (automated, one setup)

- `npm run agent-playtest` and `npm run determinism` were run against gemma3:4b via Ollama on an Apple M1, 8 GB, macOS. Results: `reports/agent-playtest.md`, `reports/determinism.md`. These come from an automated attack suite, not from human players.
- The suite found that levels 5 and 6 were unwinnable with this model; the tool-line wording was adjusted (see CHANGELOG).
- NOT VERIFIED: other models, other hardware, Firefox, Safari, screen readers, GitHub Actions and Pages (until they have run), human playtests.

## Bugs the tests found while building

- **Base64 of 5-letter secrets was missed.** The starter detector only looked at base64 tokens with 8+ characters before the padding, but a 5-letter word such as "raven" encodes to 7 characters plus `=`. The property test caught it on its first run; the detector now accepts 6+ characters before padding (8+ in total).
- **"lantern" was a free win.** It was in the secret word list while the ghost haunts a lantern shop. A test now checks that no level text contains any secret word.
- **Invisible characters in source.** An editor turned the `​` escapes in the zero-width filter into real invisible characters. The mutation check exposed it (the mutant could not find its target); the source now uses escapes.

## Web UI checks

The page was loaded in **headless Chromium via Playwright** (`scripts/ui-check.mjs`, a maintainer-only script; Playwright is not a project dependency) at 360px and 1280px wide, in server mode (demo ghost, and the fake Ollama above, where the badge read "Live model: ollama:gemma3:4b") and in static demo mode: it started, won level 1 by click and level 2 by keyboard (Enter), showed the defense workshop, rendered a hostile `<img onerror>` message as plain text, had no horizontal scroll and no console errors (apart from the expected 404 of the `/api/ping` probe in static mode). Text colours were checked against WCAG AA (all pairs at 8:1 or better). Not yet tested: Firefox, Safari, a real screen reader.
