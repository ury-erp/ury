# React POS v2 Architecture

## Overview
React POS v2 is the modern point-of-sale frontend application for URY. It is built using React, TypeScript, and Vite. State management is handled through Zustand, routing through React Router, and backend communication via `frappe-js-sdk`.

## Component Tree
The application structure is defined in `App.tsx` and wraps the core routes with global providers and guards.

### Core Providers and Guards
- `ToastProvider`: UI notifications.
- `ScreenSizeProvider`: Manages responsive screen sizes.
- `AuthGuard`: Secures access and validates permissions and profiles.
- `POSOpeningProvider`: Validates the state of the POS shift (opening/closing).

### Routing Structure
- `Router (basename="/pos")`
  - `Header`
  - Routes:
    - `/`: `POS` (Main point of sale view)
    - `/orders`: `Orders` (Order management and history)
    - `/table`: `Table` (Table layout and management)
  - `Footer`

### Key UI Components
- `Header.tsx` / `Footer.tsx`: Global navigation and status.
- `OrderPanel.tsx`: Sidebar for managing the current cart/order.
- `LayoutView.tsx`: Main layout structure for the POS screens.
- `MenuCard.tsx` / `MenuList.tsx`: Product display and selection.
- `ProductDialog.tsx`: Modal for product variants and addons.
- `PaymentDialog.tsx`: Modal for processing payments.

## Zustand Stores
State management is decoupled into specialized Zustand stores.

### Root Store (`root-store.ts`)
Combines multiple functional slices into a single unified store:
1. **Auth Slice (`auth-slice.ts`)**: Manages the logged-in user, roles, and global authentication state.
2. **Config Slice (`config-slice.ts`)**: Manages the POS profile, role-based access control, and base configuration.
3. **Orders Slice (`orders-slice.ts`)**: Handles fetching, searching, and managing past POS Invoices and their states (Draft, Paid, Return, etc.).

### POS Store (`pos-store.ts`)
A dedicated, large store for the active point-of-sale operations.
- **Cart Management**: Add/remove items, update quantities, calculate totals and taxes.
- **Menu Management**: Loading categories, items, and aggregators.
- **Order State**: Managing the currently selected table, customer, order type, and payment processing.
- **Initialization**: Bootstraps the necessary reference data (profiles, currencies, payment modes) required for an active POS session.

## API Facades (`lib/`)
The application abstracts all Frappe backend communication through specialized API facades utilizing `frappe-js-sdk` (`frappe-sdk.ts`).

- `frappe-sdk.ts`: Initializes the SDK and exports `call`, `db`, and `auth` singletons.
- `auth-api.ts`: Wraps SDK auth functions to get the logged-in user and fetch user roles.
- `pos-profile-api.ts`: Fetches the complex POS profile configurations.
- `menu-api.ts` / `menu-course-api.ts`: Fetches menu items, categories, and aggregator menus.
- `order-api.ts` / `invoice-api.ts`: Handles table orders and historical invoice fetching/updating.
- `payment-api.ts`: Retrieves valid payment modes for the profile.
- `pos-opening-api.ts`: Handles validation of shift opening and closing.

## Authentication and Initialization Flow
The application employs a strict, sequential boot process to ensure the environment is secure and correctly configured before rendering the UI.

1. **Authentication Check (`AuthGuard`)**:
   - `checkAuth()` queries `auth-api.ts` for the active session.
   - If missing, the user is redirected to the login page.
2. **Profile and Configuration Loading (`AuthGuard`)**:
   - Upon successful authentication, `fetchPosProfile()` retrieves the POS configuration and allowed roles.
   - Access is verified against the user's assigned roles. Disallowed users receive an error screen.
3. **Shift Validation (`POSOpeningProvider`)**:
   - Checks if a POS shift is currently opened via `checkPOSOpening()`.
   - Validates if the previous shift requires closing via `validatePOSClose()`.
   - Blocks the UI with a `POSOpeningDialog` if shift actions are required.
4. **App Initialization (`App.tsx`)**:
   - `initializeApp()` in `pos-store.ts` runs asynchronously to load menu items, categories, and payment modes.
   - Finally, the router resolves and renders the target page.

### Detailed Auth Flow (`AuthGuard` & `POSOpeningProvider`)
- **Session Caching**: The application does not manually cache the session but relies on Frappe SDK's cookie-based authentication (`auth.getLoggedInUser()`). `AuthGuard` triggers `checkAuth()` on mount.
- **Role Validation**: After fetching the user, `AuthGuard` fetches the user's `posProfile` and verifies if the user has the `role_allowed_for_billing`. If not, it displays a "Permission Required" block with a "Recheck Permissions" button to manually retry.
- **POS Shift Validation**: `POSOpeningProvider` checks `checkPOSOpening()`. If a shift isn't open, it prompts opening one. If `custom_daily_pos_close` is enabled in the profile, it calls `validatePOSClose()` to ensure previous shifts are closed. Any validation failure renders `POSOpeningDialog`.

## API Facades (`pos/src/lib/`) Details
The application encapsulates Frappe network interactions in 17 specific facade files. Key facades include:
- `auth-api.ts`: `getLoggedUser(): Promise<string | null>`, `getUserRoles(email): Promise<{ roles: string[]; full_name: string }>`, `logout()`.
- `order-api.ts`: 
  - `getTableOrder(table_no)`: Fetches active invoice for a table.
  - `syncOrder(data: SyncOrderRequest)`: Submits the order via `ury_order.sync_order`.
- `table-api.ts`: `getRooms(branch)`, `getTableCount(room)`, `getTables(room)`, and `updateTableLayout(name, data)`. Interacts with `URY Room` and `URY Table` doctypes.
- `invoice-api.ts`: `getPOSInvoices(...)`, `getPOSInvoiceItems(invoiceId)`, `updateInvoiceStatus(invoice, status)`. Integrates with `getPosInvoice` and `updatePosInvoiceStatus` API methods. Also includes QZ Tray network printing methods.
- `pos-opening-api.ts`: `checkPOSOpening()` and `validatePOSClose(posProfile)`.

## Core UI Flows

### POS Checkout (`OrderPanel.tsx`)
- Displays active cart items, calculates totals, and manages quantity updates.
- Validates pre-requisites before submission (e.g., table selected for Dine-In, customer selected).
- Calls `syncOrder()` via `order-api.ts` with the constructed payload (items, table, room, customer, payment mode).
- On success, resets the order state via `resetOrderState()` and displays a toast.

### Table Selection (`TableSelectionDialog.tsx`)
- Fetches rooms based on the `posProfile.branch` and caches them in `sessionStorage` (`ury_rooms_${branch}`).
- Fetches tables for the selected room and caches them in component state (`tablesCache`).
- Displays tables with visual indicators for occupied status (amber color) and shape (`TableShapeIcon`). 
- On selection, updates the POS store and closes the dialog.

### Payment Flow (`PaymentDialog.tsx`)
- Handles split payments and percentage discounts.
- Tracks entered amounts per payment mode and calculates remaining balances automatically on input focus.
- Validates the total matches the grand total (with rounding adjustments).
- Submits the invoice via `make_invoice` backend method, updating the POS invoice to `Paid` or processing the split structure.

### Product Variants and Addons (`ProductDialog.tsx`)
- Retrieves the full `Item` document from Frappe DB to load detailed variant and addon configurations (`custom_pos_item_variants`, `custom_pos_add_on_items`).
- Manages local state for selected addons and numeric quantity.
- Dynamically calculates the final item price based on base price plus selected addon prices.
- When added to the order, the main item and each addon are added as separate line items in the cart to ensure proper accounting in Frappe.
