# Bench CLI Reference

Always use bare `bench`. Not `./env/bin/bench`.

## App & site lifecycle

```bash
# New app (MUST pipe input — no heredoc, no --no-input)
printf '<title>\n<desc>\n<publisher>\n<email>\n<license>\nN\nN\nN\n' | bench new-app <app-name>

# New site (set root_password in common_site_config first: bench set-config -g root_password '<pwd>')
bench new-site <name>.localhost --admin-password admin

# Install/uninstall app
bench --site <site> install-app <app-name>
bench --site <site> uninstall-app <app-name>

# List apps on site
bench --site <site> list-apps

# Migrate (apply schema + data changes)
bench --site <site> migrate

# Set default site
bench use <site>
```

## Development

```bash
# Start dev server (run in BACKGROUND)
bench start

# Developer mode
bench set-config -g developer_mode 1

# Python console with site context
bench --site <site> console

# Execute a Python expression
bench --site <site> execute frappe.utils.get_url

# Execute with args and kwargs
bench --site <site> execute path.to.function arg1 arg2 --kwarg1 hello

# Run tests
bench --site <site> run-tests --app <app-name>
bench --site <site> run-tests --doctype "DocType Name"

# Build frontend assets
bench build --app <app-name>

# Watch mode for frontend
bench watch
```

## Site maintenance

```bash
# Backup
bench --site <site> backup

# Restore
bench --site <site> restore <path>

# Clear cache
bench --site <site> clear-cache
bench --site <site> clear-website-cache

# Set site config
bench --site <site> set-config <key> <value>

# Global config
bench set-config -g <key> <value>

# MariaDB console (debugging only)
bench --site <site> mariadb

# Drop site (DESTRUCTIVE)
bench drop-site <site> --db-root-password '<pwd>'
```

## Fixtures

```bash
# Export fixtures defined in hooks.py
bench --site <site> export-fixtures --app <app-name>
```
