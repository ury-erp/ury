#!/usr/bin/env bash
# One-command deploy for the URY fork on the Chefworks bench.
# Usage (as frappe user):  bash apps/ury/scripts/deploy.sh [site]
set -euo pipefail

SITE="${1:-chefworks.storenxt.in}"
BENCH_DIR="$HOME/frappe-bench"
APP_DIR="$BENCH_DIR/apps/ury"

if [ "$(whoami)" != "frappe" ]; then
    echo "Run as the frappe user first:  sudo su - frappe"
    exit 1
fi

cd "$APP_DIR"
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "APP TREE NOT CLEAN — deploy aborted before touching anything."
    git status --short
    cat <<'MSG'

These local changes are almost always server-side drift (fixtures rewritten
by a stray 'bench export-fixtures', or build shells from 'bench build').
The repo is the source of truth. Stash them (recoverable) and rerun:

    git stash push -m "server drift before deploy"

Never run 'bench export-fixtures' on this server.
MSG
    exit 1
fi

git pull --ff-only

cd "$BENCH_DIR"
./env/bin/pip install -q -e apps/ury
bench build --app ury

bench --site "$SITE" set-maintenance-mode on
# Maintenance mode always comes back off, even when a later step fails.
trap 'bench --site "$SITE" set-maintenance-mode off' EXIT

MIGRATE_LOG="/tmp/ury_deploy_migrate_$(date +%Y%m%d_%H%M%S).log"
bench --site "$SITE" migrate 2>&1 | tee "$MIGRATE_LOG"

if grep -q "Skipping fixture syncing" "$MIGRATE_LOG"; then
    echo "MIGRATE PROBLEM: fixture sync was skipped — see $MIGRATE_LOG"
    exit 1
fi

bench --site "$SITE" clear-cache
bench --site "$SITE" clear-website-cache
bench restart

echo "Deploy OK. Spot-check: /pos loads, new fields visible, one other site on this bench still works."
