# URY POS Workbox Service Worker Specification

## 1. Executive Architectural Boundaries

> [!IMPORTANT]
> **STRICT ARCHITECTURAL RULES**:
> 1. **NO BUSINESS LOGIC INSIDE SERVICE WORKER**: All cart calculation, order management, state transitions, role validation, and sync processing logic execute strictly within `@ury/core` and React components.
> 2. **INDEXEDDB IS THE SINGLE SOURCE OF TRUTH**: All offline transactional data (orders, drafts, sync queue, settings) reside in IndexedDB collections (`UryPosDatabase`).
> 3. **NO CACHING FOR MUTATION REQUESTS**: `POST`, `PUT`, and `DELETE` HTTP requests are **NEVER** cached by Workbox. They bypass the Service Worker cache and flow directly to network / `CommandQueueManager`.

---

## 2. Workbox Caching Strategies & Route Configuration

| Category | Strategy | Cache Name | Expiration / Configuration | Route Pattern |
|---|---|---|---|---|
| **App Shell Pre-caching** | `PrecacheAndRoute` | `workbox-precache-v2` | Build-time manifest revisioning | `self.__WB_MANIFEST` |
| **Navigation Route** | `NavigationRoute` | N/A | Fallback to `/index.html` | Client-side SPA routes |
| **Static Assets (JS/CSS)** | `StaleWhileRevalidate` | `ury-pos-static-assets` | BroadcastUpdatePlugin on asset updates | `*.js`, `*.css` |
| **Fonts** | `CacheFirst` | `ury-pos-fonts` | Max 30 entries, 30 days expiration | `*.woff2`, Google Fonts |
| **Images** | `CacheFirst` | `ury-pos-images` | Max 100 entries, 30 days expiration | `*.png`, `*.jpg`, `*.svg`, `*.webp` |
| **GET Read-Only Master Data** | `NetworkFirst` | `ury-pos-master-data-get` | 3s network timeout, 24h fallback, BroadcastUpdatePlugin | Read-only GET APIs (`getRestaurantMenu`, `get_table_list`, `get_customer_list`, `get_payment_methods`) |
| **Background Sync Ping** | `NetworkFirst` | `ury-pos-ping-queue` | BackgroundSyncPlugin (max 24h retention) | `/api/method/ury.ury_pos.api.ping` |

---

## 3. Explicit Non-Cached Requests

The following HTTP methods and endpoints **MUST ALWAYS BYPASS WORKBOX CACHING**:

- `POST /api/method/ury.ury.doctype.ury_order.ury_order.sync_order`
- `POST /api/method/ury.ury_pos.api.createPaymentEntry`
- `POST /api/method/ury.ury.doctype.ury_order.ury_order.merge_tables_batch`
- `POST /api/method/ury.ury.doctype.ury_order.ury_order.split_bill`
- `POST /api/method/ury.ury_pos.api.delete_draft_invoice`
- `POST /api/method/ury.ury_pos.api.cancel_order`

All transactional mutations are handled by `@ury/core` **Command Queue** and stored in IndexedDB `sync_queue`.

---

## 4. Broadcast Update & Cache Invalidation

When static assets or read-only master data GET endpoints are updated on the server, Workbox `BroadcastUpdatePlugin` emits a window postMessage event (`workbox-broadcast-update`). The UI list projection engines (`projectionBus`) intercept cache invalidations and refresh projections automatically.
