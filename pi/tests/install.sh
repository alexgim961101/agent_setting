#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home" PI_CODING_AGENT_DIR="$TMP/pi" MCP_CONFIG_DIR="$TMP/mcp"
mkdir -p "$HOME" "$PI_CODING_AGENT_DIR"

bash "$REPO_DIR/pi/scripts/install.sh"
bash "$REPO_DIR/pi/scripts/install.sh"
for name in report-investigator report-verifier; do
  test "$(readlink "$PI_CODING_AGENT_DIR/agents/$name.md")" = "$REPO_DIR/pi/agents/$name.md"
done
test "$(readlink "$PI_CODING_AGENT_DIR/AGENTS.md")" = "$REPO_DIR/pi/global/AGENTS.md"
for name in models.json lsp.json agent-hub.json web-search.json; do
  test "$(readlink "$PI_CODING_AGENT_DIR/$name")" = "$REPO_DIR/pi/config/$name"
done
test "$(readlink "$MCP_CONFIG_DIR/mcp.json")" = "$REPO_DIR/pi/mcp/mcp.json"
test ! -e "$HOME/.pi"

# Executing through a symlinked repo alias must still produce canonical links.
ln -s "$REPO_DIR" "$TMP/alias"
export PI_CODING_AGENT_DIR="$TMP/alias-pi" MCP_CONFIG_DIR="$TMP/alias-mcp"
mkdir -p "$PI_CODING_AGENT_DIR"
bash "$TMP/alias/pi/scripts/install.sh"
test "$(readlink "$PI_CODING_AGENT_DIR/AGENTS.md")" = "$REPO_DIR/pi/global/AGENTS.md"
test "$(readlink "$PI_CODING_AGENT_DIR/agents/report-investigator.md")" = "$REPO_DIR/pi/agents/report-investigator.md"

# Identical regular files become links; different files and unrelated links are preserved.
export PI_CODING_AGENT_DIR="$TMP/identical" MCP_CONFIG_DIR="$TMP/identical-mcp"
mkdir -p "$PI_CODING_AGENT_DIR"
cp "$REPO_DIR/pi/global/AGENTS.md" "$PI_CODING_AGENT_DIR/AGENTS.md"
bash "$REPO_DIR/pi/scripts/install.sh"
test -L "$PI_CODING_AGENT_DIR/AGENTS.md"

export PI_CODING_AGENT_DIR="$TMP/conflict" MCP_CONFIG_DIR="$TMP/conflict-mcp"
mkdir -p "$PI_CODING_AGENT_DIR/agents"
printf 'user-owned\n' > "$PI_CODING_AGENT_DIR/agents/report-verifier.md"
if bash "$REPO_DIR/pi/scripts/install.sh" 2> "$TMP/error"; then exit 1; fi
test "$(< "$PI_CODING_AGENT_DIR/agents/report-verifier.md")" = 'user-owned'
test ! -e "$PI_CODING_AGENT_DIR/agents/report-investigator.md"
test ! -e "$PI_CODING_AGENT_DIR/AGENTS.md"

export PI_CODING_AGENT_DIR="$TMP/dangling" MCP_CONFIG_DIR="$TMP/dangling-mcp"
mkdir -p "$PI_CODING_AGENT_DIR/agents"
ln -s "$TMP/missing" "$PI_CODING_AGENT_DIR/agents/report-investigator.md"
if bash "$REPO_DIR/pi/scripts/install.sh" 2> "$TMP/error"; then exit 1; fi
test "$(readlink "$PI_CODING_AGENT_DIR/agents/report-investigator.md")" = "$TMP/missing"
test ! -e "$PI_CODING_AGENT_DIR/AGENTS.md"

# The exact old repo's agent symlinks may be migrated even after the rename.
export PI_CODING_AGENT_DIR="$TMP/legacy" MCP_CONFIG_DIR="$TMP/legacy-mcp"
mkdir -p "$PI_CODING_AGENT_DIR/agents"
ln -s "$(dirname "$REPO_DIR")/pi_setting/agents/report-investigator.md" "$PI_CODING_AGENT_DIR/agents/report-investigator.md"
bash "$REPO_DIR/pi/scripts/install.sh"
test "$(readlink "$PI_CODING_AGENT_DIR/agents/report-investigator.md")" = "$REPO_DIR/pi/agents/report-investigator.md"

# A differing optional web-search file stays intact even when other links are installed.
export PI_CODING_AGENT_DIR="$TMP/web-conflict" MCP_CONFIG_DIR="$TMP/web-conflict-mcp"
mkdir -p "$PI_CODING_AGENT_DIR"
printf 'custom\n' > "$PI_CODING_AGENT_DIR/web-search.json"
if bash "$REPO_DIR/pi/scripts/install.sh" 2> "$TMP/error"; then exit 1; fi
test "$(< "$PI_CODING_AGENT_DIR/web-search.json")" = 'custom'
test -L "$PI_CODING_AGENT_DIR/AGENTS.md"

export PI_CODING_AGENT_DIR="$TMP/absent"
if bash "$REPO_DIR/pi/scripts/install.sh" 2> "$TMP/error"; then exit 1; fi
test ! -e "$PI_CODING_AGENT_DIR"
export PI_CODING_AGENT_DIR='relative-path'
if bash "$REPO_DIR/pi/scripts/install.sh" 2> "$TMP/error"; then exit 1; fi
unset PI_CODING_AGENT_DIR MCP_CONFIG_DIR
mkdir -p "$HOME/.pi/agent"
bash "$REPO_DIR/pi/scripts/install.sh"
test -L "$HOME/.pi/agent/agents/report-verifier.md"
if bash "$REPO_DIR/pi/scripts/install.sh" unknown-argument 2> "$TMP/error"; then exit 1; fi
printf 'PASS: Pi install, idempotency, migration, conflicts, custom/default paths\n'
