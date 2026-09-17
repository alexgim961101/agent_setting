#!/usr/bin/env bash
# Register only this repository's Pi subagent definitions. Never overwrite conflicts.
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "Usage: $0 (override PI_CODING_AGENT_DIR for a custom Pi directory)" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
case "$AGENT_DIR" in
  /*) ;;
  *) echo "PI_CODING_AGENT_DIR must be an absolute path" >&2; exit 1 ;;
esac
if [ ! -d "$AGENT_DIR" ]; then
  echo "Pi configuration directory does not exist: $AGENT_DIR" >&2
  exit 1
fi

names=(report-investigator report-verifier)
# Preflight all links so one conflict cannot leave a partially installed set.
for name in "${names[@]}"; do
  source="$REPO_DIR/agents/$name.md"
  target="$AGENT_DIR/agents/$name.md"
  [ -f "$source" ] || { echo "Missing agent: $source" >&2; exit 1; }
  if [ -L "$target" ] && [ "$(readlink -f "$target")" = "$(readlink -f "$source")" ]; then
    continue
  fi
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "Refusing to overwrite existing agent: $target" >&2
    exit 1
  fi
done

mkdir -p "$AGENT_DIR/agents"
for name in "${names[@]}"; do
  target="$AGENT_DIR/agents/$name.md"
  if [ -L "$target" ]; then
    echo "Already installed: $name"
  else
    ln -s "$REPO_DIR/agents/$name.md" "$target"
    echo "Installed: $name"
  fi
done
