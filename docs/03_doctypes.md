# URY Custom Doctypes

This document contains all 36 custom Doctypes of the URY Frappe app.

### Aggregator Settings
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/aggregator_settings/aggregator_settings.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/aggregator_settings/aggregator_settings.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| customer | Link | Customer | Customer | No | No | Yes |
| price_list | Link | Default Price List | Price List | No | No | Yes |
| mode_of_payments | Link | Default Mode Of Payments | Mode of Payment | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### Item Add On
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/item_add_on/item_add_on.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/item_add_on/item_add_on.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| item | Link | Item | Item | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### KDS Order Type
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/kds_order_type/kds_order_type.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/kds_order_type/kds_order_type.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| order_type | Select | Order Type |  Dine In Phone In Take Away Delivery Aggregators | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### Menu for Room
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/menu_for_room/menu_for_room.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/menu_for_room/menu_for_room.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| menu | Link | Menu | URY Menu | No | No | Yes |
| room | Link | Room | URY Room | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### Multiple Rooms
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/multiple_rooms/multiple_rooms.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/multiple_rooms/multiple_rooms.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| room | Link | Room | URY Room | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### Order Type Menu
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/order_type_menu/order_type_menu.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/order_type_menu/order_type_menu.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| order_type | Select | Order Type |  Phone In Take Away Delivery | No | No | Yes |
| menu | Link | Menu | URY Menu | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### POS Item Variants
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/pos_item_variants/pos_item_variants.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/pos_item_variants/pos_item_variants.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| item | Link | Item | Item | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### Role Permitted
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/role_permitted/role_permitted.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/role_permitted/role_permitted.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| role | Link | Role | Role | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### Sub POS Closing
- **Type**: Master/Transaction
- **Is Submittable**: Yes
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_closing/sub_pos_closing.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_closing/sub_pos_closing.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| period_details_section | Section Break | Period Details |  | No | No | No |
| period_start_date | Datetime | Period Start Date |  | Yes | Yes | Yes |
| period_end_date | Datetime | Period End Date |  | Yes | Yes | Yes |
| column_break_nws7 | Column Break |  |  | No | No | No |
| posting_date | Date | Posting Date |  | Yes | No | Yes |
| posting_time | Time | Posting Time |  | Yes | No | No |
| pos_opening_entry | Link | POS Opening Entry | POS Opening Entry | Yes | No | No |
| status | Select | Status | Draft Submitted Queued Failed Cancelled | No | Yes | No |
| user_details_section | Section Break | User Details |  | No | No | No |
| company | Link | Company | Company | Yes | No | No |
| column_break_nahd | Column Break |  |  | No | No | No |
| pos_profile | Link | POS Profile  | POS Profile | Yes | No | Yes |
| user | Link | Cashier | User | Yes | No | No |
| linked_invoices_section | Section Break | Linked Invoices |  | No | No | No |
| pos_transactions | Table | POS Transactions | Sub POS Invoices | No | No | No |
| section_break_xcg0 | Section Break |  |  | No | No | No |
| payment_reconciliation | Table | Payment Reconciliation | Sub POS Closing Payment | No | No | No |
| grand_total | Currency | Grand Total |  | No | Yes | No |
| net_total | Currency | Net Total |  | No | Yes | No |
| total_quantity | Float | Total Quantity |  | No | Yes | No |
| amended_from | Link | Amended From | Sub POS Closing | No | Yes | No |
| amended_from | Link | Amended From | Sub POS Closing | No | Yes | No |

- **Child Tables**: Sub POS Invoices, Sub POS Closing Payment
- **Custom Logic**: Contains custom backend logic (controller overrides).

---

### Sub POS Closing Payment
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_closing_payment/sub_pos_closing_payment.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_closing_payment/sub_pos_closing_payment.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| mode_of_payment | Link | Mode of Payment | Mode of Payment | Yes | No | Yes |
| opening_amount | Currency | Opening Amount | company:company_currency | No | No | Yes |
| expected_amount | Currency | Expected Amount | company:company_currency | No | No | No |
| closing_amount | Currency | Closing Amount |  | No | No | Yes |
| difference | Currency | Difference | company:company_currency | No | No | No |
- **Custom Logic**: No custom logic found.

---

