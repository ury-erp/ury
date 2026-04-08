# URYMosaic — Agent Documentation

## 1. Overview

**URYMosaic** is a Vue 3 real-time Kitchen Order Ticket (KOT) display system. It runs on a screen in the kitchen and shows live order tickets as they are placed or modified by the POS. Kitchen staff use it to track what to prepare and mark orders as served.

- **URL:** `/URYMosaic/<production_unit_name>` (e.g., `/URYMosaic/Kitchen`)
- **Served as:** Frappe web page (`ury/www/URYMosaic.html`)
- **Build output:** `ury/public/URYMosaic/`

The production unit name in the URL determines which KOTs are displayed. Each physical kitchen station has its own URL pointing to its production unit.

---

## 2. Tech Stack

| Concern | Library / Version |
|---|---|
| UI framework | Vue 3.3.4 (Options API) |
| Build tool | Vite 4.4.5 |
| Real-time | socket.io-client 4.5.1 |
| Layout | masonry-layout 4.2.2 |
| Styling | Tailwind CSS 3.3.3 |
| Backend API | frappe-js-sdk 1.3.6 |
| Routing | vue-router 4 |

---

## 3. Project Structure

```
URYMosaic/
├── src/
│   ├── main.js           ← Vue app entry point
│   ├── App.vue           ← Root component: mounts Header + KOT
│   │
│   ├── components/
│   │   ├── kot.vue       ← Main KOT display (entire app logic lives here)
│   │   └── Header.vue    ← Top bar with logo and refresh button
│   │
│   ├── views/
│   │   ├── Home.vue      ← Unused placeholder
│   │   └── Login.vue     ← Simple login form (Frappe session auth)
│   │
│   ├── router/
│   │   ├── index.js      ← Routes: / → KOT component
│   │   └── auth.js       ← Login route + auth guard
│   │
│   └── assets/
│       └── logos/        ← mosaic.jpg logo
│
├── public/               ← Static assets
├── index.html            ← HTML entry
├── vite.config.js
└── package.json
```

---

## 4. Key Components

### `kot.vue` — The Core Component

This is where all business logic lives. It is a large Vue Options API component (~620 lines).

**Data properties:**
| Property | Purpose |
|---|---|
| `kot` | Array of KOT objects fetched from API |
| `production` | Production unit name (extracted from URL path) |
| `branch` | Branch code from API response |
| `kot_channel` | Socket.io channel name: `kot_update_{branch}_{production}` |
| `kot_alert_time` | Minutes threshold for alerting delayed orders |
| `audio_alert` | Whether to play sound on new KOT |
| `daily_order_number` | Whether to show daily order number (vs invoice suffix) |
| `isOnline` | Network status (drives status message display) |

**Key methods:**

| Method | Purpose |
|---|---|
| `auth()` | Gets logged-in Frappe user; shows modal if unauthenticated |
| `fetchKOT()` | `call.get('ury.ury.api.ury_kot_display.kot_list')` — loads all active KOTs |
| `serveOrder(kot)` | `call.post(serve_kot)` — marks KOT as served, hides card |
| `confirmOrder(kot)` | `call.post(confirm_cancel_kot)` — acknowledges a cancelled KOT |
| `rotateCard(kot)` | Toggles overlay on KOT card (reveals Serve/Confirm button) |
| `toggleItemStrikeThrough(kotitem, kot)` | Marks individual items as done (stored in localStorage) |
| `updateColorandTable(kot, …)` | Sets card background colour based on order type/status |
| `updateTimeRemaining()` | Recalculates elapsed time for all KOTs |
| `orderDelayNotify(kot)` | Sends delay notification when KOT reaches alert threshold |
| `masonryLoading()` | Re-runs Masonry layout after DOM updates |
| `handleOnline/Offline()` | Network status handlers — refreshes KOTs on reconnect |

**KOT card colours:**
- White → Dine-in
- `bg-blue-100` → Takeaway
- `bg-[#FFD493]` → Order Modified
- `bg-[#FFD2D2]` → Cancelled / Partially cancelled

### `Header.vue`
Minimal header with logo and a refresh button that calls `window.location.reload()`.

---

## 5. API Interactions

All API calls use a `FrappeApp` instance initialised with the current page URL:

```javascript
const frappe = new FrappeApp(url);  // url = window.location.origin
const call = frappe.call();
```

**Endpoints called:**

