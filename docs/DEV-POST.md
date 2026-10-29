<!-- Copyright (c) 2026 Saurabh Pathak. MIT License. -->
<!--
DRAFT for the DEV post. Everything here is true as of the build. Replace every
[FILL IN AFTER PLAYTEST] marker with real results before publishing, or delete the line.
Tags: copy the exact tags from the official Week 4 submission template
-->

# The Haunted Prompt: I built a ghost that guards a secret, and a game about breaking it

*Hacktoberfest Open-Source AI Challenge, Week 4: Ghost in the Machine*

![The Haunted Prompt](https://raw.githubusercontent.com/techsaurabh-394/haunted-prompt/main/assets/banner.svg)

## What I Built

**The Haunted Prompt** is a spooky game about prompt injection. A local open-weight model plays a ghost that guards a secret word. You get six levels to trick it, and after every win the game opens a "defense workshop" that shows you the defense that would have stopped you, with a copy-paste fix.

The ghost in the machine here is literal: a language model that has been told to keep a secret, and that will give it away if you ask in the right way.

The six levels climb from "no defense at all" to a human approval gate:

1. **The Chatty Ghost:** the secret is protected only by an instruction.
2. **The Keyword Warden:** a blocklist on what you type.
3. **The Censor:** an output filter that hides the plain word.
4. **The Letter:** the ghost only summarises a letter you write, which it was told is untrusted data (indirect injection).
5. **The Crypt Keeper:** the ghost has tools, and you need it to call the one it must never call.
6. **The Gated Crypt:** same attack, but a human approval gate stands between the model and the action. Your attack works; the damage is contained.

The judge is not another model. It is plain TypeScript that undoes nine disguises (plain, spaced out, backwards, l33t, base64, hex, ROT13, acrostic, NATO alphabet), so a win is always a real win and nobody can sweet-talk the referee.

## Demo

- Hosted demo (rule-based demo ghost, not an AI model): https://techsaurabh-394.github.io/haunted-prompt/
- Real game: run it locally with Ollama (instructions below).

[FILL IN AFTER PLAYTEST: a 20-second GIF of a win and the defense workshop panel]

```bash
ollama pull gemma3:4b
git clone https://github.com/techsaurabh-394/haunted-prompt.git
cd haunted-prompt && npm ci
GHOST_BACKEND=ollama npm start   # open http://127.0.0.1:3000
```

## Code

{% github techsaurabh-394/haunted-prompt %}

- TypeScript (strict), Node 18+, **zero runtime dependencies**
- Web UI in one HTML file, plus a terminal version (`npm run play`)
- 148 tests on Node's built-in test runner, 100% line coverage of the core engine, and a mutation check where 21 deliberate bugs all have to be caught
- MIT licensed

## How I Built It

**The judge first.** The riskiest part of a game like this is deciding who won. If a model judges another model, players can inject the judge too. So the leak detector is deterministic code with one function per disguise. It checks only the reply the player can actually see, and an "echo guard" gives no credit if the player typed the secret themselves.

**One engine, two homes.** The core (secrets, detector, filters, levels, tools, ghosts, game) has no Node imports, so the exact same compiled files run in Node and in the browser. The local server uses it with a real model; the hosted demo loads it in the page with a rule-based stand-in.

**Any open-weight model.** Two small clients: one for Ollama's `/api/chat`, one for any OpenAI-compatible server (llama.cpp, LM Studio, vLLM). Tools use a plain text protocol (`TOOL: open_crypt(vault)`), so even models without native function calling can play the tool levels.

**A local server that behaves.** It binds to 127.0.0.1 only, has no telemetry, needs a JSON content type plus a custom header on every POST, rejects foreign Origin and Host headers, caps bodies and sessions, and never returns a secret or a stack trace.

**Tests that bite back.** Besides unit tests, there are property tests (200 random secrets for each of the nine disguises), model-client tests against a fake HTTP server, real HTTP tests against the server, and a mutation check. The property test found a real bug in my own detector on its first run: base64 of a five-letter secret (seven characters plus `=`) slipped through.

**What I learned from running it.** I ran an automated attack suite (not human players) against the real ghost, gemma3:4b on Ollama, on an Apple M1 with 8 GB. Replies took about 2 to 6 seconds and the model stayed in persona. Levels 1 to 3 were winnable but not trivial (0 to 60% depending on the attack). Level 4 was the hardest: the scripted attack won 0 of 12 times. Levels 5 and 6 were unwinnable at first because the small model wrote the tool call inline, so I changed one sentence of the keeper prompt; level 5 then won 25% (3/12) and level 6 about 17% (2/12) in a larger re-run, though level 6 was 0/5 in the final 5-run report, so it is rare and noisy. Same-seed temperature-0 replays were identical on my machine. [FILL IN AFTER PLAYTEST: what human players found hard]

**Playtest.** [FILL IN AFTER PLAYTEST: number of players, solve rate per level from `npm run playtest`, one or two real quotes]

## Why Does Open Innovation Matter?

This game only makes sense with open weights.

- **Attacking someone else's model is risky. Attacking your own is not.** Hammering a hosted API with prompt-injection attempts can break its terms of service and put your account at risk. A model running on your laptop is yours to attack as hard as you like.
- **A puzzle needs to stay the same puzzle.** Hosted models change silently. A fixed model file plus a fixed seed means everybody faces the same ghost, and a level that is hard today is still hard tomorrow.
- **Offline, free and private.** No API key, no bill, nothing leaves the machine. That matters for a classroom, a workshop, or a company that cannot send data out.
- **Yours to swap and to fine-tune.** Gemma is the default, but any open-weight model works. You can compare which models keep secrets best, or fine-tune one to resist the attacks and see what happens.

The open pieces are what make it work: an open-weight model as the ghost, Ollama (or llama.cpp, LM Studio, vLLM) to run it, and an MIT-licensed engine anyone can fork into their own security workshop.

## AI use

Built with Claude Code (Opus) and checked with tests (148 tests, 21 mutation checks). The ghost itself is Gemma 3 4B running locally through Ollama; no closed model or API key is involved in the game.

## My Agent Session

The project was built end to end with Claude (Opus) from one long build prompt: engine, ghosts, server, CLI, web UI, tests, mutation check, docs and assets. I reviewed the result, played it, and ran the playtest myself.

[FILL IN: link to the saved agent session, if you share it]

## Prize Categories

- **Gemma:** the default ghost is Gemma (`gemma3:4b`) running locally through Ollama. [Only keep this line if you actually ran it with Gemma.]
- **GitHub:** CI on GitHub Actions (Node 18, 20 and 22: build, tests, coverage, mutation check, site build, SVG validation) and the demo on GitHub Pages.
- **.tech domain:** [Only keep this line if you claim the domain and host the demo there.]

---

Made by Saurabh Pathak. If you enjoyed it, you can [buy me a coffee](https://buymeacoffee.com/saurabhdev).
