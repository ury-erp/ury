# POS Lifecycle

## Overview
The URY application manages the complete lifecycle of a restaurant transaction through a series of customized standard ERPNext doctypes. This lifecycle is tightly integrated using Frappe hooks to automate processes, enforce validations, and maintain data consistency.

## Lifecycle Flow

### 1. POS Opening Entry
The shift begins with the creation of a `POS Opening Entry`.
- **Hooks & Validations**: 
  - `set_cashier_room`: Automatically assigns the cashier to their designated room based on the `URY User` mapping.
  - `set_last_invoice_in_pos_open`: Records the last invoice numbers (standard and aggregator) to ensure sequential tracking for the new shift.
  - `before_save`: Performs necessary checks and balances before the shift is officially open.

### 2. Order Creation & KOT (Kitchen Order Ticket)
When an order is placed, it is temporarily held or directly converted into a `POS Invoice` (in Draft status). 
- **KOT Generation**: The system generates a KOT to notify the kitchen. The KOT system is deeply integrated, utilizing scheduled background jobs (`ury_kot_validation.kotValidationThread`) to monitor delays and alert staff.
- **Order Numbers**: Custom logic (`set_order_number`) assigns a daily resetting or continuous order number to the `POS Invoice` for easy tracking.

### 3. POS Invoice (Billing)
The `POS Invoice` handles the financial transaction and finalized order details.
- **Hooks & Events**:
  - `before_insert` & `before_submit`: Enforce custom business logic, such as checking table availability, validating pax counts, and ensuring pricing is correct.
  - `validate`: A comprehensive validation step to ensure all custom fields (like aggregators, rooms, and waiters) are correctly populated.
  - `on_trash`: Manages the cancellation process, ensuring stock and table statuses are reverted accurately.

### 4. POS Closing Entry
At the end of the shift, the cashier submits a `POS Closing Entry` to reconcile cash and other payments.
- **Hooks**:
  - `before_save` & `validate`: Ensure the total closing amount matches the recorded transactions, tallying custom expenses or payouts made during the shift.

### 5. Multi-Cashier Configuration & Sub-POS Closing
The application supports a hierarchy of cashiers (Main Cashier and Sub-Cashiers) for larger operations.
- **Configuration**: Managed in the `POS Profile` via custom fields (`custom_multiple_cashier_configuration`, `custom_enable_multiple_cashier`, `custom_main_cashier`).
- **Opening Flow**: The `main_pos_open_check` hook ensures that a sub-cashier cannot open a shift unless the main cashier has an open `POS Opening Entry`.
- **Closing Flow**: 
  - The `sub_pos_close_check` ensures the main cashier cannot close their shift if any sub-cashier still has an open shift.
  - Sub-cashiers submit a `Sub POS Closing Payment` which rolls up to the main cashier. The `calculate_closing_amount` hook aggregates the expected cash/payments from all sub-cashiers to generate a consolidated closing report for the main cashier.
  - Sub-cashiers are strictly prohibited from generating their own final `POS Closing Entry` (`validate_cashier` hook).
