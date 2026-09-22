#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 0 ] || { echo "Usage: $0 (OMP_AGENT_DIR overrides destination)" >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET_DIR="${OMP_AGENT_DIR:-$HOME/.omp/agent}"
LEGACY_DIR="$(dirname "$REPO_DIR")/pi_setting"
bash "$REPO_DIR/scripts/link-files.sh" \
  "$REPO_DIR/omp/AGENTS.md" "$TARGET_DIR/AGENTS.md" "$LEGACY_DIR/omp/AGENTS.md" \
  "$REPO_DIR/omp/config.yml" "$TARGET_DIR/config.yml" "$LEGACY_DIR/omp/config.yml"
