# 2. Existing Capability Mapping

## Feature Matrix by Target Experience

| Capability | Internal POS | QR Table Order | Remote Pickup | Curbside | Kiosk |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Menu browsing | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Category/course filtering | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Item images | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cart management | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Pricing/price lists | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tax calculation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Order creation | ✅ | ❌ | ❌ | ❌ | ❌ |
| KOT generation | ✅ | ✅* | ✅* | ✅* | ✅* |
| Table context | ✅ | ❌ | N/A | N/A | N/A |
| Payment (cash/card at counter) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Online payment gateway | ❌ | ❌ | ❌ | ❌ | ❌ |
| Customer auth (staff) | ✅ | N/A | N/A | N/A | N/A |
| Customer auth (guest/OTP) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Order status tracking | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| Order type: Dine In | ✅ | ✅* | ❌ | ❌ | ⚠️ |
| Order type: Take Away | ✅ | ❌ | ✅* | ✅* | ✅* |
| Order type: Delivery | ⚠️ | ❌ | ⚠️ | ❌ | ❌ |
| Pickup scheduling | ❌ | ❌ | ❌ | ❌ | ❌ |
| Curbside arrival/handoff | ❌ | ❌ | ❌ | ❌ | ❌ |
| Kiosk inactivity reset | ❌ | ❌ | ❌ | ❌ | ❌ |
| WhatsApp notifications | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-outlet support | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Aggregator support | ✅ | N/A | N/A | N/A | N/A |

**Legend**: ✅ Supported | ⚠️ Partially (needs changes) | ❌ Missing | * Would work after order creation is refactored

## Blockers by Target App

### QR Table Ordering — Blocked By:
1. **No customer/guest auth** — `sync_order` requires `frappe.session.user` to be a staff user mapped to a Branch via `URY User`
2. **No table→QR token mapping** — No signed/tokenized URL that encodes table + restaurant context
3. **Menu API requires POS Profile** — `getRestaurantMenu(pos_profile, room)` needs POS Profile name, not public
4. **Order creation requires cashier/owner/waiter** — `sync_order` has mandatory staff fields
5. **No online payment** — Only counter-based cash/card via POS Invoice submit

### Remote Pickup Ordering — Blocked By:
1. All QR blockers above, plus:
2. **No public menu endpoint** — No unauthenticated API for menu by restaurant/branch
3. **No pickup scheduling model** — No `scheduled_time`, `prep_time` fields
4. **No order status API** — Customer can't track "preparing → ready"
5. **No address/location model** — No pickup point preferences

### Curbside Pickup — Blocked By:
1. All remote pickup blockers, plus:
2. **No arrival state** — No "I'm here" signal or vehicle info
3. **No handoff workflow** — No staff confirmation of pickup completion

### Kiosk Mode — Blocked By:
1. Same as QR table minus the table-specific parts
2. **No session timeout/reset** — No inactivity detection
3. **No large-screen UI** — Current POS is staff-optimized, not walk-up kiosk-optimized

---

# 3. Reuse and Overlap Analysis

## Core Shared Business Logic

### Directly Reusable (exists, clean enough)

| Module | Location | Notes |
|--------|----------|-------|
| Item/Product model | ERPNext `Item` doctype | Standard, no changes needed |
| Price Lists | ERPNext `Price List` + `Item Price` | Per-menu price lists already work |
| Tax templates | ERPNext `Sales Taxes and Charges Template` | Already configurable per restaurant |
| Menu → Price List link | `URY Menu.price_list` field | Clean 1:1 |
| Menu courses/categories | `URY Menu Course` doctype | Simple, name-based |
| Menu items | `URY Menu Item` child table | item + rate + course + special_dish |
| Restaurant/Branch model | `URY Restaurant` doctype | branch, menu, tax template, series |
| Room model | `URY Room` doctype | branch, type, printer config |
| Table model | `URY Table` doctype | room, shape, seats, occupied, layout |
| KOT engine | `ury_kot_generate.py` | Works after POS Invoice exists |
| Realtime (WebSocket) | Frappe `publish_realtime` | Used for KOT push, reusable for status |
| Currency | ERPNext `Currency` doctype | Standard |

