#!/usr/bin/env bash
# Text demo of dont-repeat (safe to run anywhere)
set -euo pipefail
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
cd "$ROOT"

echo "\$ dont-repeat init --agents claude,codex,gemini"
dont-repeat init --agents claude,codex,gemini
echo
echo "\$ dont-repeat log failure \"do not use jest for e2e — use playwright\" -t tests"
dont-repeat log failure "do not use jest for e2e — use playwright" -t tests
echo
echo "\$ dont-repeat log decision \"auth lives in src/lib/session.ts\""
dont-repeat log decision "auth lives in src/lib/session.ts"
echo
echo "\$ dont-repeat status"
dont-repeat status
echo
echo "\$ cat .agent-memory/MEMORY.md"
cat .agent-memory/MEMORY.md
echo
echo "\$ echo 'FAILURE: never commit .env' | dont-repeat distill --apply"
echo "FAILURE: never commit .env" | dont-repeat distill --apply
echo
echo "\$ dont-repeat doctor"
dont-repeat doctor
echo
echo "Demo complete."
