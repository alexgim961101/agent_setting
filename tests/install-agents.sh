#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home"
export PI_CODING_AGENT_DIR="$TMP/pi"
mkdir -p "$HOME" "$PI_CODING_AGENT_DIR"

"$REPO_DIR/scripts/install-agents.sh"
for name in report-investigator report-verifier; do
  test "$(readlink -f "$PI_CODING_AGENT_DIR/agents/$name.md")" = "$REPO_DIR/agents/$name.md"
done
"$REPO_DIR/scripts/install-agents.sh"
test ! -e "$HOME/.pi"

# Regular-file conflict must preserve user content and install neither agent.
export PI_CODING_AGENT_DIR="$TMP/conflict"
mkdir -p "$PI_CODING_AGENT_DIR/agents"
printf 'user-owned\n' > "$TMP/expected"
cp "$TMP/expected" "$PI_CODING_AGENT_DIR/agents/report-verifier.md"
if "$REPO_DIR/scripts/install-agents.sh" 2> "$TMP/error"; then exit 1; fi
cmp "$TMP/expected" "$PI_CODING_AGENT_DIR/agents/report-verifier.md"
test ! -e "$PI_CODING_AGENT_DIR/agents/report-investigator.md"

# Dangling links are conflicts, not permission to overwrite.
export PI_CODING_AGENT_DIR="$TMP/dangling"
mkdir -p "$PI_CODING_AGENT_DIR/agents"
ln -s "$TMP/missing" "$PI_CODING_AGENT_DIR/agents/report-investigator.md"
if "$REPO_DIR/scripts/install-agents.sh" 2> "$TMP/error"; then exit 1; fi
test "$(readlink "$PI_CODING_AGENT_DIR/agents/report-investigator.md")" = "$TMP/missing"
test ! -e "$PI_CODING_AGENT_DIR/agents/report-verifier.md"

export PI_CODING_AGENT_DIR="$TMP/absent"
if "$REPO_DIR/scripts/install-agents.sh" 2> "$TMP/error"; then exit 1; fi
test ! -e "$PI_CODING_AGENT_DIR"
export PI_CODING_AGENT_DIR="relative-path"
if "$REPO_DIR/scripts/install-agents.sh" 2> "$TMP/error"; then exit 1; fi
unset PI_CODING_AGENT_DIR
mkdir -p "$HOME/.pi/agent"
"$REPO_DIR/scripts/install-agents.sh"
test -L "$HOME/.pi/agent/agents/report-verifier.md"
if "$REPO_DIR/scripts/install-agents.sh" unknown-argument 2> "$TMP/error"; then exit 1; fi
printf 'PASS: install, idempotency, custom/default paths, conflict preservation, invalid input\n'
