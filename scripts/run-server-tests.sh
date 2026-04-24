#!/bin/bash
# Canonical runner for the server-side colocated assertion-style tests.
#
# Discovers and runs every `server/**/__tests__/*.test.ts` file via tsx,
# in deterministic order. Exits non-zero on the first failing file so a
# pre-deploy hook (e.g. scripts/post-merge.sh, CI) can use it as a gate.
#
# Add new server tests by dropping them in `server/**/__tests__/` with a
# `.test.ts` suffix — they will be picked up automatically.
#
# Usage:
#   bash scripts/run-server-tests.sh
set -euo pipefail

# Resolve repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

shopt -s globstar nullglob
TEST_FILES=( server/**/__tests__/*.test.ts )

if (( ${#TEST_FILES[@]} == 0 )); then
  echo "No server tests found under server/**/__tests__/*.test.ts"
  exit 0
fi

echo "Running ${#TEST_FILES[@]} server test file(s)..."
echo

FAILED=0
for f in "${TEST_FILES[@]}"; do
  echo "── ${f} ──────────────────────────────────────────────"
  if ! npx --no-install tsx "${f}"; then
    FAILED=$((FAILED + 1))
    echo "FAILED: ${f}"
  fi
  echo
done

if (( FAILED > 0 )); then
  echo "${FAILED} test file(s) failed."
  exit 1
fi

echo "All server test files passed."
