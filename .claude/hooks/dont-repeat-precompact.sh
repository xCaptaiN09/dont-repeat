#!/usr/bin/env bash
# dont-repeat — PreCompact: re-render MEMORY.md so critical lessons stay on disk
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-.}"
if command -v dont-repeat >/dev/null 2>&1; then
  (cd "$ROOT" && dont-repeat render --quiet) || true
fi
# Nudge: keep project memory in context after compact
if [ -f "$ROOT/.agent-memory/MEMORY.md" ]; then
  # stdout text is attached as hook feedback on some Claude Code versions
  echo "dont-repeat: re-read .agent-memory/MEMORY.md after compact (failures/decisions)."
fi
exit 0
