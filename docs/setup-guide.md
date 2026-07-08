# URY Setup Guide

This guide walks through configuring URY after installation. For the official upstream guide, see https://ury.app/docs/Setup/.

---

## Step 1: Company Setup

Log in to the site and complete the Frappe/ERPNext installation wizard:

1. Select language.
2. Provide country, timezone, and currency.
3. Create the first user.
4. Enter company name, description, and select a bank account.
5. Click **Complete setup**.

---

## Step 2: Users and Roles

Create users in Frappe/ERPNext and assign URY roles:

- **URY Manager** — Oversees all restaurant operations.
- **URY Captain** — Manages customer orders and table service.
- **URY Cashier** — Manages orders, table service, payments, and POS operations.

Additional ERPNext roles may be needed for permissions:

| User type | Suggested ERPNext roles |
|-----------|-------------------------|
| Captain | Item Manager, Accounts User, Sales User |
| Manager | Item Manager, Sales Manager, Accounts Manager, Stock Manager, Sales User |

For full permission tables, see the upstream `SETUP.md`.

---

## Step 3: Branch

Create a **Branch** in ERPNext/Frappe HR. Branches manage users, POS access, and aggregator configurations.

- Specify branch users in the branch table; only these users can access the POS for that branch.
- Configure aggregator settings if applicable:
  - **Customer** — Customer profile for aggregator orders.
  - **Price List** — Selling price list for aggregator menu items.
  - **Mode of Payment** — Payment mode for aggregator transactions.
  - **Keep Sales Invoice Unpaid** — Optional.
  - **Create Invoice without Tax** — Optional.

---

## Step 4: URY Restaurant

Create a **URY Restaurant** with:

- **Name** — Restaurant name.
- **Company** — Linked company.
- **Invoice Series Prefix** — Prefix for invoice naming.
- **Aggregator Series Prefix** — Prefix for aggregator invoice naming.
- **Branch** — Linked branch.
- **Default Tax Template** — Sales tax template (if applicable).
- **Address** — Restaurant address.
- **Default Menu** — Default restaurant menu.
- **Room Wise Menu** — Enable and map menus per room.
- **Order Type Wise Menu** — Enable and map menus per order type.

---

## Step 5: URY Room

Create **URY Room** records (e.g., Indoor, Outdoor, VIP):

- **Name** — Unique room name.
- **Room Type** — Select type.
- **Print Settings** — Network printer for the room.
- **Bill** — Enable for invoice printing.
- **KOT Print** — Enable for KOT printing.

Add rooms to the URY Restaurant.

---

## Step 6: Items

Create **Item** records in ERPNext for menu items. Use **Product Bundle** for combo/ bundled items.

---

## Step 7: URY Menu

Create a **URY Menu**:

- **Name** — Menu name.
- **Restaurant** — Linked restaurant.
- **Branch** — Auto-populated from restaurant.
- **Enabled** — Activate the menu.
- **Items** — Items and rates.
- **Special Dish** — Highlight priority/special items.
- **Disabled** — Remove items temporarily.
- **Course** — Categorise by course (Starters, Mains, Desserts).

If a course has **Indicate in KDS** enabled, the KDS uses course priority for preparation order.

---

## Step 8: URY Table

Create **URY Table** records:

- **Name** — Table name.
- **Restaurant** — Linked restaurant.
- **Restaurant Room** — Room the table belongs to.
- **Branch** — Auto-populated.
- **No of seat** — Seating capacity.
- **Minimum seating** — Minimum seating capacity.
- **Is Take Away** — For takeaway orders.
- **Table Shape** — Shape used in POS table view.

---

## Step 9: POS Profile

Create a **POS Profile** in ERPNext and configure URY-specific fields:

### Printer Info

- **Printer Settings** — Select network printer; enable Bill and/or KOT Print.
- **QZ Print** — Enable QZ Tray printing.
- **QZ Host** — IP of the QZ server (`localhost` or private IP).

### URY POS Restrictions

