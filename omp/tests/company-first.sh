#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
OMP_BIN="$(command -v omp)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/home" "$TMP/agent"
status=0
output=$(env HOME="$TMP/home" OMP_PROFILE= PI_PROFILE= \
  PI_CODING_AGENT_DIR="$TMP/agent" PI_CONFIG_FILES= \
  OMP_AUTH_BROKER_URL= OMP_AUTH_BROKER_TOKEN= \
  OMP_ACCOUNT_TEST_DIR="$TMP" \
  "$OMP_BIN" usage --json --no-extensions \
  --extension "$REPO_DIR/omp/tests/company-first.ts" --provider company-first-fixture) || status=$?
printf '%s\n' "$output"
[ "$status" -eq 0 ] || exit "$status"
case "$output" in
  *COMPANY_FIRST_COMPLETE*) ;;
  *) echo 'OMP did not complete the routing scenarios' >&2; exit 1 ;;
esac