### Needs Refactoring to Reuse

| Module | Current State | What Needs to Change |
|--------|--------------|---------------------|
| Menu API | `getRestaurantMenu(pos_profile, room, order_type)` | Need public variant: `get_public_menu(restaurant_slug)` |
| Order creation | `sync_order()` requires cashier, waiter, owner, POS Profile | Need `create_customer_order()` that auto-assigns cashier |
| Payment | `make_invoice()` — cash/card at counter only | Need payment gateway abstraction layer |
| Cart logic | Embedded in 695-line `pos-store.ts` | Extract to `@ury/cart` shared package |
| Customer | `create_customer(name, mobile)` — basic | Need guest session, OTP auth, profile |
| Order status | Only `POS Invoice.status` (Draft/Paid/Consolidated/Return) | Need granular: Placed → Confirmed → Preparing → Ready → Picked Up |

### Does Not Exist Yet (Must Build)

| Module | For Which Apps |
|--------|---------------|
| Customer/guest auth (OTP, token) | All customer apps |
| QR code → table token resolver | QR table order |
| Online payment gateway abstraction | All customer apps |
| Order status tracking API | All customer apps |
| Pickup scheduling | Remote/curbside pickup |
| Arrival/handoff workflow | Curbside |
| Kiosk session manager | Kiosk |
| WhatsApp integration | All (via `frappe_whatsapp`) |
| Public menu page/API | All customer apps |
| Fulfillment state machine | All customer apps |

## Shared Frontend Foundations

### Already Exists in `pos/` (can extract)

| Foundation | Files | Extractable? |
|-----------|-------|-------------|
| UI primitives | `pos/src/components/ui/` (button, card, dialog, input, select, badge, toast, spinner) | ✅ Direct extraction |
| Frappe SDK wrapper | `pos/src/lib/frappe-sdk.ts` | ✅ Trivial |
| Menu card component | `pos/src/components/MenuCard.tsx` | ⚠️ Needs styling abstraction |
| Search bar | `pos/src/components/SearchBar.tsx` | ✅ Generic |
| Auth guard | `pos/src/components/AuthGuard.tsx` | ⚠️ Staff-only, needs customer variant |
| Order types data | `pos/src/data/order-types.ts` | ✅ Already clean enum |
| Doctype constants | `pos/src/data/doctypes.ts` | ✅ Trivial |

### Experience-Specific Logic (Must Stay Per-App)

| Logic | App |
|-------|-----|
| QR scan → table bootstrap, context display | QR Table |
| POS Opening/Closing dialogs | Staff POS only |
| Table layout/shape rendering | Staff POS only |
| Captain/table transfer | Staff POS only |
| Aggregator select + pricing | Staff POS only |
| Kiosk inactivity timer + session reset | Kiosk only |
| "I'm here" arrival CTA | Curbside only |
| Pickup time slot selector | Remote pickup |
| Address/pickup location manager | Remote pickup |
| WhatsApp message templates | Backend/cross-cutting |

## Recommended Package Boundaries

```
packages/
├── @ury/ui          # Extracted UI primitives (button, card, dialog, etc.)
├── @ury/menu        # Menu fetching, display, category filtering
├── @ury/cart        # Cart state, item add/remove/qty, totals calc
├── @ury/order       # Order creation, status tracking, cancellation
├── @ury/payment     # Payment gateway abstraction
├── @ury/auth        # Staff auth + customer auth (OTP/guest/token)
├── @ury/api-client  # Frappe SDK wrapper + typed API functions
├── @ury/config      # Restaurant/branch/outlet configuration
└── @ury/utils       # Currency, formatting, date, storage
```
