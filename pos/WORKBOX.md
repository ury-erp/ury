# URY POS Workbox Service Worker

## 1. Architectural Boundaries

> [!IMPORTANT]
> 1. **NO BUSINESS LOGIC INSIDE SERVICE WORKER**: Cart, order, payment, sync, and conflict-resolution logic live in `@ury/core` and React components only.
> 2. **INDEXEDDB IS THE SINGLE SOURCE OF TRUTH**: All transactional offline data (orders, queue, settings) lives in `UryPosDatabase`.
> 3. **NO CACHING FOR MUTATIONS**: `POST`, `PUT`, and `DELETE` requests bypass Workbox caching. They are queued by `@ury/core/SyncEngine` when the network is unavailable.

## 2. Build & Registration

The service worker is built from `pos/src/sw.ts` using **vite-plugin-pwa** in `injectManifest` mode.

```bash
cd pos
yarn build
```

This emits:

- `ury/public/pos/sw.js` — the compiled service worker
- `ury/public/pos/index.html` — copied to `ury/www/pos.html` for Frappe routing

The service worker is registered from `pos/src/main.tsx` via `registerServiceWorker()`.

## 3. Caching Strategy

| Category | Strategy | Cache Name | Notes |
|---|---|---|---|
| App shell | `PrecacheAndRoute` | `workbox-precache-v2` | Build-time manifest revisioning |
| Navigation | `NavigationRoute` | N/A | Falls back to `index.html` for SPA routes |
| JS/CSS | `StaleWhileRevalidate` | `ury-pos-static-assets` | `BroadcastUpdatePlugin` on updates |
| Fonts | `CacheFirst` | `ury-pos-fonts` | Max 30 entries, 30 days |
| Images | `CacheFirst` | `ury-pos-images` | Max 100 entries, 30 days |
| Master-data GET | `NetworkFirst` | `ury-pos-master-data-get` | 3 s timeout, 24 h fallback, `BroadcastUpdatePlugin` |

Cached GET endpoints (read-only):

- `ury.ury_pos.api.getRestaurantMenu`
- `ury.ury_pos.api.getModeOfPayment`
- `ury.ury_pos.api.getMenuCourses`
- `ury.ury_pos.api.getAggregator`
- `ury.ury_pos.api.getAggregatorItem`
- `ury.ury_pos.api.getPosProfile`
- `ury.ury_pos.api.getBranchRoom`

Live endpoints such as `getPosInvoice`, `getPosInvoiceItems`, `searchPosInvoice`, and `get_split_group` are intentionally **not** cached by Workbox; the app provides IndexedDB fallback.

## 4. Scope

The service worker script is served from `/assets/ury/pos/sw.js`. To control the POS page at `/pos`, it is registered with scope `'/'`.

This requires the server to send the header:

```
Service-Worker-Allowed: /
```

for requests to `/assets/ury/pos/sw.js`.

- **Development**: The URY `after_request` hook in `ury/utils.py` adds this header automatically.
- **Production**: Add the header in the reverse-proxy (nginx) configuration for `/assets/ury/pos/sw.js`.

If the wide scope is rejected, `registerServiceWorker()` falls back to the default script scope so caching still functions for direct asset requests.

## 5. Non-Cached Requests

The following are never cached and always go to the network (offline failures are handled by the app-layer command queue):

- `POST /api/method/ury.ury.doctype.ury_order.ury_order.sync_order`
- `POST /api/method/ury.ury.doctype.ury_order.ury_order.make_invoice`
- `POST /api/method/ury.ury.doctype.ury_order.ury_order.merge_tables_batch`
- `POST /api/method/ury.ury.doctype.ury_order.ury_order.split_bill`
- `POST /api/method/ury.ury.doctype.ury_order.ury_order.table_transfer`
- `POST /api/method/ury.ury.doctype.ury_order.ury_order.captain_transfer`
- `POST /api/method/ury.ury_pos.api.cancel_order`
- `POST /api/method/ury.ury_pos.api.merge_bills`
- `POST /api/method/ury.ury_pos.api.delete_draft_invoice`
- `POST /api/method/ury.ury.api.ury_print.qz_print_update`

## 6. Updating the Service Worker

`vite-plugin-pwa` injects content hashes into the precache manifest on every build. When a new build is deployed, the updated service worker installs and activates automatically; the registration helper reloads the page on first update to ensure the new app shell is used.
