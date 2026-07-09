# URY Backend API Reference

This document outlines the whitelisted backend API endpoints available in the URY application.

## 1. POS Module (`ury.ury_pos.api`)

### `ury.ury_pos.api.getRestaurantMenu`
- **Method**: GET/POST
- **Parameters**: 
  - `pos_profile` (str): POS Profile name.
  - `room` (str, default `None`): Room name.
  - `order_type` (str, default `None`): Order type.
- **Returns**: Dictionary containing `items` (list of menu items with details), `modified_time`, and `name` (menu name).
- **Purpose**: Fetches the active menu for a specific POS profile, room, or order type. Called by the frontend POS to render the menu.
- **Permissions**: Checks `pos_profile.role_allowed_for_billing` against `frappe.get_roles()`.
- **Logic**: Queries `URY Restaurant`, `Menu for Room`, or `Order Type Menu` to resolve the active menu, then fetches `URY Menu Item` and associated item images.

### `ury.ury_pos.api.getMenuCourses`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: List of dictionaries containing `name` and translated `label`.
- **Purpose**: Retrieves all available menu courses.
- **Permissions**: None explicit.
- **Logic**: Queries `URY Menu Course`.

### `ury.ury_pos.api.getBranch`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: Branch name (str).
- **Purpose**: Gets the branch associated with the current user session.
- **Permissions**: Requires valid session user.
- **Logic**: Joins `URY User` and `Branch` tables. Throws exception if user is not associated with a branch.

### `ury.ury_pos.api.getBranchRoom`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: List containing a dictionary with `name` (room) and `branch`.
- **Purpose**: Fetches the branch and room assigned to the current user.
- **Permissions**: Requires valid session user.
- **Logic**: Joins `URY User` and `Branch` tables. Throws exception if missing.

### `ury.ury_pos.api.getRoom`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: List of dictionaries containing `name` (room) and `branch`.
- **Purpose**: Retrieves all branch and room assignments for the current user.
- **Permissions**: Requires valid session user.
- **Logic**: Joins `URY User` and `Branch` tables.

### `ury.ury_pos.api.getModeOfPayment`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: List of dictionaries containing `mode_of_payment` and `opening_amount` (0).
- **Purpose**: Retrieves allowed payment modes for the current POS Profile.
- **Permissions**: None explicit.
- **Logic**: Fetches `POS Profile` linked to the user's branch and extracts `payments` child table.

### `ury.ury_pos.api.getInvoiceForCashier`
- **Method**: GET/POST
- **Parameters**: 
  - `status` (str): Status to filter (e.g., Draft, Unbilled, Recently Paid).
  - `cashier` (str): Cashier username.
  - `limit` (int): Pagination limit.
  - `limit_start` (int): Pagination offset.
- **Returns**: Dictionary with `data` (list of invoices) and `next` (boolean indicating more records).
- **Purpose**: Fetches POS invoices assigned to a specific cashier. Used by frontend to render invoice lists.
- **Permissions**: None explicit.
- **Logic**: Custom SQL queries on `POS Invoice` filtered by branch, status, cashier, and table assignment.

### `ury.ury_pos.api.getPosInvoice`
- **Method**: GET/POST
- **Parameters**: 
  - `status` (str): Status filter.
  - `limit` (int): Pagination limit.
  - `limit_start` (int): Pagination offset.
- **Returns**: Dictionary with `data` (list of invoices) and `next` (boolean).
- **Purpose**: Fetches POS invoices for the branch regardless of cashier.
- **Permissions**: None explicit.
- **Logic**: Custom SQL queries on `POS Invoice` based on branch and status.

### `ury.ury_pos.api.searchPosInvoice`
- **Method**: GET/POST
- **Parameters**: 
  - `query` (str): Search term.
  - `status` (str): Status filter.
- **Returns**: Dictionary with `data` (list of invoices) and `next` (boolean).
- **Purpose**: Searches POS invoices by name, customer, or mobile number.
- **Permissions**: None explicit.
- **Logic**: Uses `frappe.get_all` with `or_filters`.

### `ury.ury_pos.api.get_select_field_options`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: List of dictionaries with `name`.
- **Purpose**: Fetches options for the `order_type` field in `POS Invoice`.
- **Permissions**: None explicit.
- **Logic**: Retrieves field metadata for `order_type`.

### `ury.ury_pos.api.fav_items`
- **Method**: GET/POST
- **Parameters**: 
  - `customer` (str): Customer name.
- **Returns**: List of dictionaries containing `item_name` and total `qty`.
- **Purpose**: Aggregates historically ordered items for a customer.
- **Permissions**: None explicit.
- **Logic**: Iterates over customer's past `POS Invoice` records and sums item quantities.

### `ury.ury_pos.api.getCashier`
- **Method**: GET/POST
- **Parameters**: 
  - `room` (str): Room name.