| Endpoint | Method | Purpose |
|---|---|---|
| `ury.ury.api.ury_kot_display.get_site_name` | GET | Gets Frappe site name for Socket.io namespace |
| `ury.ury.api.ury_kot_display.kot_list` | GET | Returns all active KOTs + branch config |
| `ury.ury.api.ury_kot_display.serve_kot` | POST | Mark a KOT as served |
| `ury.ury.api.ury_kot_display.confirm_cancel_kot` | POST | Acknowledge cancelled KOT |
| `ury.ury.api.ury_kot_notification.order_delay_notification` | POST | Trigger delay notification |

**`kot_list` response structure:**
```json
{
  "message": {
    "Branch": "Main Branch",
    "KOT": [...],
    "kot_alert_time": 15,
    "audio_alert": 1,
    "daily_order_number": 1
  }
}
```

Each KOT object contains: `name`, `time`, `type`, `restaurant_table`, `table_takeaway`, `is_aggregator`, `customer_name`, `aggregator_id`, `order_no`, `invoice`, `comments`, `production`, `kot_items[]`.

---

## 6. Data Flow

```
1. mounted() called
   │
   ├── fetchAndSetSiteName() → window.globalSiteName
   ├── initializeSocket()    → connects socket.io to site namespace
   ├── auth()                → verifies Frappe session
   └── fetchKOT()
         │
         ├── Sets: branch, kot_alert_time, audio_alert, daily_order_number, kot_channel
         ├── this.kot = result.message.KOT
         └── updateQtyColorTable() → updateTimeRemaining() → masonryLoading()

2. Socket.io listener: socket.on(kot_channel, doc)
   │
   ├── Play audio if enabled
   ├── this.kot.unshift(doc.kot)   ← prepend new KOT
   ├── masonryLoading()
   ├── updateQtyColorTable()
   └── updateTimeRemaining()

3. setInterval(updateTimeRemaining, 60000)  ← every 60 seconds
```

---

## 7. Extension Points

**Adding a new KOT type / colour:**
- `updateColorandTable()` in `kot.vue` — add a new `else if` condition.

**Adding a new action button:**
- Add button inside the `.isRotated` overlay div in the KOT card template.
- Wire to a new method that calls the appropriate Frappe API.

**Adding new KOT data fields to the display:**
- The `kot_list` API (`ury/ury/api/ury_kot_display.py`) returns the raw KOT fields.
- Add the field to the KOT doctype if needed, return it from `kot_list`, then render in the template.

**Changing the production unit filter:**
- The URL path segment becomes `this.production` via `decodeURIComponent(parts[parts.length - 1])`.
- KOTs are filtered server-side by `kot.production === this.production` on the client.
- To filter differently, modify `kot_list` in `ury_kot_display.py`.

**Changing layout:**
- Masonry grid: `.grid` div with `.masonry-item` children. Adjust `cols-` Tailwind classes on the grid.
- Masonry is re-initialised on every data change via `masonryLoading()` — always call this after updating `this.kot`.

---

## 8. Rules for Modifying Safely

### Socket channel naming
The channel name is `kot_update_{branch}_{production}`. This string must match what the backend publishes in `ury_kot_display.py` when broadcasting KOT updates. Do not change either side independently.

### Production unit in URL
The `production` value comes from the URL path. This is case-sensitive and must match the `URY Production Unit` doctype name exactly. Changing URL structure requires updating `website_route_rules` in `ury/hooks.py`.

### KOT `showDiv` flag
KOTs are hidden from the board by setting `kot.showDiv = true` (not by removing from array). This keeps array indices stable during socket updates. Do not filter the `kot` array reactively.

### LocalStorage strike-through state
`toggleItemStrikeThrough` persists `{kotName}_{itemName}_strike` keys in localStorage. `removeAllItemsFromLocalStorage` cleans up after a KOT is served/confirmed. Ensure any KOT removal also calls this cleanup.

### Audio alerts
`audio_alert` is fetched from the backend (`POS Profile` / `URY Printer Settings`). Audio only plays if `audio_alert === 1` AND the user has clicked the page at least once (browser autoplay policy). The `showAudioAlertMessage` banner guides users to click.

### Authentication
If `auth()` fails, `this.showModal = true` shows a "Not Permitted / Login" modal. The redirect goes to `/login?redirect-to=URYMosaic/{production}`. Do not remove this auth check.

### What NOT to change
- The `kot_channel` computation — changing it breaks real-time updates.
- The `frappe.call()` initialisation pattern — `url` must be the site origin, not a path.
- `masonryLoading()` call pattern — always call it via `this.$nextTick()` inside to avoid layout before DOM updates.
- The `kot.isRotated` card flip pattern — it is the only user interaction to reveal action buttons; modifying it affects kitchen UX.
