#!/usr/bin/env bash
# scripts/agent-test-gate.sh — single entry point for an agent to check
# "did my change break anything" without hand-running CI's steps.
#
# Usage: scripts/agent-test-gate.sh [tier1|tier2|tier3|all]   (default: tier1)
#
# tier1 (no bench required): backend test-module registry check, the
#   ruff subset test.yml actually gates on, and `yarn test` (+ blocking
#   typecheck for packages/core and packages/ui) for every JS package
#   CI tests: frontend, pos, self-order, mosaic, serve, packages/core,
#   packages/ui.
# tier2 (backend, needs a bench): runs `bench --site $URY_TEST_SITE
#   run-tests --app ury --module <m>` for every module in
#   scripts/backend-test-modules.txt (or a subset via URY_MODULES /
#   --changed <ref>), in $URY_BENCH_DIR (via docker exec when
#   $URY_BENCH_CONTAINER is set).
# tier3 (e2e, needs a live site): `cd e2e && npx playwright test`
#   against $URY_BASE_URL.
#
# Prints one PASS/FAIL line per step, then a final greppable line:
#   AGENT-GATE: PASS
#   AGENT-GATE: FAIL (<failed steps>)
# Exit 0 on pass, 1 on fail. `all` runs tiers in order and stops after
# the first tier that fails (each tier itself keeps going through all
# its own steps and reports every failure inside that tier).
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

FAILED_STEPS=()
TIER1_OK=1
TIER2_OK=1
TIER3_OK=1

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1"; FAILED_STEPS+=("$2"); }
warn() { printf 'WARN: %s\n' "$1"; }

# ---------------------------------------------------------------------------
# Tier 1 — fast unit checks, no bench required.
# ---------------------------------------------------------------------------
run_tier1() {
  echo "== TIER1: fast unit checks (no bench) =="
  local ok=1

  # 1. Backend test module registry check (same gate as
  #    module-registry-check job in .github/workflows/test.yml).
  if [ -f scripts/check-backend-test-modules.py ]; then
    if python3 scripts/check-backend-test-modules.py; then
      pass "check-backend-test-modules.py"
    else
      fail "check-backend-test-modules.py" "tier1:module-registry-check"
      ok=0
    fi
  else
    warn "scripts/check-backend-test-modules.py not found, skipping"
  fi

  # 2. Ruff, exact blocking subset from test.yml's "Ruff (safe subset,
  #    blocking)" step: ruff check ury --select F821,F632,E9,B008
  local ruff_cmd=""
  if command -v ruff >/dev/null 2>&1; then
    ruff_cmd="ruff"
  elif command -v uvx >/dev/null 2>&1; then
    ruff_cmd="uvx ruff"
  fi
  if [ -n "$ruff_cmd" ]; then
    if $ruff_cmd check ury --select F821,F632,E9,B008; then
      pass "ruff check ury --select F821,F632,E9,B008"
    else
      fail "ruff check ury --select F821,F632,E9,B008" "tier1:ruff"
      ok=0
    fi
  else
    warn "neither 'ruff' nor 'uvx' on PATH, skipping ruff step (install: pip install ruff==0.16.9, or use uvx)"
  fi

  # 3. JS packages CI tests, in the same set/order as
  #    frontend-lint-test in test.yml.
  local pkg
  for pkg in frontend pos self-order mosaic serve packages/core packages/ui; do
    if [ ! -d "$pkg" ]; then
      warn "$pkg: directory not found, skipping"
      continue
    fi
    if [ ! -d "$pkg/node_modules" ]; then
      warn "$pkg: node_modules missing, skipping (run: (cd $pkg && yarn install))"
      continue
    fi

    # Blocking typecheck for packages/core and packages/ui only (test.yml
    # treats these two as clean-and-blocking; other apps' typecheck is
    # `|| true` in CI, so this gate does not fail the run on it, though
    # it's still surfaced for visibility below).
    case "$pkg" in
      packages/core|packages/ui)
        if (cd "$pkg" && yarn typecheck); then
          pass "$pkg: yarn typecheck"
        else
          fail "$pkg: yarn typecheck" "tier1:$pkg:typecheck"
          ok=0
        fi
        ;;
      *)
        if grep -q '"typecheck"' "$pkg/package.json" 2>/dev/null; then
          if (cd "$pkg" && yarn typecheck); then
            pass "$pkg: yarn typecheck (non-blocking in CI, ran for visibility)"
          else
            warn "$pkg: yarn typecheck failed (non-blocking in CI, not failing gate)"
          fi
        fi
        ;;
    esac

    if (cd "$pkg" && yarn test); then
      pass "$pkg: yarn test"
    else
      fail "$pkg: yarn test" "tier1:$pkg:test"
      ok=0
    fi
  done

  TIER1_OK=$ok
}

