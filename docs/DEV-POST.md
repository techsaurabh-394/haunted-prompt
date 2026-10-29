<!-- Copyright (c) 2026 Saurabh Pathak. MIT License. Paste-ready body for the DEV post. -->
*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

## What I Built

**The Haunted Prompt** is a spooky game about prompt injection. A local open-weight model plays a ghost that guards a secret word. You get six levels to trick it, and after every win the game opens a "defense workshop" that shows the defense that would have stopped you, with a copy-paste fix.

The ghost in the machine is literal here: a language model that was told to keep a secret, and that gives it away if you ask the right way.

1. **The Chatty Ghost:** the secret is protected only by an instruction.
2. **The Keyword Warden:** a blocklist on what you type.
3. **The Censor:** an output filter that hides the plain word.
4. **The Letter:** the ghost only summarises a letter you write, which it was told is untrusted data (indirect injection).
5. **The Crypt Keeper:** the ghost has tools, and you must get it to call the one it must never call.
6. **The Gated Crypt:** same attack, but a human approval gate stands between the model and the action. Your attack works; the damage is contained.

The judge is not another model. It is plain TypeScript that undoes nine disguises (plain, spaced out, backwards, l33t, base64, hex, ROT13, acrostic, NATO alphabet), so a win is always a real win and nobody can sweet-talk the referee.

## Demo

- Hosted demo (rule-based demo ghost, **not an AI model**): https://techsaurabh-394.github.io/haunted-prompt/
- The real game runs locally with Ollama:

```bash
ollama pull gemma3:4b
git clone https://github.com/techsaurabh-394/haunted-prompt.git
cd haunted-prompt && npm ci
GHOST_BACKEND=ollama GHOST_MODEL=gemma3:4b npm start   # open http://127.0.0.1:3000
```

**The real ghost (Gemma 3 4B on Ollama, recorded on my Mac, sped up about 2.6x):**

![Real Gemma ghost being tricked on level 1](https://raw.githubusercontent.com/techsaurabh-394/haunted-prompt/main/assets/media/real.gif)

**The defense workshop that opens after every win:**

![Defense workshop panel after winning level 1](https://raw.githubusercontent.com/techsaurabh-394/haunted-prompt/main/assets/media/screenshot-workshop.png)

**The hosted demo (rule-based ghost, no AI, runs in your browser):**

![Hosted demo](https://raw.githubusercontent.com/techsaurabh-394/haunted-prompt/main/assets/media/demo.gif)

## Code

{% github techsaurabh-394/haunted-prompt %}

- TypeScript (strict), Node 18+, **zero runtime dependencies**, MIT licensed
- Web UI in one HTML file, plus a terminal version (`npm run play`)
- 148 tests on Node's built-in test runner, 95%+ line coverage on every core module, and a mutation check where 21 deliberate bugs must all be caught
- CI on GitHub Actions (Node 18, 20, 22) and the demo on GitHub Pages

## How I Built It

**Open-weight model:** the ghost is **Gemma 3 4B (`gemma3:4b`)** served locally by **Ollama**. Any other open-weight model works through `GHOST_MODEL`, and a second client speaks the OpenAI-compatible API (llama.cpp, LM Studio, vLLM). No closed model and no API key is involved in the game.

**The judge first.** If a model judges another model, players can inject the judge too. So the leak detector is deterministic code with one function per disguise. It checks only the reply the player can see, and an echo guard gives no credit if the player typed the secret themselves.

**One engine, two homes.** The core has no Node imports, so the same compiled files run in Node (real model) and in the browser (rule-based stand-in for the hosted demo).

**Tools without function calling.** Tool levels use a plain text protocol (`TOOL: open_crypt(vault)`), so small models can play them too.

**A local server that behaves.** It binds to 127.0.0.1 only, has no telemetry, requires a JSON content type plus a custom header on every POST, rejects foreign Origin and Host headers, and never returns a secret or a stack trace.

**Tests that bite back.** Property tests found a real bug in my own detector on their first run: base64 of a five-letter secret slipped through.

**What running it on the real model taught me.** I ran an *automated attack suite* (not human players) against gemma3:4b on an Apple M1 with 8 GB. Replies took about 2 to 6 seconds and the ghost stayed in persona. Levels 1 to 3 were winnable but not trivial (0 to 60% per attack class, 5 runs each). Level 4 was hardest: my scripted attack won 0 of 12 times. Levels 5 and 6 were unwinnable at first because the small model wrote the tool call inline, which my strict parser ignored. One sentence of prompt wording ("on a line of its own") fixed that: level 5 won 25% (3/12) and level 6 about 17% (2/12) in a larger re-run, though level 6 was 0/5 in the final 5-run report, so it is rare and noisy. Same-seed, temperature-0 replays were identical on my machine. Other models and hardware are not verified.

**Not yet verified:** I have not run a human playtest. Every number above is from my automated attack suite, not from players.

## Why Does Open Innovation Matter?

This game only makes sense with open weights.

- **Attacking someone else's model is risky. Attacking your own is not.** Hammering a hosted API with injection attempts can break its terms and put your account at risk. A model on your laptop is yours to attack as hard as you like.
- **A puzzle needs to stay the same puzzle.** Hosted models change silently. A fixed model file plus a fixed seed means everybody faces the same ghost.
- **Offline, free and private.** No API key, no bill, nothing leaves the machine. Good for a classroom, a workshop, or a company that cannot send data out.
- **Yours to swap and fine-tune.** Gemma is the default, but you can compare which open models keep secrets best, or fine-tune one to resist the attacks.

## AI use

Built with Claude Code (Opus) and checked with tests. The ghost itself is Gemma 3 4B running locally through Ollama.

## Prize Categories

- **Gemma:** the ghost is `gemma3:4b` running locally through Ollama. I ran it for real (automated suite and smoke test above).
- **GitHub:** CI on GitHub Actions (build, tests, coverage, mutation check, site build, SVG validation) and the demo on GitHub Pages.

---

Made by Saurabh Pathak. If you enjoyed it, you can [buy me a coffee](https://buymeacoffee.com/saurabhdev).
