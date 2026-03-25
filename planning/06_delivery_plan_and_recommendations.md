# 11. Incremental Delivery Plan

## Phase 0: Foundation & Extraction (2-3 weeks)

> **Goal**: Set up shared infrastructure without breaking existing apps.

| Output | Details |
|--------|---------|
| npm workspaces | Root `package.json` with `"workspaces": ["packages/*", "apps/*"]` |
| `@ury/ui` package | Extract `pos/src/components/ui/` → `packages/ui/` |
| `@ury/api-client` package | Extract `frappe-sdk.ts` + typed wrappers |
| `@ury/cart` package | Extract cart logic from `pos-store.ts` |
| `@ury/config` package | Extract `doctypes.ts`, `order-types.ts` |
| POS v2 refactor | Update imports to use packages, verify all existing features work |
| Backend `ury_customer` module | Create module skeleton with `get_public_menu()` API |
| Backend DRY pass | Unify duplicate invoice queries in `ury_pos/api.py` |

| Dependencies | None — builds on existing code |
|---|---|
| **Risks** | Import path breakage in POS v2 during extraction |
| **Fallback** | Extract incrementally: start with `@ury/config` (zero-risk), then `@ury/ui`, etc. |

## Phase 1: Shared Ordering Core (2-3 weeks)

> **Goal**: Backend APIs that support customer-facing ordering.

| Output | Details |
|--------|---------|
| `create_customer_order()` | New whitelisted API in `ury_customer/api.py` — auto-assigns cashier from active POS Opening, accepts guest phone, creates POS Invoice, triggers KOT |
| `get_order_status()` | Order status tracking API |
| `fulfillment_status` field | New Select field on POS Invoice: Placed/Confirmed/Preparing/Ready/Served/PickedUp |
| `order_source` field | New Select on POS Invoice: POS/QR/Online/Kiosk/WhatsApp |
| Fulfillment state machine | Backend logic + realtime push on status transitions |
| `@ury/order` package | Frontend order lifecycle + status tracker component |
| `@ury/menu` package | Menu fetching hook + MenuCard + CategoryFilter |

| Dependencies | Phase 0 (packages must exist) |
|---|---|
| **Risks** | Auto-cashier assignment edge cases (no POS Opening, multiple cashiers) |
| **Fallback** | Default to restaurant owner if no active cashier; notify staff to open POS |

## Phase 2: QR Table Ordering MVP (3-4 weeks)

> **Goal**: First customer-facing app — scan QR at table, browse menu, order.

| Output | Details |
|--------|---------|
| QR token system | `generate_table_qr()` / `validate_table_token()` — JWT signed with Frappe secret |
| `apps/table-order` | New React app: token resolver → menu → cart → order → status |
| QR code generator | Staff-facing tool to generate/print QR codes per table |
| Route setup | `/order/t/<token>` → `table-order.html` in `hooks.py` |
| Call waiter | Realtime button → POS notification |
| WhatsApp integration | Install `frappe_whatsapp`, create "Order Received" template |
| **No payment yet** | V1 allows "pay at counter" — payment comes in Phase 2.5 |

| Dependencies | Phase 1 (shared ordering core) |
|---|---|
| **Risks** | Frappe guest permission model may need tuning; CORS for cross-domain if needed |
| **Fallback** | Deploy as subdomain on same Frappe site (no CORS issue) |

### Phase 2.5: Payment Gateway Integration (2-3 weeks)

| Output | Details |
|--------|---------|
| `URY Payment Gateway` doctype | Gateway name, provider, API keys, webhook URL |
| `ury_payment` module | `initiate_payment()`, `verify_payment()`, `handle_webhook()` |
| Provider: Stripe | First implementation — global coverage |
| Provider: Razorpay | Second implementation — India market |
| `@ury/payment` package | Frontend PaymentSheet, gateway selector UI |
| Plug into QR app | Add payment step to table-order flow |

| Dependencies | Phase 2 (QR app must exist to test with) |
|---|---|
| **Risks** | Payment webhook reliability; PCI compliance for card data |
| **Fallback** | Use Stripe/Razorpay hosted checkout (no card data touches your server) |

## Phase 3: Online Customer Ordering (3-4 weeks)

> **Goal**: Remote ordering with pickup/delivery.

| Output | Details |
|--------|---------|
| `apps/customer-order` | New React app: restaurant landing → menu → cart → checkout → payment → tracking |
| Restaurant slug system | `slug` field on URY Restaurant, public URL `/menu/<slug>` |
| OTP auth | `ury_customer/auth.py` — phone-based OTP via SMS or WhatsApp |
| Customer session doctype | `URY Customer Session` — tracks guest sessions |
| Pickup time slots | `get_available_pickup_slots()` API based on opening hours |
| `scheduled_pickup_time` field | New Datetime on POS Invoice |
| Order history | Customer can view past orders (by phone number) |
| WhatsApp templates | Order confirmed, order ready, invoice attachment |

| Dependencies | Phase 2.5 (payment must work) |
|---|---|
| **Risks** | OTP delivery reliability; ensuring menu stays in sync with active POS |
| **Fallback** | Allow guest checkout without OTP (phone-only identification) |

## Phase 4: Curbside Extension (1-2 weeks)

> **Goal**: Add curbside pickup as fulfillment option.

