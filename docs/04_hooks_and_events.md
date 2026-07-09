# URY Hooks, Events, and Public JS Overrides

## Overview
This document outlines the configurations, hooks, document events, and frontend JavaScript overrides defined in `hooks.py` and the `public/js/` directory for the URY Frappe application. URY is built on top of ERPNext and customizes the POS experience extensively.

## `hooks.py`

### Application Configuration
- **App Name**: `ury`
- **Title**: `URY`
- **Publisher**: Tridz Technologies Pvt. Ltd
- **Description**: A Complete Restaurant Order Taking Software
- **Dependencies**: `erpnext`
- **Desk Screen**: Adds URY to the apps screen with route `/app/ury` and a custom permission check.

### Routing Rules
- `/pos/<path:app_path>` -> `pos`
- `/urypos/<path:app_path>` -> `urypos`
- `/URYMosaic/<path:app_path>` -> `URYMosaic`

### Installation & Uninstallation
- **Before Uninstall**: Triggers `ury.uninstall.uninstall`

### Document Events (`doc_events`)
The application hooks into various standard and custom DocTypes to manage order flow, POS profiles, and KOT (Kitchen Order Ticket) generation:

- **POS Invoice**:
  - `before_insert`: Validates and prepares the invoice.
  - `validate`: General validation logic.
  - `after_insert`: Sets order numbers (`ury.ury.api.ury_kot_order_number.set_order_number`).
  - `before_submit`: Validations right before submission.
  - `on_cancel` & `on_trash`: Hooks into trash logic.
- **POS Profile**:
  - `validate`: Validates POS Profile configuration.
- **Sales Invoice**:
  - `before_insert`: Modifies the document before insert.
  - `on_update`: Triggers on updates.
- **Item**:
  - `validate`: Validates item parameters.
- **POS Opening Entry**:
  - `validate`: Sets cashier room.
  - `before_save`: Additional save logic.
  - `before_insert`: Sets the last invoice reference.
- **POS Closing Entry**:
  - `validate` & `before_save`: Closing logic and validation.
- **URY Menu Course**:
  - `validate`: Validates priority via `validate_priority`.

### Scheduled Tasks
- **Cron**: Runs `ury.ury.api.ury_kot_validation.kotValidationThread` every minute (`* * * * *`) for KOT validation.

### Fixtures
Includes fixtures to export configurations automatically:
- **Custom Field**: Extensive list of custom fields added to ERPNext DocTypes like `POS Invoice`, `Sales Invoice`, `POS Profile`, `POS Opening Entry`, `Branch`, `Employee`, and `Printer Settings`.
- **Property Setter**: Modifies labels (e.g., `closing_amount`).
- **Role**: Exports any role matching `URY %`.
- **Client Script**: Includes custom client-side scripts.

---

## Public JS Overrides (`public/js/`)

### 1. `pos_extend.js`
Overrides standard ERPNext Point of Sale classes to inject restaurant-specific features:
- **PastOrderList**: Adds custom filtering (search term and status) and alters the UI for past orders.
- **Controller**: Replaces the default menu, adding a strict "Cancel Order" capability with validation against billed or table orders.
- **PastOrderSummary**: Adjusts behavior on edit, return, new order, and binds comment entry triggers.
- **ItemCart**: Redesigns the POS cart layout, adding specialized buttons for comments, checkout, and total calculation.

### 2. `pos_print.js`
Manages receipt printing for `POS Invoice`:
- Validates that customer data is present before saving.
- Provides specialized hardware printing integration via **QZ Tray**.
- Resolves certificate and private key via Frappe API for secure, silent receipt printing.
- Falls back to network printing or standard browser printing depending on the `POS Profile` settings.

### 3. `quick_entry.js`
Overrides the `CustomerQuickEntryForm`:
- Reduces the Quick Entry dialog for Customers to bare essentials: Customer Name, Mobile Number, Customer Group, and Territory.

### 4. `restrict_qty_edit_pos.js`
Security and strictness controller for POS operations:
- Checks the `POS Profile` for the `remove_items` setting.
- If item removal is disallowed and the invoice has already been printed (especially for table orders), this script disables quantity editing and item deletion on the POS interface to prevent fraud or misbilling.

