#!/bin/bash
# run-tests.sh — enforced flaky-test-handling wrapper for this app's vitest suite.
#
# Codifies the flaky-test policy documented in sa-test-coverage-audit/EXECUTION.md:
#   - full-suite vitest runs (90+ files at once) could hang indefinitely or get OOM-killed
#     under concurrent duplicate runs -> always run with --testTimeout and a shell `timeout`
#     wrapper so the RUNNER itself can't hang forever, and always kill stray/duplicate
#     vitest processes before starting a new run.
#   - a file that still hangs with these flags has a genuine unmocked network call, not a
#     runner problem -- the flags don't mask real bugs, they stop the runner from hanging.
#   - cross-file teardown leakage from cleanup() only in beforeEach (not afterEach) is
#     handled separately, in this app's shared vitest setupFiles entry (see src/test/setup.ts).
#
# Usage: ./run-tests.sh [extra vitest args...]

set -euo pipefail
cd "$(dirname "$0")/.."

TEST_TIMEOUT_MS="${VITEST_TEST_TIMEOUT_MS:-8000}"
SHELL_TIMEOUT_SECS="${VITEST_SHELL_TIMEOUT_SECS:-180}"

echo "[run-tests] killing any stray vitest processes before starting..."
pkill -f "vitest" 2>/dev/null || true
sleep 1

echo "[run-tests] running vitest with --testTimeout=${TEST_TIMEOUT_MS}ms, wrapped in a ${SHELL_TIMEOUT_SECS}s shell timeout..."
set +e
timeout "${SHELL_TIMEOUT_SECS}s" yarn vitest run --testTimeout="${TEST_TIMEOUT_MS}" "$@"
status=$?
set -e

if [ "$status" -eq 124 ]; then
  echo "[run-tests] TIMED OUT after ${SHELL_TIMEOUT_SECS}s. This means the runner itself hung," >&2
  echo "[run-tests] not just a slow test -- per the documented flaky-test policy, this usually" >&2
  echo "[run-tests] means one file has a genuine unmocked network call. Re-run narrowed to a" >&2
  echo "[run-tests] single file/dir to find it: ./scripts/run-tests.sh src/path/to/suspect" >&2
  exit 124
fi

exit "$status"
