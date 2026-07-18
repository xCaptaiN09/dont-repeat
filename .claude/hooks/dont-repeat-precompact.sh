#!/usr/bin/env bash
# dont-repeat — PreCompact: re-render MEMORY.md
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-.}"
if command -v dont-repeat >/dev/null 2>&1; then
  (cd "$ROOT" && dont-repeat render --quiet) || true
fi
if [ -f "$ROOT/.agent-memory/MEMORY.md" ]; then
  echo "dont-repeat: re-read .agent-memory/MEMORY.md after compact (failures/decisions)."
fi
exit 0