### 5. `sign-message.js`
Companion file for QZ Tray integration:
- Uses `jsrsasign` to securely sign requests.
- Fetches the private key dynamically via `ury_print.signature_promise` API to authorize raw hardware printing commands.

### 6. `ury_pos_kot.js`
Kitchen Order Ticket (KOT) automation:
- Hooks onto the `after_save` event of the `POS Invoice`.
- Computes differences between previous items and current items in the cart.
- Sends item deltas and order comments to `ury.ury.api.ury_kot_generate.kot_execute` for kitchen printing or display.

### 7. Libraries
- `jsrsasign-all-min.js`: Cryptographic library used by `sign-message.js`.
- `qz-tray.js`: Client library for direct hardware communication (receipt printers).


# Hooks and Events Part 2

This document details the hook functions defined in the `ury/hooks/` directory for the URY Frappe app. 

## 1. `ury_item.py`

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates validation for the Item document by calling `update_menu_item` and `update_variants_add_on`.
- **Side Effects**: None directly.

### `update_menu_item(doc, event)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Finds all `URY Menu Item` records linked to the given item.
- **Side Effects**: Updates the `item_name` field of matching `URY Menu Item` records in the database.

### `update_variants_add_on(doc, event)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Validates that all items listed in `custom_pos_add_on_items` and `custom_pos_item_variants` exist in the `URY Menu` database.
- **Side Effects**: Throws a Frappe validation error if an item is not found.

## 2. `ury_pos_closing_entry.py`

### `before_save(doc, method)`
- **Trigger**: `before_save`
- **Description**: Triggers sub-POS closure checks before the closing entry is saved.
- **Side Effects**: None directly.

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Triggers calculation of closing amounts and validates the cashier role.
- **Side Effects**: None directly.

### `sub_pos_close_check(doc, method)`
- **Trigger**: `before_save` (via `before_save`)
- **Description**: In a multiple cashier setup, checks if there are open `POS Opening Entry` records for the sub-cashier.
- **Side Effects**: Throws a Frappe validation error if a sub-cashier's POS is still open.

### `calculate_closing_amount(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: For multiple cashier profiles, retrieves closing amounts from linked `Sub POS Closing Payment` records and computes total closing amounts across main and sub cashiers.
- **Side Effects**: Modifies `closing_amount` and `difference` fields within the `payment_reconciliation` child table in memory.

### `validate_cashier(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Ensures that sub-cashiers cannot make POS Closing Entries.
- **Side Effects**: Throws a Frappe error if a sub-cashier attempts the action.

## 3. `ury_pos_invoice.py`

### `before_insert(doc, method)`
- **Trigger**: `before_insert`
- **Description**: Orchestrates pre-insertion logic including naming, order type update, and existing order restriction.
- **Side Effects**: None directly.

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates validation logic for invoice details, customer, and price lists.
- **Side Effects**: None directly.

### `before_submit(doc, method)`
- **Trigger**: `before_submit`
- **Description**: Orchestrates pre-submission logic including time tracking, print validation, and UI reload events.
- **Side Effects**: None directly.

### `on_trash(doc, method)`
- **Trigger**: `on_trash`
- **Description**: Triggers cleanup logic for restaurant tables when an invoice is trashed.
- **Side Effects**: None directly.

### `validate_invoice(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Sets a fallback waiter if none is assigned. Checks if items were removed or quantities were reduced after the invoice was already printed (unless explicitly allowed).
- **Side Effects**: Throws a Frappe error if printed items are modified. Modifies `waiter` in memory.

### `validate_customer(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Ensures that a customer name is populated.
- **Side Effects**: Throws a Frappe error if the customer name is missing.

### `calculate_and_set_times(doc, method)`
- **Trigger**: `before_submit` (via `before_submit`)
- **Description**: Calculates the total time spent from document creation to submission.
- **Side Effects**: Modifies `arrived_time` and `total_spend_time` fields in memory.

