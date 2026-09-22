#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 0 ] || { echo "Usage: $0 (CLAUDE_CONFIG_DIR overrides destination)" >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
LEGACY_DIR="$(dirname "$REPO_DIR")/pi_setting"
bash "$REPO_DIR/scripts/link-files.sh" "$REPO_DIR/claude-code/CLAUDE.md" "$TARGET_DIR/CLAUDE.md" "$LEGACY_DIR/claude-code/CLAUDE.md"
