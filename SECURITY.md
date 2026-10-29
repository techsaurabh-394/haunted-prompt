<!-- Copyright (c) 2026 Saurabh Pathak. MIT License. -->
# Security policy

## What counts as a security issue

The game is *about* prompt injection, so tricking the ghost is not a vulnerability: it is the point. Please report anything that affects the player's machine or data instead, for example:

- The local server answering requests from other websites or other machines
- Secrets or system prompts exposed by the API before a level is won
- Script injection in the web page
- Any network call other than to the configured local model server

## How to report

Email **saurabhpathak394@gmail.com** with steps to reproduce. Please do not open a public issue for security problems. You should get a reply within a week.

## Supported versions

Only the latest release on `main` gets fixes.

## Design notes

The server binds to 127.0.0.1, checks Origin and Host headers, requires a JSON content type and an `x-haunted: 1` header on POST requests, limits body size and sessions, and never returns stack traces. See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).