### `validate_invoice_print(doc, method)`
- **Trigger**: `before_submit` (via `before_submit`)
- **Description**: Enforces that invoices associated with restaurant tables must be printed before submission.
- **Side Effects**: Throws a Frappe error if the invoice has not been printed.

### `table_status_delete(doc, method)`
- **Trigger**: `on_trash` (via `on_trash`)
- **Description**: Frees up the associated restaurant table.
- **Side Effects**: Updates the `URY Table` record in the database, setting `occupied` to 0 and clearing `latest_invoice_time`.

### `pos_invoice_naming(doc, method)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Dynamically assigns a naming series based on the restaurant's prefix configuration for dine-in or aggregator orders.
- **Side Effects**: Modifies the `naming_series` field in memory.

### `order_type_update(doc, method)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Determines and sets the order type (`Take Away` or `Dine In`) based on the table's configuration.
- **Side Effects**: Modifies the `order_type` field in memory.

### `ro_reload_submit(doc, method)`
- **Trigger**: `before_submit` (via `before_submit`)
- **Description**: Notifies connected clients to reload the restaurant order interface.
- **Side Effects**: Publishes a realtime socket event `reload_ro`.

### `validate_price_list(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Sets the appropriate price list based on the active menu, room assignments, or aggregator settings.
- **Side Effects**: Modifies the `selling_price_list` field in memory. Throws a Frappe error if an aggregator price list is missing.

### `restrict_existing_order(doc, event)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Verifies that the table does not already have an open, unprinted invoice.
- **Side Effects**: Throws a Frappe error if a conflict is found.

## 4. `ury_pos_opening_entry.py`

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates validation by setting the cashier room.
- **Side Effects**: None directly.

### `before_save(doc, method)`
- **Trigger**: `before_save`
- **Description**: Orchestrates pre-save checks and time tracking.
- **Side Effects**: None directly.

### `set_cashier_room(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Looks up the assigned room for the user at the given branch.
- **Side Effects**: Modifies `custom_room` and populates the `custom_rooms` child table in memory for multiple cashier setups.

### `set_current_time(doc, method)`
- **Trigger**: `before_save` (via `before_save`)
- **Description**: Sets the opening period start time to the current timestamp.
- **Side Effects**: Modifies the `period_start_date` field in memory.

### `main_pos_open_check(doc, method)`
- **Trigger**: `before_save` (via `before_save`)
- **Description**: For multiple cashier setups, verifies that the main cashier has an open POS before allowing sub-cashiers to open theirs.
- **Side Effects**: Throws a Frappe error if the main POS is closed.

## 5. `ury_pos_profile.py`

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates profile validation.
- **Side Effects**: None directly.

### `validate_bill_check(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Ensures that printer settings specify both a bill configuration and a target printer.
- **Side Effects**: Triggers a Frappe message (`msgprint`) if validation fails.

### `validate_cost_center(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Enforces cost center assignment.
- **Side Effects**: Throws a Frappe error if a cost center is omitted.

## 6. `ury_sales_invoice.py`

### `before_insert(doc, method)`
- **Trigger**: `before_insert`
- **Description**: Orchestrates pre-insert logic.
- **Side Effects**: None directly.

### `on_update(doc, method)`
- **Trigger**: `on_update`
- **Description**: Orchestrates update logic.
- **Side Effects**: None directly.

### `sales_invoice_naming(doc, method)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Constructs a custom naming series (prefixed with `SINV-`) for POS invoices based on aggregator configurations and restaurant profiles.
- **Side Effects**: Modifies the `naming_series` field in memory. Throws a Frappe error if the POS profile is invalid.



# Hooks and Events Part 2

This document details the hook functions defined in the `ury/hooks/` directory for the URY Frappe app. 

## 1. `ury_item.py`

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates validation for the Item document by calling `update_menu_item` and `update_variants_add_on`.
- **Side Effects**: None directly.

### `update_menu_item(doc, event)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Finds all `URY Menu Item` records linked to the given item.
- **Side Effects**: Updates the `item_name` field of matching `URY Menu Item` records in the database.

