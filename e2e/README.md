# URY e2e (Playwright)

Scaffolding for browser end-to-end tests against the 4 URY frontend apps:
`frontend/` (dashboard), `pos/` (captain/cashier POS), `self-order/`
(customer self-ordering), `mosaic/` (production board).

## What this is, honestly

This is a **scaffold**, not a full test suite. There was no e2e/browser
test framework anywhere in this repo before this change. The specs under
`tests/` contain one real, currently-passing assertion per app (the app
shell actually mounts and renders a recognizable UI element), plus a
`test.skip`'d golden-path test per app with TODO comments describing what
it would take to make that test real. None of the skipped tests are
faked to "pass" — they're explicitly skipped so CI doesn't report false
confidence about flows that need a live, seeded bench (authenticated
session, seeded branches/rooms/tables/menu items, a real QR/device
token) to actually exercise.

## Prerequisites

These tests are **not** self-starting — there is no `webServer` block in
`playwright.config.ts`. All 4 apps are Frappe-embedded SPAs: their
`index.html` reads `frappe.boot` / `csrf_token` injected by a running
Frappe dev server, and each proxies `/api`, `/app`, `/assets`, `/files` to
a real site (see e.g. `frontend/vite.config.ts`, which targets
`http://ury.localhost:8002`). Automatically spinning up bench + MariaDB +
a seeded site from Playwright would either fake it (mock away the real
backend) or require infra this repo alone can't stand up — so you need a
running bench first.

1. Make sure a bench with the `ury.localhost` site is running (in this
   workspace that's the bench at `/workspace/development/ury`, site
   `ury.localhost` — see the workspace's `WORKSPACE.md` for the exact
   `bench start` invocation if you're using the shared devcontainer).
2. Start each frontend's Vite dev server **on its own port** (none of the
   4 `vite.config.ts` files set an explicit port today, so they'd all
   default to the same 5173 and collide if run concurrently without
   `--port`):

   ```bash
   # from the repo root, four separate terminals/processes
   (cd frontend    && yarn dev --port 5173)
   (cd pos         && yarn dev --port 5174)
   (cd self-order  && yarn dev --port 5175)
   (cd mosaic      && yarn dev --port 5176)
   ```

3. If your bench/site setup uses different host/ports, override the
   defaults baked into `playwright.config.ts` via env vars:

   ```bash
   export URY_FRONTEND_URL=http://ury.localhost:5173
   export URY_POS_URL=http://ury.localhost:5174
   export URY_SELF_ORDER_URL=http://ury.localhost:5175
   export URY_MOSAIC_URL=http://ury.localhost:5176
   ```

## Running

```bash
cd e2e
yarn install   # or npm install / pnpm install
npx playwright install --with-deps   # first time only, installs browsers
yarn test
```

## Layout

- `playwright.config.ts` — 4 projects, one per app, each with its own
  `baseURL`.
- `tests/pos.spec.ts` — captain/cashier POS golden path.
- `tests/self-order.spec.ts` — customer self-order golden path.
- `tests/mosaic.spec.ts` — production board golden path.

(`frontend/` has a project entry in the config for symmetry, but no spec
was written for it in this pass — it wasn't in scope for this track item.)

## Extending these into real golden-path tests

Each spec file has a `TODO(needs seeded bench ...)` comment block above
its skipped test explaining exactly what backend fixture/session state is
missing and what to assert once it exists. Read those before adding real
assertions — the goal is tests that fail for real reasons, not tests that
always pass because they only check that a `<div id="root">` isn't empty.
