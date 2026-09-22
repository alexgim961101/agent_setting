#!/usr/bin/env bash
# Link reviewed repository files without replacing different user settings.
set -euo pipefail

if [ "$#" -eq 0 ] || [ $(( $# % 3 )) -ne 0 ]; then
  echo "Usage: $0 SOURCE TARGET LEGACY_LINK [SOURCE TARGET LEGACY_LINK ...]" >&2
  exit 1
fi

# Check the whole batch before making any changes. Empty LEGACY_LINK means no migration.
args=("$@")
for ((i = 0; i < ${#args[@]}; i += 3)); do
  source=${args[i]}
  target=${args[i+1]}
  legacy=${args[i+2]}
  case "$source:$target" in
    /*:/*) ;;
    *) echo "Source and target must be absolute paths: $source $target" >&2; exit 1 ;;
  esac
  [ -f "$source" ] || { echo "Missing source: $source" >&2; exit 1; }
  if [ -L "$target" ]; then
    link=$(readlink "$target")
    if [ "$link" = "$source" ] || { [ -n "$legacy" ] && [ "$link" = "$legacy" ]; }; then
      continue
    fi
  elif [ -f "$target" ] && cmp -s -- "$source" "$target"; then
    continue
  elif [ ! -e "$target" ]; then
    continue
  fi
  echo "Refusing to overwrite different setting: $target" >&2
  exit 1
done

for ((i = 0; i < ${#args[@]}; i += 3)); do
  source=${args[i]}
  target=${args[i+1]}
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    echo "Already linked: $target"
    continue
  fi
  mkdir -p -- "$(dirname "$target")"
  if [ -e "$target" ] || [ -L "$target" ]; then
    rm -- "$target" # Only an identical regular file or known legacy link passed preflight.
  fi
  ln -s -- "$source" "$target"
  echo "Linked: $target"
done