### `update_variants_add_on(doc, event)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Validates that all items listed in `custom_pos_add_on_items` and `custom_pos_item_variants` exist in the `URY Menu` database.
- **Side Effects**: Throws a Frappe validation error if an item is not found.

## 2. `ury_pos_closing_entry.py`

### `before_save(doc, method)`
- **Trigger**: `before_save`
- **Description**: Triggers sub-POS closure checks before the closing entry is saved.
- **Side Effects**: None directly.

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Triggers calculation of closing amounts and validates the cashier role.
- **Side Effects**: None directly.

### `sub_pos_close_check(doc, method)`
- **Trigger**: `before_save` (via `before_save`)
- **Description**: In a multiple cashier setup, checks if there are open `POS Opening Entry` records for the sub-cashier.
- **Side Effects**: Throws a Frappe validation error if a sub-cashier's POS is still open.

### `calculate_closing_amount(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: For multiple cashier profiles, retrieves closing amounts from linked `Sub POS Closing Payment` records and computes total closing amounts across main and sub cashiers.
- **Side Effects**: Modifies `closing_amount` and `difference` fields within the `payment_reconciliation` child table in memory.

### `validate_cashier(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Ensures that sub-cashiers cannot make POS Closing Entries.
- **Side Effects**: Throws a Frappe error if a sub-cashier attempts the action.

## 3. `ury_pos_invoice.py`

### `before_insert(doc, method)`
- **Trigger**: `before_insert`
- **Description**: Orchestrates pre-insertion logic including naming, order type update, and existing order restriction.
- **Side Effects**: None directly.

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates validation logic for invoice details, customer, and price lists.
- **Side Effects**: None directly.

### `before_submit(doc, method)`
- **Trigger**: `before_submit`
- **Description**: Orchestrates pre-submission logic including time tracking, print validation, and UI reload events.
- **Side Effects**: None directly.

### `on_trash(doc, method)`
- **Trigger**: `on_trash`
- **Description**: Triggers cleanup logic for restaurant tables when an invoice is trashed.
- **Side Effects**: None directly.

### `validate_invoice(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Sets a fallback waiter if none is assigned. Checks if items were removed or quantities were reduced after the invoice was already printed (unless explicitly allowed).
- **Side Effects**: Throws a Frappe error if printed items are modified. Modifies `waiter` in memory.

### `validate_customer(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Ensures that a customer name is populated.
- **Side Effects**: Throws a Frappe error if the customer name is missing.

### `calculate_and_set_times(doc, method)`
- **Trigger**: `before_submit` (via `before_submit`)
- **Description**: Calculates the total time spent from document creation to submission.
- **Side Effects**: Modifies `arrived_time` and `total_spend_time` fields in memory.

### `validate_invoice_print(doc, method)`
- **Trigger**: `before_submit` (via `before_submit`)
- **Description**: Enforces that invoices associated with restaurant tables must be printed before submission.
- **Side Effects**: Throws a Frappe error if the invoice has not been printed.

### `table_status_delete(doc, method)`
- **Trigger**: `on_trash` (via `on_trash`)
- **Description**: Frees up the associated restaurant table.
- **Side Effects**: Updates the `URY Table` record in the database, setting `occupied` to 0 and clearing `latest_invoice_time`.

### `pos_invoice_naming(doc, method)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Dynamically assigns a naming series based on the restaurant's prefix configuration for dine-in or aggregator orders.
- **Side Effects**: Modifies the `naming_series` field in memory.

### `order_type_update(doc, method)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Determines and sets the order type (`Take Away` or `Dine In`) based on the table's configuration.
- **Side Effects**: Modifies the `order_type` field in memory.

### `ro_reload_submit(doc, method)`
- **Trigger**: `before_submit` (via `before_submit`)
- **Description**: Notifies connected clients to reload the restaurant order interface.
- **Side Effects**: Publishes a realtime socket event `reload_ro`.

### `validate_price_list(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Sets the appropriate price list based on the active menu, room assignments, or aggregator settings.
- **Side Effects**: Modifies the `selling_price_list` field in memory. Throws a Frappe error if an aggregator price list is missing.