- **Returns**: Cashier username (str) or `None`.
- **Purpose**: Finds the active cashier for a specific room.
- **Permissions**: None explicit.
- **Logic**: Queries `POS Opening Entry` linked to the specified room.

### `ury.ury_pos.api.getPosProfile`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: Dictionary containing detailed POS profile configuration (printers, limits, discounts, etc.).
- **Purpose**: Fetches initialization parameters for the POS frontend.
- **Permissions**: None explicit.
- **Logic**: Retrieves branch POS Profile, Global Defaults, and active POS Opening Entry to determine cashier and settings.

### `ury.ury_pos.api.getPosInvoiceItems`
- **Method**: GET/POST
- **Parameters**: 
  - `invoice` (str): Invoice ID.
- **Returns**: Tuple containing list of item details and list of tax details.
- **Purpose**: Fetches line items and taxes for a specific invoice.
- **Permissions**: None explicit.
- **Logic**: Queries `POS Invoice` and extracts child tables `items` and `taxes`.

### `ury.ury_pos.api.posOpening`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: Integer flag (0 if open, 1 if missing).
- **Purpose**: Validates if an active POS Opening Entry exists for the branch.
- **Permissions**: None explicit.
- **Logic**: Checks `POS Opening Entry` status. Throws message if none exists.

### `ury.ury_pos.api.getAggregator`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: List of aggregator customer names.
- **Purpose**: Fetches configured delivery aggregators for the branch.
- **Permissions**: None explicit.
- **Logic**: Queries `Aggregator Settings` for the branch.

### `ury.ury_pos.api.getAggregatorItem`
- **Method**: GET/POST
- **Parameters**: 
  - `aggregator` (str): Aggregator name.
- **Returns**: List of items with specific pricing.
- **Purpose**: Fetches items and prices specific to an aggregator.
- **Permissions**: None explicit.
- **Logic**: Resolves price list from `Aggregator Settings`, then fetches `Item Price` records.

### `ury.ury_pos.api.getAggregatorMOP`
- **Method**: GET/POST
- **Parameters**: 
  - `aggregator` (str): Aggregator name.
- **Returns**: List containing the aggregator's designated mode of payment.
- **Purpose**: Retrieves payment mode for an aggregator.
- **Permissions**: None explicit.
- **Logic**: Queries `Aggregator Settings`.

### `ury.ury_pos.api.create_customer`
- **Method**: GET/POST
- **Parameters**: 
  - `customer_name` (str): Name.
  - `mobile_number` (str): Phone number.
  - `customer_group` (str, default `Individual`).
  - `territory` (str, default `India`).
- **Returns**: Dictionary with status, message, and customer details.
- **Purpose**: Creates a new customer record from the POS.
- **Permissions**: Ignored (`ignore_permissions=True`).
- **Logic**: Validates phone number, creates `Customer` doc, and commits.

### `ury.ury_pos.api.validate_pos_close`
- **Method**: GET/POST
- **Parameters**: 
  - `pos_profile` (str): POS Profile name.
- **Returns**: String ("Success" or "Failed").
- **Purpose**: Validates if the previous day's POS session was properly closed.
- **Permissions**: None explicit.
- **Logic**: Checks if `custom_daily_pos_close` is enabled, calculates start of day (5 AM), and checks for unclosed entries from the previous day.

## 2. General API Modules (`ury.api.*`)

### `ury.api.button_permission.cancel_check`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: Boolean indicating cancel permission.
- **Purpose**: Verifies if current user can cancel POS Invoices.
- **Permissions**: Uses `frappe.permissions.has_permission`.
- **Logic**: Evaluates permissions for "POS Invoice".

### `ury.api.pos_extend.overrided_past_order_list`
- **Method**: GET/POST
- **Parameters**: 
  - `search_term` (str): Search input.
  - `status` (str): Order status filter.
  - `limit` (int, default `20`).
- **Returns**: List of POS Invoices.
- **Purpose**: Fetches historical orders, validating branch and room access unless Administrator.
- **Permissions**: None explicit.
- **Logic**: Sanitizes search term, fetches branch/room if not Admin, and queries `POS Invoice`.

### `ury.api.ury_kot_display.serve_kot`
- **Method**: GET/POST
- **Parameters**: 
  - `name` (str): KOT ID.
  - `time` (str): Service time string.
- **Returns**: None.
- **Purpose**: Marks a Kitchen Order Ticket (KOT) as "Served" and calculates production time.
- **Permissions**: None explicit.
- **Logic**: Updates `URY KOT` record.

### `ury.api.ury_kot_display.confirm_cancel_kot`
- **Method**: GET/POST
- **Parameters**: 
  - `name` (str): KOT ID.
  - `user` (str): Username verifying the cancellation.
- **Returns**: None.
- **Purpose**: Confirms a cancelled KOT.
- **Permissions**: None explicit.
- **Logic**: Updates `verified` and `verified_by` fields in `URY KOT`.

