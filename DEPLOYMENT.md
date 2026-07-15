# URY POS Fork — Deployment Runbook

**Bench:** `chefworks.storenxt.in` (multi-tenant, AWS ap-south-1)
**Live app folder:** `~/frappe-bench/apps/ury` — always deploy here. Never create a second clone (e.g. `apps/ury-mxt`) alongside it — confirm with `cat ~/frappe-bench/apps.txt | grep ury` if unsure which folder is actually wired in.
**Fork:** `https://github.com/Vijay-micronxt/ury-mxt.git`
**Upstream (reference only):** `https://github.com/ury-erp/ury.git`

---

## 0. Always run as the `frappe` user

```bash
whoami   # must say "frappe" — not ubuntu, not root, no sudo
sudo su - frappe
cd frappe-bench
```
Running as the wrong user causes silent permission failures on `pip install` / file writes.

---

## 1. Pull latest code into the live folder

```bash
cd ~/frappe-bench/apps/ury
git remote -v                      # confirm your fork's remote is present
git status                         # must be clean before pulling
git branch -vv                     # confirm it's tracking the right fork branch
git pull                           # if tracking is set up correctly, this just works
```

If you hit a conflict on a fixtures file (`custom_field.json`, `client_script.json`, `role.json`):
```bash
git diff ury/fixtures/<file>.json   # see what's different first
git stash push -m "local drift" -- ury/fixtures/<file>.json
git pull
grep -c "<field_name_you_expect>" ury/fixtures/custom_field.json   # confirm fork already has it
git stash drop                      # only after confirming above
```

---

## 2. Install, build, migrate

```bash
cd ~/frappe-bench
./env/bin/pip install -e apps/ury
bench build --app ury
bench --site chefworks.storenxt.in set-maintenance-mode on
bench --site chefworks.storenxt.in migrate
```

**Watch the migrate output for:**
```
Skipping fixture syncing from the file custom_field.json. Reason: ...
```
If you see this, the fixture import failed silently — check the JSON is valid and the `dt` (doctype) values are exactly correct before moving on.

---

## 3. Finish up

```bash
bench --site chefworks.storenxt.in clear-cache
bench --site chefworks.storenxt.in clear-website-cache
bench restart
bench --site chefworks.storenxt.in set-maintenance-mode off
```

⚠️ `bench restart` restarts shared workers for **every site on this bench**, not just this one — a few seconds of blip bench-wide. Do this in a low-traffic window, and spot-check one other client site afterward (e.g. Srinath Collective) just to confirm nothing regressed.

---

## 4. Verify

- Open a few existing POS Invoice / URY Table / URY Room records — confirm they load
- Confirm any new Custom Fields actually render on their doctype forms
- Check `/urypos` and `/pos` routes both resolve
- If a field is in the fixtures file but not showing in the UI, check the DB directly before assuming it's broken:
  ```bash
  bench --site chefworks.storenxt.in console
  >>> frappe.db.exists("Custom Field", "<DocType>-<fieldname>")
  ```
  - Returns `None` → import genuinely failed, go back to step 2
  - Returns the name → it's just cache → `frappe.clear_cache(doctype="<DocType>")` then hard-refresh browser

---

## 5. If someone added a Custom Field directly on the live site (not via code)

**Preferred: don't export on the server at all.** Recreate the field in code on a dev bench, open a PR, and let the normal pull + migrate create it on the site. The server repo stays clean.

If you must export on the server, understand the risk first: `export-fixtures`
**rewrites the whole fixtures file from this site's DB**. Any field that exists
in the file but not on this site (e.g. from a branch this site hasn't migrated
yet) is silently DELETED from the file. This is exactly how
`show_item_code` was lost once already (commit `e7b28e9`).

```bash
bench --site chefworks.storenxt.in export-fixtures --app ury
cd ~/frappe-bench/apps/ury
git diff ury/fixtures/          # REVIEW: added lines = your new field.
                                # DELETED lines = someone else's field being
                                # destroyed — STOP and git checkout -- the file.
git add ury/fixtures/
git commit -m "Sync fixtures from live DB: <describe what was added>"
git push <remote> <branch>      # push a branch + PR; never commit straight to develop
```

**Never leave the export uncommitted.** A dirty `ury/fixtures/*.json` blocks every future `git pull` on the server. If you find the file dirty and don't know why, `git diff` it; if the diff only re-adds things the fork already has, discard it: `git checkout -- ury/fixtures/custom_field.json`.

---

## Golden rules
1. One app folder (`apps/ury`) — never a second clone.
2. Always confirm `git status` is clean before pulling.
3. Always check migrate output for "Skipping fixture syncing" lines.
4. Always confirm at the DB level (`frappe.db.exists(...)`) before assuming a fixture didn't sync — most "not reflecting" issues are cache, not import failures.
5. Backup before any of this: `bench --site chefworks.storenxt.in backup --with-files`
