#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 0 ] || { echo "Usage: $0 (CODEX_CONFIG_DIR overrides destination)" >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# CODEX_HOME may point to a transient runtime (e.g. an IDE sandbox).
TARGET_DIR="${CODEX_CONFIG_DIR:-$HOME/.codex}"
LEGACY_DIR="$(dirname "$REPO_DIR")/pi_setting"
bash "$REPO_DIR/scripts/link-files.sh" "$REPO_DIR/codex/AGENTS.md" "$TARGET_DIR/AGENTS.md" "$LEGACY_DIR/codex/AGENTS.md"
