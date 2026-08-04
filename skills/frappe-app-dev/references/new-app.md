# New App Workflow

Follow these steps in order. Do not skip steps.

## Checklist
```
- [ ] Step 1: Confirm bench root
- [ ] Step 2: Enable developer mode
- [ ] Step 3: Pick or create site
- [ ] Step 4: Create app
- [ ] Step 5: Install app on site
- [ ] Step 6: Build features
- [ ] Step 7: Migrate and verify
```

## Step 1: Confirm bench root

```bash
ls apps/ sites/ Procfile
```
If it succeeds, bench is valid. Do not run anything else to verify.

## Step 2: Enable developer mode

```bash
bench set-config -g developer_mode 1
```

## Step 3: Pick or create site

See [site-management.md](./site-management.md) for finding or creating a site.

Complete this step before proceeding. You need a working site first.

## Step 4: Create app

The `bench new-app` command MUST use piped `printf`. No heredoc (`<<EOF`). No `--no-input`. No `--no-git`. No bare `bench new-app <name>` without pipe.

Ask user for: app name, title, description, publisher, email, license.

```bash
printf '<title>\n<description>\n<publisher>\n<email>\n<license>\nN\nN\nN\n' | bench new-app <app-name>
```

Example:
```bash
printf 'Expense Tracker\nTrack expenses\nJohn\njohn@example.com\nmit\nN\nN\nN\n' | bench new-app expense_tracker
```

Verify:
```bash
ls apps/<app-name>
```

## Step 5: Install app on site

```bash
bench --site <site> install-app <app-name>
bench --site <site> list-apps  # verify
```

## Step 6: Build features

Write DocTypes, controllers, hooks, permissions, UI directly in the app module directory created in step 4.

The app structure after `bench new-app myapp`:
```
apps/myapp/
  myapp/
    myapp/          ← module directory (same name as app)
      __init__.py
    hooks.py
    __init__.py
  setup.py
```

Load the relevant feature references from the main SKILL.md table as needed.

## Step 7: Migrate and verify

```bash
bench --site <site> migrate
```

**Rules:**
- Always pass `--site <site>` explicitly. Never run bare `bench migrate`.
- After migration succeeds, do NOT query the database directly to verify schema changes. Frappe's migrate output is the source of truth.
- If migrate fails with `SyntaxError`, fix the file first, then re-run.

Start bench in background if not already running:
```bash
bench start
```

Get URL:
```bash
bench --site <site> execute frappe.utils.get_url
```