### Sub POS Invoices
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_invoices/sub_pos_invoices.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/sub_pos_invoices/sub_pos_invoices.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| pos_invoice_section | Section Break | POS Invoice |  | No | No | No |
| pos_invoice | Link | POS Invoice | POS Invoice | No | No | Yes |
| posting_date | Date | Date |  | No | No | Yes |
| grand_total | Currency | Amount |  | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Cost Of Goods
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_cost_of_goods/ury_cost_of_goods.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_cost_of_goods/ury_cost_of_goods.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| item_code | Link | Item | Item | Yes | No | Yes |
| item_name | Data | Item Name |  | Yes | No | Yes |
| item_group | Link | Item Group | Item Group | Yes | No | Yes |
| qty | Float | Quantity |  | Yes | No | Yes |
| buying_price | Currency | Buying Price |  | Yes | No | Yes |
| amount | Currency | Amount |  | Yes | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Daily P and L
- **Type**: Master/Transaction
- **Is Submittable**: Yes
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| proft_loss_details | HTML |  |  | No | No | No |
| branch | Link | Branch | Branch | Yes | No | Yes |
| column_break_so5qh | Column Break |  |  | No | No | No |
| date | Date | Date |  | Yes | No | Yes |
| section_break_qpbbd | Section Break |  |  | No | No | No |
| electricity_opening | Float | Electricity Opening |  | Yes | No | No |
| column_break_mq2bv | Column Break |  |  | No | No | No |
| electricity_closing | Float | Electricity Closing |  | Yes | No | No |
| other_expenses | Table | Other Expenses | URY P and L Breakup | No | No | No |
| p_and_l_section | Section Break | Summary |  | No | No | No |
| gross_sales | Currency | Gross Sales |  | No | Yes | No |
| gross_sales_percent | Percent | Gross Sales Percent |  | No | Yes | No |
| cash_discount_round_off | Currency | Discounts & Round Offs |  | No | Yes | No |
| cash_discount_round_off_percent | Percent | Discounts & Round Offs Percent |  | No | Yes | No |
| tax | Currency | Tax |  | No | Yes | No |
| tax_percent | Percent | Tax Percent |  | No | Yes | No |
| net_sales | Currency | Net Sales |  | No | Yes | No |
| net_sales_percent | Percent | Net Sales Percent |  | No | Yes | No |
| cogs | Currency | Cost of Goods Sold |  | No | Yes | No |
| cogs_percent | Percent | Cost of Goods Sold Percent |  | No | Yes | No |
| total_direct_expenses | Currency | Total Direct Expense |  | No | Yes | No |
| total_direct_expenses_percent | Percent | Total Direct Expense Percent |  | No | Yes | No |
| gross_profit | Currency | Gross Profit/Loss |  | No | Yes | No |
| gross_profit_percent | Percent | Gross Profit/Loss Percent |  | No | Yes | No |
| depreciation | Currency | Depreciation |  | No | Yes | No |
| depreciation_percent | Percent | Depreciation Percent |  | No | Yes | No |
| total_other_expenses | Currency | Other Expenses |  | No | Yes | No |
| other_expenses_percent | Percent | Other Expenses Percent |  | No | Yes | No |
| total_indirect_expenses | Currency | Total Indirect Expenses |  | No | Yes | No |
| total_indirect_expenses_percent | Percent | Total Indirect Expenses Percent |  | No | Yes | No |
| net_profit | Currency | Net Profit/Loss |  | No | Yes | No |
| net_profit_percent | Percent | Net Profit/Loss Percent |  | No | Yes | No |
| expenses_breakup | Tab Break | Breakup |  | No | No | No |
| direct_expenses_breakup | Table | Direct Expenses | URY P and L Breakup | No | Yes | No |
| section_break_lught | Section Break |  |  | No | No | No |
| employee_costs_breakup | Table | Employee Costs | URY P and L Breakup | No | Yes | No |
| section_break_rhkwy | Section Break |  |  | No | No | No |
| indirect_expenses_breakup | Table | Indirect Expenses | URY P and L Breakup | No | Yes | No |
| cogs_tab | Tab Break | Cost Of Goods |  | No | No | No |
| cost_of_goods | Table | Cost Of Goods Sold (Breakup) | URY Cost Of Goods | No | Yes | No |
| amended_from | Link | Amended From | URY Daily P and L | No | Yes | No |
| section_break_6mqsm | Section Break |  |  | No | No | No |
| remarks | Long Text | Remarks |  | No | Yes | No |
| section_break_dv4iu | Section Break |  |  | No | No | No |
| details_tab | Tab Break | Details |  | No | No | No |
| total_employee_costs | Currency | Employee Cost |  | No | Yes | No |
| total_employee_costs_percent | Percent | Employee Cost Percent |  | No | Yes | No |
| profit_loss_tab | Tab Break | Profit / Loss |  | No | No | No |
| column_break_bqo3d | Column Break |  |  | No | No | No |
| materials_consumed | Table | Materials Consumed | URY P and L Materials | No | No | No |

