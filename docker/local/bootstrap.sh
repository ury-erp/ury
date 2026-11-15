#!/usr/bin/env bash
# Sets up (or refreshes) the local URY bench. Safe to re-run.
set -euo pipefail
SITE=ury.localhost
cd /workspace
if [ ! -d frappe-bench/apps/frappe ]; then
  bench init --frappe-branch v16.36.0 --skip-assets --skip-redis-config-generation frappe-bench
fi
cd frappe-bench
bench set-config -g db_host db
bench set-config -g redis_cache redis://redis:6379/0
bench set-config -g redis_queue redis://redis:6379/1
bench set-config -g redis_socketio redis://redis:6379/2
if [ ! -d apps/erpnext ]; then
  bench get-app --branch v16.37.0 --skip-assets erpnext
fi
# Copy the current working tree (not git history) into the Linux bench.
mkdir -p apps/ury
tar -C /source/ury --exclude=.git --exclude=node_modules --exclude=docker \
  --exclude=ury/public/pos --exclude=ury/public/ury --exclude=ury/public/urypos \
  --exclude=ury/public/mosaic --exclude=ury/public/order \
  -cf - . | tar -C apps/ury -xf -
# apps.txt may lack a trailing newline; add one before appending.
if ! grep -qx ury sites/apps.txt; then
  [ -z "$(tail -c1 sites/apps.txt)" ] || echo >> sites/apps.txt
  echo ury >> sites/apps.txt
fi
bench pip install -e apps/ury
if [ ! -f sites/$SITE/site_config.json ]; then
  bench new-site $SITE --db-root-username root --db-root-password ury-local-db \
    --admin-password Ury-Local-Only-2026 --mariadb-user-host-login-scope='%'
fi
bench --site $SITE set-config mute_emails 1
bench --site $SITE set-config pause_scheduler 1
bench --site $SITE set-config developer_mode 1
bench --site $SITE set-config allow_tests true
bench --site $SITE list-apps | grep -q '^erpnext' || bench --site $SITE install-app erpnext
bench --site $SITE list-apps | grep -q '^ury' || bench --site $SITE install-app ury
bench --site $SITE migrate
bench use $SITE
bench version
echo "Backend ready. Build frontends with: bench build --app ury"
