<!-- Copyright (c) 2026 Saurabh Pathak. MIT License. -->
# Contributing to The Haunted Prompt

Thanks for wanting to help. This is a small project, so the rules are short.

## Setup

```bash
git clone https://github.com/techsaurabh-394/haunted-prompt.git
cd haunted-prompt
npm ci
npm test
```

You do not need a model to work on the code: `GHOST_BACKEND=mock npm start` runs the server with the rule-based demo ghost.

## Ground rules

- **Zero runtime dependencies.** Dev dependencies are limited to `typescript` and `@types/node`.
- **Core stays isomorphic.** `secrets`, `detect`, `filters`, `levels`, `tools`, `ghost`, `game` and `types` must not import `node:` modules, because they also run in the browser.
- **Every source file starts with** `// Copyright (c) 2026 Saurabh Pathak. MIT License.`
- **Tests first.** Add or update tests for every change. Before you open a PR, run:
  ```bash
  npm test
  npm run coverage   # Node 22+
  npm run mutation
  ```
  If the mutation check finds a surviving mutant, strengthen the tests. Do not weaken the mutant.
- **Never invent results.** Docs must only state numbers you actually got.
- **No spoilers.** Do not add winning prompts for specific models to the docs or issues. Describe attack classes instead.
- **Plain, friendly English** in docs and UI text.

## Ideas that would help

- Playtest results for different models (Gemma, Llama, Qwen, Phi)
- New levels that teach a new defense
- Accessibility fixes, translations
