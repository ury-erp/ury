# ERPNext Integration & Fixtures

## Overview
This document outlines the fixtures and configurations integrated into ERPNext for the URY application, including custom fields, client scripts, property setters, roles, and the aggregator settings workflow.

## Custom Fields

The following custom fields have been added, grouped by their parent Doctype:

### Branch
- `custom_aggregators` (Section Break)
- `custom_aggregator_settings` (Table - Aggregator Settings)
- `custom_no_taxes` (Check)
- `custom_make_unpaid` (Check)

### Customer
- `mobile_number` (Data)

### Employee
- `payment_type` (Select)
- `payment_amount` (Currency)

### POS Closing Entry Detail
- `custom_closing_amount` (Currency)

### POS Invoice
- `mobile_number` (Data)
- `order_info` (Section Break)
- `order_type` (Select)
- `waiter` (Data)
- `invoice_printed` (Check)
- `column_break_rwbwf` (Column Break)
- `no_of_pax` (Data)
- `cashier` (Data)
- `invoice_created` (Check)
- `custom_aggregator_id` (Data)
- `restaurant_info` (Section Break)
- `restaurant` (Link)
- `branch` (Link)
- `restaurant_table` (Link)
- `custom_restaurant_room` (Link)
- `column_break_gd1mq` (Column Break)
- `arrived_time` (Data)
- `total_spend_time` (Data)
- `section_break_hllcp` (Section Break)
- `cancel_reason` (Data)
- `print` (Button)
- `custom_comments` (Data)
- `custom_ury_order_number` (Data)

### POS Invoice Item
- `comment` (Data)
- `custom_course` (Data)

### POS Opening Entry
- `custom_room` (Data)
- `restaurant_info` (Section Break)
- `restaurant` (Link)
- `column_break_e3dky` (Column Break)
- `branch` (Link)
- `custom_rooms` (Table)
- `custom_sub_pos_close_entry` (Data)
- `custom_ury_last_aggregator_invoice` (Data)
- `custom_ury_last_invoice` (Data)

### POS Profile
- `restaurant_info` (Section Break)
- `restaurant` (Link)
- `column_break_c10ag` (Column Break)
- `branch` (Link)
- `printer_info` (Section Break)
- `printer_settings` (Table)
- `qz_print` (Check)
- `qz_host` (Data)
- `section_break_tjhrm` (Section Break)
- `transfer_role_permissions` (Table MultiSelect)
- `role_allowed_for_billing` (Table MultiSelect)
- `table_attention_time` (Int)
- `paid_limit` (Int)
- `column_break_bvzw2` (Column Break)
- `role_restricted_for_table_order` (Table MultiSelect)
- `view_all_status` (Check)
- `remove_items` (Check)
- `show_image` (Check)
- `custom_daily_pos_close` (Check)
- `custom_enable_discount` (Check)
- `restaurant_prefix` (Check)
- `custom_multiple_cashier_configuration` (Section Break)
- `custom_enable_multiple_cashier` (Check)
- `custom_edit_order_type` (Check)
- `custom_kot_settings` (Section Break)
- `custom_kot_naming_series` (Data)
- `custom_kot_alert` (Check)
- `custom_kot_alert_sound` (Attach)
- `custom_cl` (Column Break)
- `custom_kot_warning_time` (Int)
- `custom_notify_kot_delay` (Check)
- `custom_recipients` (Table)
- `custom_reset_order_number_daily` (Check)
- `custom_enable_kot_reprint` (Check)
- `custom_parcel_order_printer` (Link)
- `custom_column_break_wwq3q` (Column Break)
- `custom_table_order_printer` (Link)
- `custom_reprint_kot_format` (Link)

### POS Profile User
- `custom_main_cashier` (Check)

### Price List
- `restaurant_menu` (Link)

### Sales Invoice
- `mobile_number` (Data)
- `order_info` (Section Break)
- `order_type` (Select)
- `waiter` (Data)
- `custom_aggregator_id` (Data)
- `column_break_bc56k` (Column Break)
- `no_of_pax` (Int)
- `cashier` (Data)
- `restaurant_info` (Section Break)
- `restaurant` (Link)
- `branch` (Link)
- `restaurant_table` (Link)
- `custom_restaurant_room` (Link)
- `column_break_hnrk9` (Column Break)
- `arrived_time` (Data)
- `total_spend_time` (Data)

### Sales Invoice Item
- `custom_course` (Data)

### URY Menu Course
- `custom_indicate_in_kds` (Check)
- `custom_serving_priority` (Int)

### URY Printer Settings
- `custom_kot_print` (Check)
- `custom_kot_print_format` (Link)
- `custom_block_takeaway_kot` (Check)

## Client Scripts

1. **Customer mobile number in PoS**
   - **Doctype:** POS Invoice
   - **Description:** Adjusts the customer creation modal in POS to hide unnecessary fields (`customer_group`, `territory`). Synchronizes the customer name and mobile number inputs if a numeric value is entered.

2. **Customer mobile number in ury order**
   - **Doctype:** URY Order
   - **Description:** Mirrors the functionality of the POS Invoice script for the `URY Order` doctype, simplifying customer data entry during order creation.

## Property Setters

1. **POS Closing Entry Detail-closing_amount-label**
   - **Doctype:** POS Closing Entry Detail
   - **Field:** `closing_amount`
   - **Property Changed:** `label`
   - **New Value:** "Total Closing Amount"

## Roles

The application defines the following custom roles to manage access control for operations:
- **URY Manager**
- **URY Captain**
- **URY Cashier**

## Aggregator Settings

The `Aggregator Settings` (`aggregator_settings.json`) is a child table Doctype used to manage third-party delivery services and aggregators integrated with the POS flow.

### Fields
- `customer` (Link -> Customer): Identifies the aggregator entity.
- `price_list` (Link -> Price List): The specific price list assigned to the aggregator.
- `mode_of_payments` (Link -> Mode of Payment): The default payment method for aggregator orders.

### POS Integration Flow
Aggregator settings are configured at the **Branch** level via the `custom_aggregator_settings` child table. When an order is received from an aggregator, the POS system uses the `custom_aggregator_id` field in `POS Invoice` and `Sales Invoice` to associate the transaction. This applies the correct predefined customer profile, specific price list, and mode of payment automatically, ensuring accurate tracking and reconciliation of third-party orders.

## API Overrides & Injection Strategy

The URY application extends and overrides default ERPNext API methods to inject custom logic into standard views and processes.

### POS Invoice List Override (`pos_extend.py`)
- **Method**: `overrided_past_order_list`
- **Purpose**: Overrides the default past order list fetch in the POS interface.
- **Logic**: 
  - Validates and sanitizes the search input.
  - Applies role-based filtering: If the user is not an Administrator, it uses the `URY User` mapping to fetch only the invoices associated with the user's specific `branch` and `custom_restaurant_room`.
  - Filters invoices based on the `status` (e.g., Draft vs. Paid) and custom states (e.g., whether the invoice has been printed or if it is associated with a restaurant table).
  - This ensures that staff only see orders relevant to their current physical location and operational scope.
