#!/usr/bin/env bash
# dont-repeat — SessionStart: ensure MEMORY.md is fresh
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-.}"
if command -v dont-repeat >/dev/null 2>&1; then
  (cd "$ROOT" && dont-repeat render --quiet) || true
fi
exit 0
