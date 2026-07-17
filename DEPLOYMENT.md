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

**Never run `bench export-fixtures` on the live server.** It rewrites `ury/fixtures/*.json`
in the live git folder from whatever that one site's DB holds — it drops fields the repo
has but that site doesn't (that's how `show_item_code` was lost), and it dirties the tree
so every later `git pull` aborts with "local changes would be overwritten". Both of our
broken deploys trace back to exactly this command being run here.

Fixtures flow **one direction only**: repo → server. The server consumes fixtures via
`bench migrate`; it never produces them.

When a field was created on the live site through Desk UI, bring it into the repo **on
your local machine**:

```bash
# on the developer machine, local dev site (NOT the server)
# 1. create the same Custom Field on the local site (Desk UI or bench console)
bench --site <local-dev-site> export-fixtures --app ury
cd apps/ury
git diff ury/fixtures/          # REVIEW: added lines = your new field only.
                                # DELETED lines = someone else's field being
                                # destroyed — STOP and git checkout -- the file.
git add ury/fixtures/ && git commit -m "fix: add <field> to fixtures"
# push, PR, merge, then deploy normally
```

The live site already has the field in its DB, so the next `bench migrate` simply
aligns the two — nothing is lost, nothing drifts.

If the live tree is already dirty from a past export: `git diff` it first; then
`git stash push -m "server drift"` (recoverable backup), pull, deploy — and never
`git stash pop`. Drop the stash once the deploy is verified.

---

## Golden rules
1. One app folder (`apps/ury`) — never a second clone.
2. Always confirm `git status` is clean before pulling — `scripts/deploy.sh` enforces this and the rest of this runbook automatically.
3. **Never run `bench export-fixtures` on the server, and never create doctype fields directly on the live site** — local dev site → fixtures → PR → migrate is the only path.
4. Always check migrate output for "Skipping fixture syncing" lines.
5. Always confirm at the DB level (`frappe.db.exists(...)`) before assuming a fixture didn't sync — most "not reflecting" issues are cache, not import failures.
6. Backup before any of this: `bench --site chefworks.storenxt.in backup --with-files`
