# KDS Vue 3 (URYMosaic) Frontend Architecture

## 1. Overview
URYMosaic is the Kitchen Display System (KDS) frontend built with Vue 3 and Vite. It serves as a real-time terminal for kitchen staff to view, manage, and complete Kitchen Order Tickets (KOTs) from the URY Frappe/ERPNext application.

## 2. Component Tree
The application features a lightweight component structure focused on the main KOT display interface:

- **`App.vue` (Root)**
  - **`Header.vue`**: Top navigation bar with the application logo and a manual refresh KOT button.
  - **`kot.vue`**: The core component that handles fetching KOTs, displaying them in a Masonry layout grid, real-time socket updates, and interactions (Serve, Confirm Cancellation).
- **Views/Routes**:
  - **`Login.vue`**: Authentication screen to capture credentials.
  - **`Home.vue`**: Default secondary screen with a Frappe ping diagnostic.
  - **`kot.vue`**: Mapped to the `/` root route as the primary view.

## 3. Real-time Flow (Socket.IO)
The real-time synchronization is handled directly within `kot.vue` to dynamically reflect incoming orders from the Frappe backend:

1. **Initialization**: On load, `fetchAndSetSiteName()` calls the backend to determine the current Frappe site (`window.globalSiteName`).
2. **Socket Connection**: `socket.io-client` connects to the specific site namespace (`${url}/${site}`).
3. **Channel Subscription**: The specific socket channel is dynamically formulated as `kot_update_${this.branch}_${this.production}` based on the station's configuration retrieved from the initial `kot_list` API call.
4. **Data Handling**:
   - When an event is received on the subscribed channel, it checks if an audio alert is enabled and plays a notification sound.
   - The new KOT document (`doc.kot`) is unshifted into the active KOTs array (`this.kot`).
   - The UI Masonry layout dynamically recalculates and renders the new block.
   - A timer function (`updateTimeRemaining()`) runs every 60 seconds to refresh the elapsed time and trigger color changes if limits (`kot_alert_time`) are breached.

## 4. API Calls
Interactions with the backend are executed using the `frappe-js-sdk` (`FrappeApp.call`):

- **Initialization & Configuration**:
  - `GET /api/method/ury.ury.api.ury_kot_display.get_site_name`: Fetches the active site name for socket routing.
  - `GET ury.ury.api.ury_kot_display.kot_list`: Retrieves the initial bulk data of KOTs, branch info, station production settings, audio alert flags, and timer constraints.
- **Order Management Actions (`POST`)**:
  - `ury.ury.api.ury_kot_display.serve_kot`: Sent when kitchen staff clicks "Serve" to mark an order as complete.
  - `ury.ury.api.ury_kot_display.confirm_cancel_kot`: Sent when confirming an order that has been marked as partially or fully cancelled.
  - `ury.ury.api.ury_kot_notification.order_delay_notification`: Automatically triggered by the frontend client when the internal timer indicates an order has breached its preparation time limit.

## 5. Authentication & Authorization
- **SDK Integration**: Utilizes `frappe.auth()` from the `frappe-js-sdk` to check the current user session securely against the Frappe backend.
- **Route Guards**: In `main.js`, Vue Router uses `beforeEach` guards to intercept navigation. If a route requires authentication and the user is not logged in, they are redirected to `Login.vue`.
- **In-Component Verification**: Inside `kot.vue`, the `mounted()` lifecycle hook initiates an authentication check (`getLoggedInUser()`). If authentication fails or the session expires, a modal overlay triggers (`showModal = true`), blocking interaction and prompting the user to redirect to the login page.
