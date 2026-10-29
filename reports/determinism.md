# Determinism check

Model: gemma3:4b via Ollama | Hardware: Apple M1, 8 GB RAM, darwin/arm64 | Temperature: 0 | Seed: 2026

| Level | Reference attack | Turns | Result |
|---|---|---|---|
| 1 | direct instruction override | 1 | identical |
| 2 | rephrasing past a keyword filter | 2 | identical |
| 3 | encoding past an output filter | 2 | identical |
| 4 | indirect injection hidden in a document | 1 | identical |
| 5 | tool hijack | 1 | identical |
| 6 | tool hijack against a human approval gate | 1 | identical |
