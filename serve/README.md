# URY Serve

Staff table-order React app for URY. It runs at `/ury/serve` on the Frappe site.

Serve covers captain-style table and takeaway orders. It does **not** include cashier Order Log, recent-order settlement, or payment collection UI. Use POS (`/pos`) for those flows.

## Requirements

- Yarn classic workspaces at the repo root (`serve` is a workspace member)
- Frappe site with the `ury` app installed
- Logged-in user with a URY POS role (see AGENTS.MD)
- Open POS opening entry for the branch profile

## Scripts

From `serve/`:

| Script | Action |
|--------|--------|
| `yarn dev` | Vite dev server |
| `yarn build` | Build to `../ury/public/serve` and copy `index.html` to `../ury/www/serve.html` |
| `yarn typecheck` | TypeScript project build check |
| `yarn test` | Vitest (excludes `src/operations/**`; that suite has its own config) |
| `yarn lint` | ESLint |

From the repo root:

```bash
yarn install
yarn ury-serve-build
# or full chain:
yarn build
```

Then clear Frappe cache if routes look stale:

```bash
bench --site <site> clear-cache
```

Open `https://<site>/ury/serve/` (trailing slash matches the PWA scope).

## Dev notes

- Router `basename` is `/ury/serve`.
- Production assets use base `/assets/ury/serve/`.
- Shared code: `@ury/ui` and `@ury/core` (workspace packages under `packages/`).
- PWA: `main.tsx` calls `registerServiceWorker()` from `src/pwa.ts`. The worker URL is `/ury/serve/sw.js` with scope `/ury/serve/`.
## Known limitations

- Offline: the service worker shows `public/offline.html`. Orders are **not** queued or replayed offline.
- QZ Tray: optional. Set `VITE_QZ_SIGN_KEY` or a local `privateKey.ts` value, then rebuild. Do not commit private keys. Host and print type come from the POS Profile (`qz_host`, `print_type`). Without a signing key, QZ throws a clear configuration error; network and socket (`print_pos_page`) transports still work.
- Printer health: requires the optional `ury_printer_watch` app. When missing, OperationalTools shows an amber unavailable state; print job lists still work.
- Takeaway: requires a billing role (`role_allowed_for_billing` / `canSettlePayment`). Deep links without that role are blocked.
- Uncertain / failed sync: Serve keeps the local draft and **blocks resend**. Table orders can explicitly **Reload from server** (replaces draft only after a successful fetch). Takeaway cannot safely reload — staff must verify in POS, then **Leave without resending** (no blind gate reset).
- Split bill: itemized `SplitOrderDialog` (move quantities to a sibling invoice). Settlement / payment remain in POS.
- No cashier Order Log, recent-order settlement, or payment collection in Serve.

## Further reading

See [AGENTS.MD](./AGENTS.MD) for structure, roles, guards, printing, and agent rules.
