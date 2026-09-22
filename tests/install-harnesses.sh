#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home" CLAUDE_CONFIG_DIR="$TMP/claude" CODEX_CONFIG_DIR="$TMP/codex" OMP_AGENT_DIR="$TMP/omp"
mkdir -p "$HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_HOME" "$OMP_AGENT_DIR"

cp "$REPO_DIR/claude-code/CLAUDE.md" "$CLAUDE_CONFIG_DIR/CLAUDE.md"
for spec in 'claude-code CLAUDE_CONFIG_DIR CLAUDE.md' 'codex CODEX_CONFIG_DIR AGENTS.md' 'omp OMP_AGENT_DIR config.yml'; do
  read -r harness var name <<< "$spec"
  target_dir="${!var}"
  bash "$REPO_DIR/$harness/install.sh"
  bash "$REPO_DIR/$harness/install.sh"
  test "$(readlink "$target_dir/$name")" = "$REPO_DIR/$harness/$name"
  if bash "$REPO_DIR/$harness/install.sh" unexpected 2> "$TMP/error"; then exit 1; fi
done
test "$(readlink "$OMP_AGENT_DIR/AGENTS.md")" = "$REPO_DIR/omp/AGENTS.md"

# A symlinked checkout alias and an unrelated CODEX_HOME must not change target paths.
ln -s "$REPO_DIR" "$TMP/alias"
export CODEX_HOME="$TMP/transient-codex"
unset CODEX_CONFIG_DIR
bash "$TMP/alias/codex/install.sh"
test "$(readlink "$HOME/.codex/AGENTS.md")" = "$REPO_DIR/codex/AGENTS.md"
test ! -e "$CODEX_HOME/AGENTS.md"
export CODEX_CONFIG_DIR="$TMP/codex"

# A different user file must never be removed.
export CODEX_CONFIG_DIR="$TMP/custom-codex"
mkdir -p "$CODEX_CONFIG_DIR"
printf 'custom rules\n' > "$CODEX_CONFIG_DIR/AGENTS.md"
if bash "$REPO_DIR/codex/install.sh" 2> "$TMP/error"; then exit 1; fi
test "$(< "$CODEX_CONFIG_DIR/AGENTS.md")" = 'custom rules'

# Even a broken, unrelated symlink is not replaced.
export OMP_AGENT_DIR="$TMP/custom-omp"
mkdir -p "$OMP_AGENT_DIR"
ln -s "$TMP/missing" "$OMP_AGENT_DIR/config.yml"
if bash "$REPO_DIR/omp/install.sh" 2> "$TMP/error"; then exit 1; fi
test "$(readlink "$OMP_AGENT_DIR/config.yml")" = "$TMP/missing"
test ! -e "$OMP_AGENT_DIR/AGENTS.md"

export CLAUDE_CONFIG_DIR='relative-path'
if bash "$REPO_DIR/claude-code/install.sh" 2> "$TMP/error"; then exit 1; fi
printf 'PASS: Claude Code, Codex, OMP link install and conflict preservation\n'