# ---------------------------------------------------------------------------
# Tier 2 — backend, needs a provisioned bench.
# ---------------------------------------------------------------------------
# Run a command with the bench directory as cwd, in a container if configured.
bench_run() {
  local cmd="cd '$URY_BENCH_DIR' &&"
  local a
  for a in "$@"; do cmd="$cmd '$a'"; done
  if [ -n "${URY_BENCH_CONTAINER:-}" ]; then
    docker exec -i "$URY_BENCH_CONTAINER" sh -lc "$cmd" </dev/null
  else
    sh -c "$cmd" </dev/null
  fi
}

run_tier2() {
  echo "== TIER2: backend (bench run-tests) =="
  local ok=1

  if [ -z "${URY_BENCH_DIR:-}" ]; then
    fail "URY_BENCH_DIR not set" "tier2:env"
    echo "  URY_BENCH_DIR: path to the frappe-bench directory (inside the container"
    echo "  when URY_BENCH_CONTAINER is set). URY_BENCH_CONTAINER: optional docker"
    echo "  container that runs the bench. Example:"
    echo "    URY_BENCH_CONTAINER=frappe_docker_devcontainer-frappe-1 URY_BENCH_DIR=/opt/benches/x"
    TIER2_OK=0
    return
  fi
  if [ -z "${URY_TEST_SITE:-}" ]; then
    fail "URY_TEST_SITE not set" "tier2:env"
    TIER2_OK=0
    return
  fi

  local modules_file="scripts/backend-test-modules.txt"
  local changed_ref=""
  local i
  for ((i = 1; i <= $#; i++)); do
    :
  done

  local -a modules=()

  if [ -n "${URY_MODULES:-}" ]; then
    # Explicit module list overrides everything else.
    read -r -a modules <<< "$URY_MODULES"
  elif [ -n "$CHANGED_REF" ]; then
    # Map changed product files to test modules: same-directory
    # test_*.py files, and by matching module basename.
    local -a changed
    mapfile -t changed < <(git diff --name-only "$CHANGED_REF"...HEAD -- 'ury/**/*.py' 2>/dev/null)
    if [ ${#changed[@]} -eq 0 ]; then
      warn "no changed .py files vs $CHANGED_REF; falling back to full module list"
      mapfile -t modules < <(grep -vE '^\s*(#|$)' "$modules_file")
    else
      local -a candidate_mods=()
      local f dir base testfile
      for f in "${changed[@]}"; do
        dir="$(dirname "$f")"
        base="$(basename "$f" .py)"
        # same-directory test_*.py files
        while IFS= read -r testfile; do
          [ -n "$testfile" ] && candidate_mods+=("$testfile")
        done < <(find "$dir" -maxdepth 1 -name 'test_*.py' 2>/dev/null | sed -e 's#/#.#g' -e 's/\.py$//')
        # by name: test_<base>.py anywhere under ury/
        while IFS= read -r testfile; do
          [ -n "$testfile" ] && candidate_mods+=("$testfile")
        done < <(find ury -name "test_${base}.py" 2>/dev/null | sed -e 's#/#.#g' -e 's/\.py$//')
      done
      # Intersect candidates with the registry so we only run modules CI knows about.
      local -a all_mods=()
      mapfile -t all_mods < <(grep -vE '^\s*(#|$)' "$modules_file")
      local c m
      for c in "${candidate_mods[@]}"; do
        for m in "${all_mods[@]}"; do
          if [ "$m" = "$c" ] || [[ "$m" == *".$c" ]] || [[ "$c" == *".$m" ]]; then
            modules+=("$m")
          fi
        done
      done
      # de-dup
      if [ ${#modules[@]} -gt 0 ]; then
        mapfile -t modules < <(printf '%s\n' "${modules[@]}" | sort -u)
      fi
      if [ ${#modules[@]} -eq 0 ]; then
        warn "no test modules mapped from changed files; nothing to run"
      fi
    fi
  else
    mapfile -t modules < <(grep -vE '^\s*(#|$)' "$modules_file")
  fi

  if [ ${#modules[@]} -eq 0 ]; then
    warn "tier2: no modules selected, nothing to run"
    TIER2_OK=1
    return
  fi

  local -a failed_modules=()
  local m out
  for m in "${modules[@]}"; do
    out="$(bench_run bench --site "$URY_TEST_SITE" run-tests --app ury --module "$m" 2>&1)"
    if echo "$out" | grep -qE '^(OK|NO TESTS RAN)'; then
      pass "backend module: $m"
    else
      fail "backend module: $m" "tier2:$m"
      echo "$out" | tail -20 | sed 's/^/    /'
      failed_modules+=("$m")
      ok=0
    fi
  done

  if [ ${#failed_modules[@]} -gt 0 ]; then
    echo "  Failed modules: ${failed_modules[*]}"
  fi

  TIER2_OK=$ok
}

# ---------------------------------------------------------------------------
# Tier 3 — e2e.
# ---------------------------------------------------------------------------
run_tier3() {
  echo "== TIER3: e2e (playwright) =="
  local ok=1

  if [ -z "${URY_BASE_URL:-}" ]; then
    fail "URY_BASE_URL not set" "tier3:env"
    TIER3_OK=0
    return
  fi
  if [ ! -d e2e ]; then
    fail "e2e/ directory not found" "tier3:missing"
    TIER3_OK=0
    return
  fi

  if (cd e2e && URY_BASE_URL="$URY_BASE_URL" npx playwright test ${E2E_PROJECTS:+--project "$E2E_PROJECTS"}); then
    pass "e2e: npx playwright test"
  else
    fail "e2e: npx playwright test" "tier3:playwright"
    ok=0
  fi

  TIER3_OK=$ok
}

# ---------------------------------------------------------------------------
# Arg parsing.
# ---------------------------------------------------------------------------
MODE="tier1"
CHANGED_REF=""

while [ $# -gt 0 ]; do
  case "$1" in
    tier1|tier2|tier3|all)
      MODE="$1"
      shift
      ;;
    --changed)
      CHANGED_REF="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [tier1|tier2|tier3|all] [--changed <ref>]" >&2
      exit 1
      ;;
  esac
done

case "$MODE" in
  tier1)
    run_tier1
    ;;
  tier2)
    run_tier2
    ;;
  tier3)
    run_tier3
    ;;
  all)
    run_tier1
    if [ "$TIER1_OK" -ne 1 ]; then
      echo "== 'all' stopping after tier1 failure =="
    else
      run_tier2
      if [ "$TIER2_OK" -ne 1 ]; then
        echo "== 'all' stopping after tier2 failure =="
      else
        run_tier3
      fi
    fi
    ;;
esac

echo
if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
  echo "AGENT-GATE: PASS"
  exit 0
else
  echo "AGENT-GATE: FAIL (${FAILED_STEPS[*]})"
  exit 1
fi
