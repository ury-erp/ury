# 9. UX / Product Flow Plan (Technical)

## A. QR Scan → Table Order Flow

```
1. SCAN: Customer scans QR code at table
   URL: /order/t/eyJhbGciOiJIUzI1NiJ9.eyJyIjoiQmVhY2giLCJ0IjoiVC0wMSIsImV4cCI6MTc...
   
2. TOKEN RESOLVE:
   → API: validate_table_token(token)
   ← Returns: {restaurant: "Beach", table: "T-01", room: "Main Hall", menu: "Default Menu"}
   Edge: Token expired → "Ask your waiter for a new QR code" screen
   Edge: Token invalid → Error page with restaurant contact

3. MENU BROWSE:
   → API: get_public_menu(restaurant="Beach", table_context=true)
   ← Returns: items[] with images, courses, prices, special_dish flags
   State: Cart stored in localStorage (keyed by table token)
   Session recovery: Reload page → restore cart from localStorage + re-validate token

4. ITEM DETAIL (optional):
   → Customer taps item → modal with description, image, qty selector
   → Add to cart → update localStorage cart

5. CART REVIEW:
   → Display items, quantities, subtotal
   → Optional: customer name + phone capture
   → "Place Order" CTA

6. ORDER PLACEMENT:
   → API: create_customer_order(restaurant, items, table_token, customer_phone?)
   ← Backend: auto-assigns cashier from active POS Opening for that room
   ← Backend: creates POS Invoice (Draft) + triggers KOT
   ← Returns: {order_token: "ORD-xxx", status: "placed"}
   Edge: No active POS Opening → "Restaurant not ready, please ask staff"
   Edge: Menu item price changed → re-fetch menu, show diff

7. PAYMENT (if configured):
   → API: initiate_payment(order_id, gateway, amount)
   ← Redirect/embed payment UI (Stripe Elements, Razorpay, etc.)
   → On success: API verify_payment(order_id, ref)
   → Optional: skip if restaurant allows "pay at counter"

8. STATUS TRACKING:
   → Subscribe: frappe.realtime.on("order_status_" + order_token)
   → Display: Placed → Confirmed → Preparing → Ready → Served
   → WhatsApp: Optional push via frappe_whatsapp on status change

9. CALL WAITER:
   → API: call_waiter(table_token)
   → Backend: frappe.publish_realtime("waiter_call", {table: "T-01"})
   → POS v2 shows notification badge
```

## B. Remote Pickup Order Flow

```
1. LANDING: /menu/beach-restaurant
   → API: get_restaurant_info(slug="beach-restaurant")
   ← Returns: name, logo, opening_hours, address, accepts_online_orders
   Edge: Restaurant closed → "Opens at 09:00 AM" with menu preview (disabled ordering)

2. AUTH (optional):
   → Guest: enter phone number → OTP via SMS/WhatsApp
   → Returning: auto-login from saved token
   → Skip: browse menu without auth, require at checkout

3. MENU BROWSE:
   → API: get_public_menu(restaurant, order_type="Take Away")
   → Category tabs, search, item cards
   → Item detail modal with description/image

4. CART + CHECKOUT:
   → Pickup time selector (Now, +15min, +30min, +1hr, specific time)
   → API: get_available_pickup_slots(restaurant) → returns slots based on opening_hours + current load
   → Customer name + phone (required)
   → Order type: Pickup (default) / Curbside (if enabled)

5. PAYMENT: 
   → Online payment required (no "pay at counter" for remote orders)
   → Same gateway flow as QR order

6. CONFIRMATION:
   → Order number + estimated ready time
   → WhatsApp: "Order #{{order_no}} confirmed. Ready by {{time}}. Track: {{link}}"

7. STATUS TRACKING:
   → /order/track/ORD-xxx
   → Push updates via realtime + WhatsApp
```

## C. Curbside Handoff (Extension of Pickup)

```
Same as Remote Pickup flow through step 6, then:

7. ARRIVAL:
   → Customer opens order page → "I've Arrived" button appears when status = Ready
   → API: notify_arrival(order_token, vehicle_info?)
   → Backend: updates fulfillment_status → "Customer Arrived"
   → Staff POS: notification "Customer arrived for ORD-xxx"

8. HANDOFF:
   → Staff brings order to car/pickup point
   → Staff marks "Handed Off" in POS
   → Backend: fulfillment_status → "Picked Up"
   → WhatsApp: "Thanks for your order! Invoice attached."
```

## D. Kiosk Order Journey

```
1. ATTRACT SCREEN:
   → Full-screen branded welcome: "Touch to Order"
   → Logo, restaurant imagery, animated CTA
   → Inactivity timer: 90s of no touch → reset to this screen

2. MENU BROWSE:
   → Large touch-friendly cards (4-6 per screen)
   → Category ribbon at top
   → Quick-add buttons with haptic-style feedback
   → Item detail on tap with large images

3. CART:
   → Side panel or bottom sheet (always visible)
   → Large +/- buttons for quantity
   → Running total prominent

4. CHECKOUT:
   → "Dine In" or "Take Away" selector (large buttons)
   → Optional: phone number for order tracking
   → Payment: tap-to-pay terminal / QR code / card reader
   → No "pay later" option for kiosk

5. CONFIRMATION:
   → Order number (large, prominent): "#42"
   → "Your order is being prepared"
   → QR code to track order on phone
   → Auto-reset to attract screen after 15s

6. EDGE CASES:
   → Payment failure → retry screen with clear error
   → Session timeout mid-order → warn user at 60s, reset at 90s
   → Device offline → show cached menu, queue order for sync
```

