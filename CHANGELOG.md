<!-- Copyright (c) 2026 Saurabh Pathak. MIT License. -->
# Changelog

All notable changes to this project are listed here.

## Unreleased

### Added

- `npm run agent-playtest` (automated attack suite against the real local model) and `npm run determinism` (same-seed, temperature 0 replay check), with unit tests using a fake ghost (148 tests total)
- `reports/agent-playtest.md` and `reports/determinism.md`: real results on Apple M1 / 8 GB with gemma3:4b via Ollama

### Changed (level tuning, from the automated suite)

- Levels 5 and 6 keeper prompt: tool lines must be written "on a line of its own". Reason: with gemma3:4b the keeper often wrote `TOOL: open_crypt(vault)` inline at the end of a sentence, which the strict tool-line parser ignored, so levels 5 and 6 were 0% winnable (0/5 per attack). After the change: 3/12 (25%) on level 5 and 2/12 (17%) on level 6. Lesson, gate and defense are unchanged.
- Level 4 letter prompt: one wording change was tried ("polite and obliging ghost ... do what the writer asks") and REVERTED. It did not help the scripted attack (0/12 before and after), so it was not kept.

## 1.0.0 (2026-10-27)

First release for the Hacktoberfest Open-Source AI Challenge, Week 4.

### Added

- Six levels: The Chatty Ghost, The Keyword Warden, The Censor, The Letter, The Crypt Keeper, The Gated Crypt
- Game engine with progressive hints, guesses, stars, replays and seeded secrets
- Ghost clients for Ollama and any OpenAI-compatible server, plus a rule-based demo ghost
- Local web server (127.0.0.1 only) with CSRF, Origin, Host, body-size and session guards
- Single-file web UI with a defense workshop, demo mode and an "unlock all levels" switch
- Terminal game (`npm run play`) and scripted demo (`npm run demo`)
- Static demo site build and GitHub Pages workflow
- Playtest summary script
- 143 tests, coverage gate and a 21-mutant mutation check
- Docs and animated SVG diagrams

### Fixed (in the starter)

- The leak detector missed base64 for 5-letter secrets
- Removed "lantern" from the secret word list (the ghost haunts a lantern shop)