| Output | Details |
|--------|---------|
| "Curbside" order type | Add to POS Invoice `order_type` options |
| Arrival notification | `notify_arrival(order_token, vehicle_info)` API |
| Staff notification | Realtime push to POS when customer arrives |
| Handoff confirmation | Staff marks "Picked Up" → customer gets WhatsApp confirmation |
| Vehicle info field | Optional field capture at checkout |

| Dependencies | Phase 3 (customer ordering must exist) |
|---|---|
| **Risks** | Low — thin extension layer |
| **Fallback** | Can work with just a "call us when you arrive" instruction |

## Phase 5: Kiosk Mode (2-3 weeks)

> **Goal**: In-store self-service ordering on large screen.

| Output | Details |
|--------|---------|
| `apps/kiosk` | New React app: attract screen → menu → cart → payment → confirmation |
| `URY Kiosk Device` doctype | Device registration, auth token, restaurant link |
| Device auth | One-time setup token, auto-login on boot |
| Large-format UI | Touch-optimized components using `@ury/ui` variants |
| Inactivity timeout | 90s timer → cart clear → attract screen |
| Auto-reset | Post-order confirmation → 15s → attract screen |
| Hardware integration | Tap-to-pay terminal via payment gateway (Stripe Terminal / Square) |

| Dependencies | Phase 2.5 (payment) + packages from Phase 0-1 |
|---|---|
| **Risks** | Hardware payment terminal integration; kiosk browser lockdown |
| **Fallback** | QR code payment (customer pays on their phone) instead of embedded terminal |

## Phase 6: Hardening & Analytics (2-3 weeks)

| Output | Details |
|--------|---------|
| Error monitoring | Sentry or Frappe error logging integration |
| Analytics events | Order source tracking, conversion funnel, avg order value by channel |
| Rate limiting | Protect public APIs from abuse |
| Load testing | Simulate concurrent customer orders |
| Documentation | API docs, deployment guide, configuration manual |
| AGENTS.md | Developer guide for AI agents working on the codebase |

---

# 12. Final Recommendation

## Best Architecture
**Monorepo with domain packages + multiple app entry points** — matches the existing pattern, enables independent releases, cleanly separates staff and customer auth domains.

## Best App Split

| App | Status | Priority |
|-----|--------|----------|
| Staff POS v2 (`pos/`) | Keep, refactor to use packages | Ongoing |
| QR Table Order (`table-order/`) | **Build new** | ⭐ Highest |
| Customer Ordering (`customer-order/`) | **Build new** | High |
| Curbside | Fulfillment mode in customer-order | Medium |
| Kiosk (`kiosk/`) | **Build new** (thin shell) | Medium |
| POS v1 (`urypos/`) | Maintain, don't invest | Low |
| Mosaic KDS (`URYMosaic/`) | Keep as-is | N/A |

## What to Build First
**QR Table Self-Order** — smallest scope, highest restaurant value, validates the entire shared ordering core, and is deployable standalone.

## What to Refactor Before Building
1. Extract cart logic from `pos-store.ts` → `@ury/cart`
2. Create `get_public_menu()` backend API (guest-accessible)
3. Create `create_customer_order()` that auto-assigns cashier
4. Add `fulfillment_status` field to POS Invoice

## What Can Be Reused Immediately
- ERPNext Item, Price List, Tax Templates — no changes
- `URY Menu`, `URY Menu Item`, `URY Menu Course` — as-is
- `URY Restaurant`, `URY Room`, `URY Table` — as-is
- KOT engine (`ury_kot_generate.py`) — triggers after order creation
- Frappe realtime (`publish_realtime`) — for order status push
- UI primitives (`pos/src/components/ui/`) — extract and share

## What Should NOT Be Shared
- POS Opening/Closing flows — staff-only
- Table/captain transfer — staff-only
- Aggregator (Swiggy/Zomato) support — staff-only
- KOT reprint — staff-only
- Invoice printing (QZ/network/socket) — staff-only
- POS v1 codebase (Vue) — legacy, separate lifecycle

## Biggest Technical Risks

| Risk | Mitigation |
|------|-----------|
| Frappe guest permission model may not easily support customer APIs | Use `allow_guest=True` + signed tokens; test early in Phase 1 |
| Auto-cashier assignment when no POS is open | Require at least one POS Opening for online ordering; show "not accepting orders" |
| Payment gateway webhook reliability | Implement idempotent handlers + retry logic; use hosted checkout pages |
| Bundle size for mobile customer apps | Tree-shake aggressively; shared packages must be tree-shakeable |
| WhatsApp template approval (Meta) | Submit templates early; have SMS fallback |

## Biggest Leverage Opportunities

| Opportunity | Impact |
|------------|--------|
| **Shared `@ury/cart` + `@ury/menu`** | Build once, use in 4 apps. Saves 60%+ of frontend work per app |
| **`create_customer_order()` backend** | One API powers QR, online, kiosk, and WhatsApp ordering |
| **Frappe realtime for order tracking** | Already works for KOT push; extend to customer-facing status updates |
| **`frappe_whatsapp` integration** | Free order notifications, link sharing, invoice delivery |
| **ERPNext financial infrastructure** | POS Invoice → accounting → tax reporting already handled |
| **Price List per menu/aggregator** | Supports different pricing for dine-in, takeaway, online without code changes |