- **Child Tables**: URY P and L Breakup, URY P and L Breakup, URY P and L Breakup, URY P and L Breakup, URY Cost Of Goods, URY P and L Materials
- **Custom Logic**: Contains custom backend logic (controller overrides).

---

### URY Fixed Expenses
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_fixed_expenses/ury_fixed_expenses.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_fixed_expenses/ury_fixed_expenses.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| expense | Data | Expense |  | Yes | No | Yes |
| amount | Currency | Amount |  | Yes | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY KOT
- **Type**: Master/Transaction
- **Is Submittable**: Yes
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_kot/ury_kot.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_kot/ury_kot.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| invoice | Data | Invoice |  | No | Yes | Yes |
| restaurant_table | Link | Restaurant Table | URY Table | No | No | No |
| customer_name | Link | Customer Name | Customer | No | Yes | No |
| original_kot | Small Text | Original KOT |  | No | Yes | No |
| column_break_phntx | Column Break |  |  | No | No | No |
| date | Date | Date |  | Yes | No | Yes |
| time | Time | Time |  | No | No | No |
| type | Select | Type |  New Order Order Modified Cancelled Partially cancelled Duplicate | No | Yes | No |
| section_break_l97s0 | Section Break |  |  | No | No | No |
| order_status | Data | Order Status |  | No | Yes | No |
| production | Link | Production | URY Production Unit | No | No | No |
| section_break_yxcxo | Section Break |  |  | No | No | No |
| start_time_prep | Time | Start Time For Preparation |  | No | Yes | No |
| column_break_9rksu | Column Break |  |  | No | No | No |
| start_time_serv | Data | Served Time |  | No | Yes | No |
| section_break_ubzfc | Section Break |  |  | No | No | No |
| kot_items | Table | KOT Items | URY KOT Items | No | No | No |
| section_break_zpwun | Section Break |  |  | No | No | No |
| naming_series | Data | naming_series |  | No | Yes | No |
| pos_profile | Link | POS Profile | POS Profile | No | Yes | No |
| comments | Data | Comments |  | No | Yes | No |
| branch | Link | Branch | Branch | No | Yes | No |
| verified | Check | Verified |  | No | Yes | No |
| order_no | Data | Order No |  | No | Yes | No |
| verified_by | Link | verified_by | User | No | Yes | No |
| customer_group | Data | Customer group |  | No | No | No |
| table_takeaway | Check | Table Takeaway |  | No | No | No |
| user | Data | user |  | No | No | No |
| aggregator_id | Data | Aggregator ID |  | No | Yes | No |
| is_aggregator | Check | Is Aggregator |  | No | Yes | No |
| amended_from | Link | Amended From | URY KOT | No | Yes | No |
| production_time | Data | Total Production Time |  | No | Yes | No |

- **Child Tables**: URY KOT Items
- **Custom Logic**: Contains custom backend logic (controller overrides).

---

### URY KOT Error Log
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_kot_error_log/ury_kot_error_log.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_kot_error_log/ury_kot_error_log.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| kot | Data | KOT |  | No | Yes | No |
| date | Date | Date |  | No | Yes | No |
| time | Time | Time |  | No | Yes | No |
| invoice | Data | Invoice |  | No | Yes | No |
| invoice_creation_time | Data | Invoice Creation Time |  | No | Yes | No |
- **Custom Logic**: No custom logic found.

---

### URY KOT Items
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_kot_items/ury_kot_items.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_kot_items/ury_kot_items.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| item | Link | Item | Item | No | No | Yes |
| item_name | Data | Item Name |  | No | No | Yes |
| quantity | Data | Quantity |  | No | No | Yes |
| cancelled_qty | Data | Cancelled Qty |  | No | Yes | No |
| comments | Data | Comments |  | No | No | No |
| course | Link | Course | URY Menu Course | No | Yes | No |
| serve_priority | Int | Serve Priority |  | No | Yes | No |
| indicate_course | Check | Indicate Course |  | No | Yes | No |
- **Custom Logic**: No custom logic found.

