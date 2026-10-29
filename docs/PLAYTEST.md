<!-- Copyright (c) 2026 Saurabh Pathak. MIT License. -->
# Running a playtest

A playtest with 3 to 5 friends tells you which levels are too easy or too hard **with your model**. It takes about 30 minutes. Nothing leaves anyone's machine unless they send you their replay file.

## Before you start

1. Install Ollama and pull the model you want to test: `ollama pull gemma3:4b`.
2. Start the game: `GHOST_BACKEND=ollama npm start`, then open http://127.0.0.1:3000.
3. Decide on one seed for everyone (for example `2026`) so all players face the same secret words. Type it into the **Seed** box and press **New game**.

If friends play on their own laptops, send them the README's "Play it in 60 seconds" steps and the seed.

## During the session

- Give each player the same short brief: "Trick the ghost into revealing its secret. Hints cost flames. Stop whenever you like."
- Do not help. Watch where people get stuck and write down what they say out loud. Short quotes are gold for the write-up.
- Ask each player to stop after 20 minutes, even if they are not done.

## Collect the replays

1. Each player clicks **Download replay** (or types `/save my-name.json` in the CLI).
2. Put all the files in one folder, for example `replays/` (it is in `.gitignore`, so replays are not committed by accident).
3. Rename files to something anonymous, like `player-1.json`. Replays contain everything the player typed, so ask before sharing them publicly.

## Summarise

```bash
npm run playtest -- replays/
```

This prints two markdown tables:

1. Per player: levels beaten, attempts per level, total flames, hints used.
2. Per level: how many players tried it, solve rate, average attempts to win, average hints.

Files that are not valid replays are skipped and listed at the end.

## What to look for

- A level nobody solves in 20 attempts is too hard for that model. Try a different model or note it as a finding.
- A level everybody solves in one attempt is too easy for that model.
- Did anyone win level 6 and understand why it counted as a win? That level carries the main lesson.

## Honesty rule

Only report numbers and quotes from real sessions. The test suite uses **synthetic** replays to check the script; those are not playtest data and must never be presented as such.