---

# 10. Recommended Folder / Package Structure

## Proposed Structure

```
ury/                                    # Frappe app root (existing)
├── ury/                                # Python backend
│   ├── hooks.py                        # Updated route rules
│   ├── ury/                            # URY module (existing — core doctypes)
│   │   ├── api/                        # Existing KOT, print, validation APIs
│   │   ├── doctype/                    # Existing 30+ doctypes
│   │   ├── hooks/                      # Existing doc event handlers
│   │   └── report/                     # Existing 14 reports
│   ├── ury_pos/                        # URY POS module (existing — staff APIs)
│   │   └── api.py                      # Existing staff API (refactored/DRYed)
│   ├── ury_customer/                   # NEW — Customer-facing module
│   │   ├── api.py                      # Public menu, customer order, status tracking
│   │   ├── auth.py                     # QR tokens, OTP auth, guest sessions
│   │   └── doctype/
│   │       ├── ury_customer_session/   # Guest/OTP session tracking
│   │       ├── ury_kiosk_device/       # Kiosk device registration
│   │       └── ury_fulfillment_log/    # Order state transitions
│   ├── ury_payment/                    # NEW — Payment gateway module
│   │   ├── api.py                      # Initiate, verify, webhook handlers
│   │   ├── providers/                  # Gateway implementations
│   │   │   ├── stripe.py
│   │   │   ├── razorpay.py
│   │   │   └── base.py                # Abstract provider interface
│   │   └── doctype/
│   │       └── ury_payment_gateway/    # Gateway configuration
│   ├── ury_whatsapp/                   # NEW — WhatsApp integration module
│   │   ├── api.py                      # Send order link, invoice, status
│   │   └── templates/                  # Default WhatsApp message templates
│   ├── www/                            # SPA entry points
│   │   ├── pos.html                    # Existing
│   │   ├── urypos.html                # Existing
│   │   ├── URYMosaic.html             # Existing
│   │   ├── table-order.html           # NEW
│   │   ├── customer-order.html        # NEW
│   │   └── kiosk.html                 # NEW
│   └── public/                         # Built frontend assets
│       ├── pos/                        # Existing POS v2 build
│       ├── urypos/                     # Existing POS v1 build
│       ├── URYMosaic/                  # Existing Mosaic build
│       ├── table-order/               # NEW build output
│       ├── customer-order/            # NEW build output
│       └── kiosk/                     # NEW build output
│
├── packages/                           # NEW — Shared npm packages
│   ├── ui/                             # @ury/ui — design system
│   │   ├── package.json
│   │   └── src/
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       └── index.ts
│   ├── api-client/                     # @ury/api-client — Frappe SDK wrapper
│   │   ├── package.json
│   │   └── src/
│   │       ├── client.ts               # FrappeApp singleton
│   │       ├── menu.ts                 # Typed menu API
│   │       ├── order.ts                # Typed order API
│   │       ├── payment.ts              # Typed payment API
│   │       └── auth.ts                 # Auth helpers
│   ├── cart/                           # @ury/cart — Cart state management
│   │   ├── package.json
│   │   └── src/
│   │       ├── cart-store.ts           # Zustand cart slice
│   │       ├── types.ts                # CartItem, CartTotals
│   │       └── utils.ts                # Price calc, unique ID gen
│   ├── menu/                           # @ury/menu — Menu components + logic
│   │   ├── package.json
│   │   └── src/
│   │       ├── MenuCard.tsx
│   │       ├── MenuList.tsx
│   │       ├── CategoryFilter.tsx
│   │       └── hooks.ts                # useMenu, useCategories
│   ├── order/                          # @ury/order — Order lifecycle
│   │   ├── package.json
│   │   └── src/
│   │       ├── order-store.ts
│   │       ├── status-tracker.tsx
│   │       └── types.ts
│   ├── payment/                        # @ury/payment — Payment UI
│   │   ├── package.json
│   │   └── src/
│   │       ├── PaymentSheet.tsx
│   │       ├── gateway-selector.tsx
│   │       └── hooks.ts
│   ├── auth/                           # @ury/auth — Auth for all apps
│   │   ├── package.json
│   │   └── src/
│   │       ├── staff-auth.ts
│   │       ├── customer-auth.ts
│   │       ├── token-auth.ts
│   │       └── guards.tsx
│   └── config/                         # @ury/config — Shared constants
│       ├── package.json
│       └── src/
│           ├── doctypes.ts
│           ├── order-types.ts
│           └── env.ts
│
├── apps/                               # Frontend apps (renamed from flat structure)
│   ├── pos/                            # Existing POS v2 (moved from /pos)
│   ├── table-order/                    # NEW — QR self-order app
│   ├── customer-order/                 # NEW — Online ordering app
│   ├── kiosk/                          # NEW — Kiosk app
│   ├── urypos/                         # Existing POS v1 (keep as-is)
│   └── mosaic/                         # Existing KDS (keep as-is)
│
├── package.json                        # Root — npm workspaces config
└── AGENTS.md                          # Developer guide
```

> **Justification**: This mirrors the existing pattern (multiple SPA frontends in one Frappe app) while adding package sharing via npm workspaces. The `ury/` Python backend gains new modules (`ury_customer`, `ury_payment`, `ury_whatsapp`) following Frappe's standard module pattern. No structural break from how URY already works.