---

### URY Materials
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_materials/ury_materials.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_materials/ury_materials.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| cost_per_unit | Currency | Cost Per Unit |  | Yes | No | Yes |
| material | Data | Material |  | Yes | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Menu
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_menu/ury_menu.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_menu/ury_menu.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| enabled | Check | Enabled |  | No | No | Yes |
| column_break_3 | Column Break |  |  | No | No | No |
| price_list | Link | Price List (Auto created) | Price List | No | Yes | No |
| items_section | Section Break | Items |  | No | No | No |
| items | Table | Items | URY Menu Item | Yes | No | No |
| branch | Link | Branch | Branch | Yes | No | No |

- **Child Tables**: URY Menu Item
- **Custom Logic**: Contains custom backend logic (controller overrides).

---

### URY Menu Course
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_menu_course/ury_menu_course.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_menu_course/ury_menu_course.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| course | Data | Course |  | Yes | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Menu Item
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_menu_item/ury_menu_item.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_menu_item/ury_menu_item.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| item | Link | Item | Item | No | No | Yes |
| item_name | Data | Item Name |  | No | No | Yes |
| rate | Currency | Rate |  | No | No | Yes |
| special_dish | Check | Special Dish |  | No | No | Yes |
| disabled | Check | Disabled |  | No | No | Yes |
| course | Link | Course | URY Menu Course | No | No | Yes |
| course_icon | Data | Course Icon |  | No | No | No |
- **Custom Logic**: No custom logic found.

---

### URY Notification Recipient
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_notification_recipient/ury_notification_recipient.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_notification_recipient/ury_notification_recipient.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| receiver_by_role | Link | Receiver By Role | Role | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Order
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_order/ury_order.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_order/ury_order.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| table_tab | Tab Break | Table |  | No | No | No |
| take_away | Check | Take Away |  | No | No | No |
| table_list | HTML | Table List |  | No | No | No |
| take_away_list | HTML | Take Away List |  | No | No | No |
| restaurant_table | Link | Restaurant Table | URY Table | No | No | No |
| menu_tab | Tab Break | Menu |  | No | No | No |
| item_search | Data |  |  | No | No | No |
| column_break_10 | Column Break |  |  | No | No | No |
| all_item | Button | All |  | No | No | No |
| priority_item | Button | Priority |  | No | No | No |
| section_break_13 | Section Break |  |  | No | No | No |
| item | HTML | Item | <div class="container px-0"> <div class="row" id="restaurant_menu_items"></div> </div> | No | No | No |
| customer_tab | Tab Break | Customer |  | No | No | No |
| customer_name | Link | Customer Name | Customer | Yes | No | No |
| no_of_pax | Int | Pax |  | Yes | No | Yes |
| favorite_item_section | Section Break | Favorite Item |  | No | Yes | No |
| favorite_items | HTML | Favorite Items | <div class="container px-0"> <div class="row" id="fav_items"></div> </div> | No | No | No |
| order_tab | Tab Break | Order |  | No | No | No |
| add_item | Link | Add Item | Item | No | No | No |
| cart_items | HTML | Cart Items | <div class="container px-0"> <div id="restaurantCartItems"></div> </div> | No | No | No |
| grand_total | Currency | Grand Total |  | No | Yes | No |
| last_invoice | Link | Invoice | POS Invoice | No | Yes | No |
| additional_details | Section Break | Additional Details |  | No | No | No |
| items | Table | Items | URY Order Item | No | No | No |
| waiter | Link | Waiter | User | No | Yes | No |
| pos_profile | Link | POS Profile | POS Profile | No | Yes | No |
| cashier | Link | Cashier | User | No | Yes | No |
| comments | Data | Comments |  | No | No | No |
| column_break_3 | Column Break |  |  | No | No | No |
| current_order | Section Break | Current Order |  | No | No | No |
| modified_time | Datetime | Modified time |  | No | No | No |

- **Child Tables**: URY Order Item
- **Custom Logic**: Contains custom backend logic (controller overrides).

---

