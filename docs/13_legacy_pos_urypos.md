# 13. Legacy POS Vue 3 (urypos) Frontend Architecture

This document outlines the architecture, component structure, state management, and routing for the Legacy POS application (`urypos`).

## 1. Overview
The Legacy POS frontend is a Single Page Application (SPA) built using **Vue 3** and **Pinia** for state management. It communicates with the Frappe backend via the `frappe-js-sdk`.

### Tech Stack
- **Framework:** Vue 3
- **State Management:** Pinia
- **Routing:** Vue Router
- **API Client:** `frappe-js-sdk` and `axios`

## 2. Component Tree & Structure
The main application entry point is `src/main.js`, which mounts the Vue application onto `#app` and registers global plugins (Pinia and Vue Router).

### Key Components
- **`App.vue`**: Root component of the application.
- **Views & Main Components**:
  - `Login.vue` (`/login`): User authentication.
  - `Table.vue` (`/Table`): Table selection and management for dine-in orders.
  - `Customer.vue` (`/Customer`): Customer information collection.
  - `Menu.vue` (`/Menu`): Menu item selection and display.
  - `Cart.vue` (`/Cart`): Shopping cart management.
  - `recentOrder.vue` (`/recentOrder`): Display of past/recent orders.
  - `posOpening.vue` (`/PosOpen`): POS opening entry.
  - `posClosing.vue` (`/PosClose`): POS closing entry.
- **Shared Components**:
  - `Header.vue`, `bottomTabs.vue`: Navigation and layout components.
  - `NotificationModal.vue`: Global alert and notification dialogs.

## 3. Routing
Routing is handled by Vue Router in `src/router/index.js`. A global navigation guard ensures unauthenticated users are redirected to the Login page.

**Routes Map:**
- `/` or `/Table`: `Table.vue`
- `/Customer`: `Customer.vue`
- `/Menu`: `Menu.vue`
- `/Cart`: `Cart.vue`
- `/recentOrder`: `recentOrder.vue`
- `/PosOpen`: `posOpening.vue`
- `/PosClose`: `posClosing.vue`
- Auth routes defined in `src/router/auth.js`.

## 4. State Management (Pinia Stores)
Application state is highly modularized across several Pinia stores located in `src/stores/`.

### 4.1. `Auth.js` (`useAuthStore`)
Manages user authentication, session state, permissions, and POS open/close checks.
- **State**: `userId`, `userName`, `userRole`, `cashier`, `isPosOpen`, `hasAccess`.
- **Actions**: `login()`, `fetchUserDetails()`, `fetchUserRole()`, `logOut()`, `isPosOpenChecking()`.

### 4.2. `invoiceData.js` (`useInvoiceDataStore`)
Central store for current order lifecycle, invoice creation, and printing operations.
- **State**: `posProfile`, `waiter`, `cashier`, `company`, `grandTotal`, `invoiceNumber`, `modeOfPaymentList`.
- **Actions**:
  - `fetchInvoiceDetails()`: Gets active POS profile configuration.
  - `invoiceCreation()`: Submits the order to the backend (`ury.ury.doctype.ury_order.ury_order.sync_order`).
  - `printFunction()`: Handles QZ tray printing, network printing, or socket printing.
  - `cancelInvoice()`: Cancels an existing order.

### 4.3. `Menu.js` (`useMenuStore`)
Handles the menu items, cart operations, and category filtering.
- **State**: `items`, `cart`, `course`, `orderType`, `aggregatorList`.
- **Actions**:
  - `fetchItems()`: Fetches the restaurant menu based on the active room and pos profile.
  - `addToCart(item)`, `incrementItemQuantity(item)`, `decrementItemQuantity(item)`.

### 4.4. `Table.js` (`useTableStore`)
Manages restaurant layout, table selection, and dine-in flow.
- **State**: `tables`, `selectedTable`, `takeAwayTable`, `rooms`, `selectedRoom`.
- **Actions**: 
  - `fetchRoom()`, `fetchTable()`: Loads available rooms and tables.
  - `addToSelectedTables(table)`: Sets active table and fetches previous order history if the table is occupied.
  - `tableTransfer()`, `captianTransfer()`: Modifies table assignments.

### 4.5. `posOpening.js` (`posOpening`)
Manages the POS shift opening process and balances.
- **State**: `startDate`, `postingDate`, `posOpenEntryName`.
- **Actions**: `savePosOpening()`, `sumbitPosOpening()`.

## 5. API Calls & Integration
The frontend interacts with the backend using the `frappe-js-sdk` wrapped in `src/stores/frappeSdk.js`.

**Key Frappe Call Endpoints:**
- **Auth**: `auth.loginWithUsernamePassword()`, `auth.getLoggedInUser()`
- **Order Syncing**: `ury.ury.doctype.ury_order.ury_order.sync_order`
- **Menu Fetching**: `ury.ury_pos.api.getRestaurantMenu`
- **Table Data**: `frappe.db().getDocList('URY Table', ...)`
- **Printing**: `ury.ury.api.ury_print.network_printing`, `ury.ury.api.ury_print.qz_print_update`

The wrapper configuration sets up the client to talk to the local Frappe instance based on `window.location.hostname`.
