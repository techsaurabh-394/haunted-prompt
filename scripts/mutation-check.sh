#!/usr/bin/env bash
# Copyright (c) 2026 Saurabh Pathak. MIT License.
# Mutation check: inject one deliberate bug at a time into a scratch copy of the project, run the
# tests, and require a FAILURE every time. Exits 1 if any bug survives (or a mutant is broken).
# Your working copy is never modified.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/haunted-mutation.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if [ ! -d "$ROOT/node_modules" ]; then
  echo "Run npm ci first." >&2
  exit 1
fi

copy_project() {
  rm -rf "$WORK/p"
  mkdir -p "$WORK/p"
  cp -R "$ROOT/src" "$ROOT/test" "$ROOT/public" "$ROOT/scripts" "$ROOT/package.json" "$ROOT/tsconfig.json" "$WORK/p/"
  ln -s "$ROOT/node_modules" "$WORK/p/node_modules"
}

run_tests() {
  (cd "$WORK/p" && rm -rf dist && "$ROOT/node_modules/.bin/tsc" -p . >"$WORK/build.log" 2>&1) || return 2
  (cd "$WORK/p" && node --test dist/test/*.test.js >"$WORK/test.log" 2>&1)
}

echo "Sanity check: the unmutated project must pass."
copy_project
if ! run_tests; then
  echo "The unmutated tests fail. Fix them before running the mutation check." >&2
  tail -40 "$WORK/test.log" "$WORK/build.log" 2>/dev/null >&2
  exit 1
fi

COUNT="$(node "$ROOT/scripts/mutants.mjs" count)"
killed=0
survived=0
broken=0
for ((i = 0; i < COUNT; i++)); do
  name="$(node "$ROOT/scripts/mutants.mjs" name "$i")"
  copy_project
  if ! node "$ROOT/scripts/mutants.mjs" apply "$i" "$WORK/p"; then
    echo "BROKEN    #$((i + 1)) $name (could not apply)"
    broken=$((broken + 1))
    continue
  fi
  run_tests
  status=$?
  if [ "$status" -eq 2 ]; then
    echo "BROKEN    #$((i + 1)) $name (does not compile)"
    broken=$((broken + 1))
  elif [ "$status" -ne 0 ]; then
    fails="$(grep -c '^not ok' "$WORK/test.log" || true)"
    echo "KILLED    #$((i + 1)) $name ($fails failing tests)"
    killed=$((killed + 1))
  else
    echo "SURVIVED  #$((i + 1)) $name"
    survived=$((survived + 1))
  fi
done

echo ""
echo "Mutants: $COUNT, killed: $killed, survived: $survived, broken: $broken"
if [ "$survived" -ne 0 ] || [ "$broken" -ne 0 ]; then
  echo "Mutation check FAILED: strengthen the tests (do not weaken the mutants)."
  exit 1
fi
echo "Mutation check passed: every deliberate bug was caught."