### `restrict_existing_order(doc, event)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Verifies that the table does not already have an open, unprinted invoice.
- **Side Effects**: Throws a Frappe error if a conflict is found.

## 4. `ury_pos_opening_entry.py`

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates validation by setting the cashier room.
- **Side Effects**: None directly.

### `before_save(doc, method)`
- **Trigger**: `before_save`
- **Description**: Orchestrates pre-save checks and time tracking.
- **Side Effects**: None directly.

### `set_cashier_room(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Looks up the assigned room for the user at the given branch.
- **Side Effects**: Modifies `custom_room` and populates the `custom_rooms` child table in memory for multiple cashier setups.

### `set_current_time(doc, method)`
- **Trigger**: `before_save` (via `before_save`)
- **Description**: Sets the opening period start time to the current timestamp.
- **Side Effects**: Modifies the `period_start_date` field in memory.

### `main_pos_open_check(doc, method)`
- **Trigger**: `before_save` (via `before_save`)
- **Description**: For multiple cashier setups, verifies that the main cashier has an open POS before allowing sub-cashiers to open theirs.
- **Side Effects**: Throws a Frappe error if the main POS is closed.

## 5. `ury_pos_profile.py`

### `validate(doc, method)`
- **Trigger**: `validate`
- **Description**: Orchestrates profile validation.
- **Side Effects**: None directly.

### `validate_bill_check(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Ensures that printer settings specify both a bill configuration and a target printer.
- **Side Effects**: Triggers a Frappe message (`msgprint`) if validation fails.

### `validate_cost_center(doc, method)`
- **Trigger**: `validate` (via `validate`)
- **Description**: Enforces cost center assignment.
- **Side Effects**: Throws a Frappe error if a cost center is omitted.

## 6. `ury_sales_invoice.py`

### `before_insert(doc, method)`
- **Trigger**: `before_insert`
- **Description**: Orchestrates pre-insert logic.
- **Side Effects**: None directly.

### `on_update(doc, method)`
- **Trigger**: `on_update`
- **Description**: Orchestrates update logic.
- **Side Effects**: None directly.

### `sales_invoice_naming(doc, method)`
- **Trigger**: `before_insert` (via `before_insert`)
- **Description**: Constructs a custom naming series (prefixed with `SINV-`) for POS invoices based on aggregator configurations and restaurant profiles.
- **Side Effects**: Modifies the `naming_series` field in memory. Throws a Frappe error if the POS profile is invalid.

### `aggregator_unpaid(doc, method)`
- **Trigger**: `on_update` (via `on_update`)
- **Description**: Unsets the `is_pos` flag for aggregator orders if the branch enforces unpaid aggregator handling.
- **Side Effects**: Modifies the `is_pos` field in memory.

### `remove_tax(doc, method)`
- **Trigger**: Unbound hook function / direct call
- **Description**: Clears applied taxes and charges for aggregator orders if the branch is configured to skip taxes.
- **Side Effects**: Clears `taxes_and_charges` and empties the `taxes` child table in memory.

## Standard Page Overrides

To tailor the standard ERPNext interface to restaurant requirements, URY overrides several standard scripts and UI components:

- **Point of Sale (`pos_extend.js`)**: 
  Extends the default `erpnext.PointOfSale.Controller`, `PastOrderList`, `PastOrderSummary`, and `ItemCart` classes. It introduces custom invoice filtering, a strict order cancellation dialog that blocks billed/table orders, an interactive comment dialog, and a specialized cart layout.
- **Customer Quick Entry (`quick_entry.js`)**:
  Overrides `frappe.ui.form.CustomerQuickEntryForm` to streamline customer creation during rush hours. It strips the dialog down to the four mandatory fields: Customer Name, Mobile Number, Customer Group, and Territory.
- **POS Strict Editing (`restrict_qty_edit_pos.js`)**:
  Secures the POS interface against manipulation. Using a DOM `MutationObserver`, it listens for edits to the cart. If the `remove_items` configuration is disabled in the POS Profile and the invoice is associated with a table and has already been printed, it freezes the quantity fields and disables the remove/delete buttons.