- **Captain Transfer Role Permissions** — Roles allowed to transfer captains.
- **Role Allowed For Billing** — Cashier role.
- **Role Restricted For Table Order** — Roles restricted from table orders.
- **Table Attention Time** — Threshold for "Attention" table status.
- **Show Limited Paid Invoices** — Limit paid invoices shown to cashier.
- **Allow Cashier To View All Status** — Show all invoice statuses.
- **Allow Cashier To Edit And Remove Table Order Items** — Edit/remove permissions.
- **Show Item Image In URY POS** — Show item images.
- **Require Daily POS Closing** — Enforce previous-day closing.
- **Enable Discount** — Enable discount feature.
- **Enable Order Type Edit** — Allow changing order type on existing invoice.

### Multiple Cashier

- **Enable Multiple Cashier** — Enable and add cashiers under Applicable for Users.
- Mark one user as **Main Cashier**.

### KOT Settings

- **URY KOT Naming Series** — Required for KOT creation.
- **KOT Warning Time** — Delay threshold in KDS.
- **Enable KOT Reprint** — Allow KOT reprints.
- **Enable KOT Audio Alert** — Play sound on new KOT.
- **Notify KOT Delay** — Send delay notifications.
- **Recipients (By Role)** — Roles receiving delay notifications.
- **Reset Order Number Daily** — Reset daily order number.

> **Note:** Update the Price List in Accounting to the restaurant menu price list.

---

## Step 10: URY Production Unit

Create **URY Production Unit** records for each kitchen/station:

- **Production** — Production unit name.
- **POS Profile** — Linked POS profile.
- **Branch** — Auto-fetched from POS profile.
- **Warehouse** — Auto-fetched from POS profile.
- **Item Groups** — Item groups prepared in this unit.
- **Printers** — Printers for this unit.

Access the KDS at:

```
https://<site>/URYMosaic/<Production%20Unit%20Name>
```

Example: `https://ury.example.com/URYMosaic/Kitchen`

---

## Step 11: User Permissions

Assign user permissions for:

- POS Profile
- Branch

This restricts users to only the POS profiles and branches they are allowed to use.

---

## Step 12: Printer Setup

### QZ Tray

1. Place the certificate file at `ury/public/files/cert.pem`.
2. Update the signing key:
   - POS v2: `pos/privateKey.js`
   - POS v1: `urypos/privateKey.js`

### Network Printer

1. Set up CUPS for network printing.
2. Add printers in ERPNext **Network Printer Settings**.
3. Select the printer in the relevant **URY Room** for invoice printing.

---

## Step 13: Customer Search Index

URY uses Frappe global search for customer lookup. Build the index:

```bash
bench --site site-name build-search-index
bench --site site-name rebuild-global-search
```

---

## Step 14: Multiple Cashier Workflow

1. **Create Cashier User** — Assign the URY Cashier role.
2. **Assign Rooms** — Assign URY Rooms to users; users can only access POS for assigned rooms.
3. **Configure POS Profile** — Add cashiers under Applicable for Users; mark Main Cashier.
4. **Enable Multiple Cashier** in POS Profile.

### Daily Workflow

- **POS Opening** — Main cashier opens first, then sub-cashiers.
- **Order Processing** — Normal order taking.
- **Sub POS Closing** — Sub-cashiers create Sub POS Closing Entries.
- **POS Closing** — Main cashier creates the final POS Closing Entry.

---

## Step 15: URY Report Settings

Navigate to **URY Report Settings** and configure:

### Details

- **Extended Hours** — Enable if branch operates past midnight.
- **No of Hours** — Extended hours count.

### Daily P and L Settings

- **Buying Price List** — Price list used for COGS.
- **Direct Expenses** — Consumables and fixed direct expenses.
- **Indirect Expenses** — Electricity, fixed indirect expenses, percentage-based expenses.
- **Employee Costs** — Daily employee cost entries.
- **Depreciation** — Depreciation amount.

Daily gross salary cost is calculated from employee attendance. Set per employee under **Employee > Salary**:

- **Payment Type** — Salary or Daily Wage.
- **Payment Amount** — Corresponding amount.

Use the [Employee Attendance Tool](https://frappehr.com/docs/v14/en/employee-attendance-tool) to mark attendance.