### `ury.api.ury_kot_display.get_site_name`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: Dictionary with `site_name`.
- **Purpose**: Retrieves Frappe site name.
- **Permissions**: Allowed for guests (`allow_guest=True`).
- **Logic**: Reads `frappe.local.site`.

### `ury.api.ury_kot_display.kot_list`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: Dictionary with active KOT list, branch details, and alert configuration.
- **Purpose**: Feeds the Kitchen Display System (KDS) with active orders.
- **Permissions**: None explicit.
- **Logic**: Queries unverified `URY KOT` records created in the last 3 hours with "Ready For Prepare" status. Filters based on production unit settings.

### `ury.api.ury_kot_display.served_kot_list`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: Dictionary with served KOT list.
- **Purpose**: Feeds the KDS with recently served orders.
- **Permissions**: None explicit.
- **Logic**: Queries unverified `URY KOT` records created in the last 3 hours with "Served" status. Filters based on production unit settings.

### `ury.api.ury_kot_generate.kot_execute`
- **Method**: GET/POST
- **Parameters**: 
  - `invoice_id` (str): Invoice ID.
  - `customer` (str): Customer name.
  - `restaurant_table` (str, default `None`).
  - `current_items` (list/json, default `[]`).
  - `previous_items` (list/json, default `[]`).
  - `comments` (str, default `None`).
- **Returns**: None.
- **Purpose**: Generates or updates KOTs based on cart modifications. Called upon order submission.
- **Permissions**: None explicit.
- **Logic**: Compares previous and current items. Generates "New Order" KOTs for additions and "Partially cancelled" KOTs for removals, routing them to appropriate production units.

### `ury.api.ury_kot_notification.order_delay_notification`
- **Method**: GET/POST
- **Parameters**: 
  - `id` (str): KOT ID.
- **Returns**: None.
- **Purpose**: Sends internal system alerts when an order is delayed.
- **Permissions**: None explicit.
- **Logic**: Looks up `URY Notification Recipient` configured in POS Profile, resolves users by role, and creates `Notification Log` entries.

### `ury.api.ury_kot_reprint.reprint_kot`
- **Method**: GET/POST
- **Parameters**: 
  - `invoice_number` (str): Invoice ID.
- **Returns**: String ("Success").
- **Purpose**: Reprints a Kitchen Order Ticket.
- **Permissions**: None explicit.
- **Logic**: Validates reprint permissions in POS Profile, determines table vs parcel printer, and triggers `print_by_server`.

### `ury.api.ury_print.network_printing`
- **Method**: GET/POST
- **Parameters**: 
  - `doctype` (str)
  - `name` (str)
  - `printer_setting` (str)
  - `print_format` (str, default `None`)
  - `doc` (str, default `None`)
  - `no_letterhead` (int, default `0`)
  - `file_path` (str, default `None`)
- **Returns**: String status message.
- **Purpose**: Renders document to PDF and sends it directly to a CUPS network printer.
- **Permissions**: None explicit.
- **Logic**: Generates PDF using `frappe.get_print`, connects to CUPS via `Network Printer Settings`, prints file, and updates invoice/table print statuses.

### `ury.api.ury_print.select_network_printer`
- **Method**: GET/POST
- **Parameters**: 
  - `pos_profile` (str)
  - `invoice_id` (str)
- **Returns**: String status message.
- **Purpose**: Determines the correct network printer (room vs general) and initiates printing.
- **Permissions**: None explicit.
- **Logic**: Resolves printer configuration from `URY Printer Settings` and calls `network_printing`.

### `ury.api.ury_print.qz_print_update`
- **Method**: GET/POST
- **Parameters**: 
  - `invoice` (str): Invoice ID.
- **Returns**: Dictionary with `status` ("Success" or "Failure").
- **Purpose**: Acknowledges successful printing via QZ Tray.
- **Permissions**: None explicit.
- **Logic**: Updates `invoice_printed` to 1 and frees the `restaurant_table`.

### `ury.api.ury_print.print_pos_page`
- **Method**: GET/POST
- **Parameters**: 
  - `doctype` (str)
  - `name` (str)
  - `print_format` (str)
- **Returns**: None.
- **Purpose**: Triggers a realtime event for browser-based printing.
- **Permissions**: None explicit.
- **Logic**: Publishes data to a socket.io channel (`print_{branch}`) and updates invoice print status.

### `ury.api.ury_print.qz_certificate`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: String (QZ Certificate).
- **Purpose**: Retrieves QZ Tray public certificate from site config.
- **Permissions**: None explicit.
- **Logic**: Reads `qz_cert` from site config.

### `ury.api.ury_print.signature_promise`
- **Method**: GET/POST
- **Parameters**: None
- **Returns**: String (QZ Private Key).
- **Purpose**: Retrieves QZ Tray private key for signing requests.
- **Permissions**: None explicit.
- **Logic**: Reads `qz_private_key` from site config.