### URY Order Item
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_order_item/ury_order_item.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_order_item/ury_order_item.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| item | Link | Item | Item | Yes | Yes | Yes |
| item_name | Data | Item Name |  | No | Yes | Yes |
| qty | Int | Qty |  | No | No | No |
| rate | Currency | Rate |  | No | Yes | Yes |
| comments | Data | Comments |  | No | No | No |
- **Custom Logic**: No custom logic found.

---

### URY P and L Breakup
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_p_and_l_breakup/ury_p_and_l_breakup.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_p_and_l_breakup/ury_p_and_l_breakup.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| breakup | Data | Breakup |  | Yes | No | Yes |
| amount | Currency | Amount |  | Yes | No | Yes |
| percent | Percent | Percent |  | No | Yes | No |
- **Custom Logic**: No custom logic found.

---

### URY P and L Materials
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_p_and_l_materials/ury_p_and_l_materials.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_p_and_l_materials/ury_p_and_l_materials.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| cost_per_unit | Currency | Cost Per Unit |  | Yes | Yes | Yes |
| units_consumed | Float | Units Consumed |  | Yes | No | Yes |
| amount | Currency | Amount | currency | Yes | Yes | Yes |
| material | Data | Material |  | Yes | Yes | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Printer Settings
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_printer_settings/ury_printer_settings.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_printer_settings/ury_printer_settings.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| bill | Check | Bill |  | No | No | Yes |
| printer | Link | Printer | Network Printer Settings | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Production Item Groups
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_production_item_groups/ury_production_item_groups.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_production_item_groups/ury_production_item_groups.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| item_group | Link | Item Group | Item Group | No | No | Yes |
- **Custom Logic**: No custom logic found.

---

### URY Production Unit
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_production_unit/ury_production_unit.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_production_unit/ury_production_unit.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| production | Data | Production |  | No | No | No |
| pos_profile | Link | POS Profile | POS Profile | No | No | No |
| branch | Link | Branch | Branch | No | Yes | No |
| warehouse | Link | Warehouse | Warehouse | No | Yes | No |
| item_groups | Table | Item Groups | URY Production Item Groups | No | No | No |
| printer_info_section | Section Break | Printer info |  | No | No | No |
| printer_settings | Table | Printers | URY Printer Settings | No | No | No |
| section_break_sevj | Section Break | KDS Settings |  | No | No | No |
| enable_order_type_wise_display_on_mosaic | Check | Enable order type wise display on mosaic |  | No | No | No |
| order_type | Table | Order Type | KDS Order Type | No | No | No |

- **Child Tables**: URY Production Item Groups, URY Printer Settings, KDS Order Type
- **Custom Logic**: No custom logic found.

---

### URY Report Settings
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_report_settings/ury_report_settings.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_report_settings/ury_report_settings.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| branch | Link | Branch | Branch | Yes | No | Yes |
| extended_hours | Check | Extended Hours |  | Yes | No | No |
| hours | Int | No Of Hours |  | No | No | No |
| daily_p_and_l | Tab Break | Daily P and L Settings |  | No | No | No |
| buying_price_list | Link | Buying Price List | Price List | Yes | No | No |
| direct_expense_section | Section Break | Direct Expenses |  | No | No | No |
| direct_fixed_expenses | Table | Direct Fixed Expenses | URY Fixed Expenses | No | No | No |
| indirect_expense_section | Section Break | Indirect Expenses | Staff Food Charges | No | No | No |
| indirect_fixed_expenses | Table | Indirect Fixed Expenses | URY Fixed Expenses | No | No | No |
| percentage_expenses | Table | Percentage Expenses | URY Variable Expenses | No | No | No |
| depreciation | Currency | Depreciation |  | No | No | No |
| employee_costs_section | Section Break | Employee Costs |  | No | No | No |
| section_break_4c2bz | Section Break |  |  | No | No | No |
| electricity_charges | Currency | Electricty Charges |  | No | No | No |
| consumables | Table | Burning Materials (Other Consumables) | URY Materials | No | No | No |
| employee_costs | Table | Employee Costs | URY Fixed Expenses | No | No | No |
| monthly_fixed_expenses | Table | Monthly Fixed Expenses | URY Fixed Expenses | No | No | No |

- **Child Tables**: URY Fixed Expenses, URY Fixed Expenses, URY Variable Expenses, URY Materials, URY Fixed Expenses, URY Fixed Expenses
- **Custom Logic**: No custom logic found.

---

