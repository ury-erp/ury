# Local URY stack

Local development only. Its own MariaDB, Redis and bench volume (Compose
project `ury-dev`), bound to 127.0.0.1:18100. Frappe v16.36.0 and ERPNext
v16.37.0. Never reuse these passwords or this compose file for deployment.

Keep the repo out of cloud-synced folders (OneDrive, Proton Drive, Dropbox):
sync clients rename files inside `.git` while git writes them and break the repo.

## Setup

From the repository root (PowerShell; in Git Bash prefix `docker` commands with
`MSYS_NO_PATHCONV=1` so container paths aren't rewritten):

```powershell
docker compose -f docker/local/compose.yaml up -d
docker compose -f docker/local/compose.yaml exec -T backend bash /source/ury/docker/local/bootstrap.sh
docker compose -f docker/local/compose.yaml exec -T backend bash -lc "cd /workspace/frappe-bench && bench build --apps frappe,erpnext && cd apps/ury && yarn install && yarn build"
docker compose -f docker/local/compose.yaml exec backend bash -lc "cd /workspace/frappe-bench && bench serve --port 8000"
```

Open http://localhost:18100 and log in as Administrator / Ury-Local-Only-2026.
The POS is at `/pos`; other frontends at `/ury`, `/order`, `/urypos`, `/mosaic`.

Bootstrap copies the working tree into the bench, so re-run it after code
changes (deleted files are not removed from the copy), then `bench migrate`
and, for frontend changes, `yarn build` in `apps/ury`.

## Sample data

Business setup is done through the `/ury` setup wizard. Client-specific seed
scripts and menus must stay out of this repo: it is deployed for other
restaurants. Keep them outside the repo and `docker cp` them into the container.

## Tests

Use a separate site so test fixtures never touch `ury.localhost`:

```powershell
docker compose -f docker/local/compose.yaml exec -T backend bash -lc "cd /workspace/frappe-bench && bench new-site ury-test.localhost --db-root-username root --db-root-password ury-local-db --admin-password Ury-Local-Only-2026 --mariadb-user-host-login-scope='%' --install-app erpnext && bench --site ury-test.localhost install-app ury"
docker compose -f docker/local/compose.yaml exec -T backend bash -lc "cd /workspace/frappe-bench/sites && ../env/bin/python /source/ury/docker/local/run_tests.py ury.ury.doctype.ury_order.test_ury_order"
```

`run_tests.py` explains why it replaces `bench run-tests`. Known on
`feat/frappe-v16-compat`: `test_sync_order_authorized` and
`test_sync_order_unauthorized` fail, and
`test_sync_order_fake_cashier_waiter_new_invoice` fails on the first run
against a fresh site only. If pages return 500
after a test run, flush Redis (`docker compose -f docker/local/compose.yaml exec redis redis-cli FLUSHALL`) and restart `bench serve`.

Stop without deleting data: `docker compose -f docker/local/compose.yaml stop`.
