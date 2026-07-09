# Build and Deploy

## Frontend-to-Backend URL Routing
The application exposes standard web routes defined in `hooks.py` via `website_route_rules`. These map the following frontend paths to the corresponding HTML/Jinja templates located in the `www/` directory:

- **`/pos/<path:app_path>`** routes to `pos.html` (Standard POS UI).
- **`/urypos/<path:app_path>`** routes to `urypos.html` (Custom URY POS UI).
- **`/URYMosaic/<path:app_path>`** routes to `URYMosaic.html` (Mosaic Dashboard/UI).

These files act as the entry points for the Vue/React or native ERPNext Single Page Applications (SPA), serving the base HTML and bootstrapping the required JavaScript bundles.
