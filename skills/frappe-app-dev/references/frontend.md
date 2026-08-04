# Frontend & UI

Frappe apps can have three types of frontends. Detect which one applies by looking at the app structure, then load ONLY the relevant file:

| Type | How to detect | File |
|------|--------------|------|
| **Desk** (admin UI) | All apps have this by default | [frontend-desk.md](./frontend-desk.md) |
| **Vue 3 + frappe-ui + Vite** | `frontend/` directory with `vite.config.ts` | [frontend-vue.md](./frontend-vue.md) |
| **Portal pages** | `www/` directory with `.html` templates | [frontend-portal.md](./frontend-portal.md) |

An app can use multiple types simultaneously (e.g. Desk for admin + Vue SPA for users).