### URY Restaurant
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_restaurant/ury_restaurant.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_restaurant/ury_restaurant.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| image | Attach Image | Image |  | No | No | No |
| company | Link | Company | Company | Yes | No | No |
| invoice_series_prefix | Data | Invoice Series Prefix |  | Yes | No | Yes |
| column_break_4 | Column Break |  |  | No | No | No |
| active_menu | Link | Default Menu | URY Menu | No | No | No |
| branch | Link | Branch | Branch | Yes | No | No |
| default_tax_template | Link | Default Tax Template | Sales Taxes and Charges Template | No | No | No |
| address | Link | Address | Address | No | No | No |
| menu_info_section | Section Break | Menu Info |  | No | No | No |
| room_wise_menu | Check | Room Wise Menu |  | No | No | No |
| menu_for_room | Table | Menu For Room | Menu for Room | No | No | No |
| column_break_vo5jt | Column Break |  |  | No | No | No |
| default_room | Link | Default Room | URY Room | Yes | No | No |
| aggregator_series_prefix | Data | Aggregator Series Prefix |  | No | No | No |
| order_type_wise_menu | Check | Order Type Wise Menu |  | No | No | No |
| order_type_menu | Table | Order Type Menu | Order Type Menu | No | No | No |

- **Child Tables**: Menu for Room, Order Type Menu
- **Custom Logic**: No custom logic found.

---

### URY Room
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_room/ury_room.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_room/ury_room.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| room_type | Select | Room Type | AC NON-AC | No | No | No |
| printer_settings | Table | Printer Settings | URY Printer Settings | No | No | No |
| branch | Link | Branch | Branch | Yes | No | Yes |
| column_break_ahfni | Column Break |  |  | No | No | No |
| section_break_hrqbe | Section Break |  |  | No | No | No |

- **Child Tables**: URY Printer Settings
- **Custom Logic**: No custom logic found.

---

### URY Table
- **Type**: Master/Transaction
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_table/ury_table.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_table/ury_table.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| table_info_tab | Tab Break | Table Info |  | No | No | No |
| no_of_seats | Int | No of Seats |  | No | No | No |
| minimum_seating | Int | Minimum Seating |  | No | No | Yes |
| column_break_vub4k | Column Break |  |  | No | No | No |
| restaurant | Link | Restaurant | URY Restaurant | Yes | No | No |
| restaurant_room | Link | Restaurant Room | URY Room | Yes | No | No |
| branch | Link | Branch | Branch | Yes | No | No |
| section_break_mcm3o | Section Break |  |  | No | No | No |
| is_take_away | Check | Is Take Away |  | No | No | No |
| active_info_tab | Tab Break | Active Info |  | No | No | No |
| occupied | Check | Occupied |  | No | Yes | No |
| column_break_280tb | Column Break |  |  | No | No | No |
| latest_invoice_time | Time | Latest Invoice Time |  | No | Yes | No |
| table_shape | Select | Table Shape |  Rectangle Square Circle | No | No | No |
| layout_position_section | Section Break | Layout Position |  | No | No | No |
| layout_x | Float | Layout X |  | No | No | No |
| layout_width | Float | Layout Width |  | No | No | No |
| column_break_olsi | Column Break |  |  | No | No | No |
| layout_y | Float | Layout Y |  | No | No | No |
| layout_height | Float | Layout Height |  | No | No | No |
- **Custom Logic**: Contains custom backend logic (controller overrides).

---

### URY User
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_user/ury_user.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_user/ury_user.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| user | Link | User | User | No | No | Yes |
| room | Link | Room | URY Room | No | No | No |
- **Custom Logic**: No custom logic found.

---

### URY Variable Expenses
- **Type**: Child Table
- **Is Submittable**: No
- **Description**: No description provided.
- **JSON Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_variable_expenses/ury_variable_expenses.json`
- **Python Path**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/ury/ury/doctype/ury_variable_expenses/ury_variable_expenses.py`

**Fields**:
| Fieldname | Fieldtype | Label | Options / Link To | Required | Read Only | In List View |
|---|---|---|---|---|---|---|
| expense | Data | Expense |  | Yes | No | Yes |
| percentage_type | Select | Percentage Type | Gross Sales Net Sales | Yes | No | Yes |
| percent | Percent | Percent |  | Yes | No | Yes |
- **Custom Logic**: No custom logic found.

---
