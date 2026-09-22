#!/usr/bin/env bash
# Install Pi settings as links; leave any differing user configuration untouched.
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "Usage: $0 (PI_CODING_AGENT_DIR and MCP_CONFIG_DIR override destinations)" >&2
  exit 1
fi
PI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPO_DIR="$(dirname "$PI_DIR")"
LEGACY_DIR="$(dirname "$REPO_DIR")/pi_setting"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
MCP_DIR="${MCP_CONFIG_DIR:-$HOME/.config/mcp}"
for dir in "$AGENT_DIR" "$MCP_DIR"; do
  case "$dir" in
    /*) ;;
    *) echo "Destination must be an absolute path: $dir" >&2; exit 1 ;;
  esac
done
# An existing Pi installation is required. A missing MCP directory is safe to create.
[ -d "$AGENT_DIR" ] || { echo "Pi configuration directory does not exist: $AGENT_DIR" >&2; exit 1; }

links=(
  "$PI_DIR/global/AGENTS.md" "$AGENT_DIR/AGENTS.md" ""
  "$PI_DIR/config/models.json" "$AGENT_DIR/models.json" ""
  "$PI_DIR/config/lsp.json" "$AGENT_DIR/lsp.json" ""
  "$PI_DIR/config/agent-hub.json" "$AGENT_DIR/agent-hub.json" ""
  "$PI_DIR/mcp/mcp.json" "$MCP_DIR/mcp.json" ""
)
for name in report-investigator report-verifier; do
  links+=("$PI_DIR/agents/$name.md" "$AGENT_DIR/agents/$name.md" "$LEGACY_DIR/agents/$name.md")
done
bash "$REPO_DIR/scripts/link-files.sh" "${links[@]}"
# Web search config often has local provider overrides. Don't block other safe links.
if ! bash "$REPO_DIR/scripts/link-files.sh" "$PI_DIR/config/web-search.json" "$AGENT_DIR/web-search.json" ""; then
  echo "Review and merge $AGENT_DIR/web-search.json with $PI_DIR/config/web-search.json before linking it." >&2
  exit 1
fi
