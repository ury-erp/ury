# Site Management

## Finding existing sites

```bash
ls sites/
```

Ignore these entries: `assets`, `apps.txt`, `common_site_config.json`, `currentsite.txt`. Everything else is a site directory.

## Matching a site to an app

Convention: site name often contains the app name (e.g. `gameplan.localhost` for app `gameplan`).

To confirm which apps are on a site:
```bash
bench --site <site> list-apps
```

If multiple sites exist, check each until you find the one with the target app installed.

## Creating a new site

First, check if `root_password` is already set in `sites/common_site_config.json`. If not, recommend the user set it once so future site creation doesn't require the password each time:

```bash
bench set-config -g root_password '<pwd>'
```

Then create the site:

```bash
# If root_password is in common_site_config.json:
bench new-site <name>.localhost --admin-password admin

# Otherwise, pass it explicitly:
bench new-site <name>.localhost --db-root-password '<pwd>' --admin-password admin
```

Naming convention: `<app-name>.localhost` (e.g. `expense_tracker.localhost`).

## Useful site commands

```bash
# Set as default site
bench use <site>

# Drop a site (DESTRUCTIVE — ask user first)
bench drop-site <site> --db-root-password '<pwd>'

# Backup
bench --site <site> backup

# Restore
bench --site <site> restore <backup-path>

# Clear cache
bench --site <site> clear-cache

# Access mariadb console (for debugging only)
bench --site <site> mariadb

# Interactive Python console with site context
bench --site <site> console

# Run arbitrary Python non-interactively
bench --site <site> execute frappe.utils.get_url
bench --site <site> execute myapp.api.some_function --kwargs '{"arg1": "value"}'
```

## Site config

Per-site config lives in `sites/<site>/site_config.json`. Global config in `sites/common_site_config.json`.

```bash
# Set site-level config
bench --site <site> set-config <key> <value>

# Set global config
bench set-config -g <key> <value>
```
