import frappe

def add_default_permissions():
	print("Configuring ury role permissions...")
	permissions_map = {
		"URY Captain": [
			("Account", {"permlevel": 0, "select": 1, "read": 1}),
			("Accounts Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Bin", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("BOM", {"permlevel": 0, "select": 1, "read": 1}),
			("Branch", {"permlevel": 0, "select": 1, "read": 1}),
			("Company", {"permlevel": 0, "select": 1, "read": 1}),
			("Cost Center", {"permlevel": 0, "select": 1, "read": 1}),
			("Currency", {"permlevel": 0, "select": 1, "read": 1}),
			("Customer", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Customer Group", {"permlevel": 0, "select": 1, "read": 1}),
			("Item", {"permlevel": 0, "select": 1, "read": 1}),
			("Item Price", {"permlevel": 0, "select": 1, "read": 1}),
			("Mode of Payment", {"permlevel": 0, "select": 1, "read": 1}),
			("POS Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1}),
			("POS Opening Entry", {"permlevel": 0, "select": 1, "read": 1}),
			("POS Profile", {"permlevel": 0, "select": 1, "read": 1}),
			("Price List", {"permlevel": 0, "select": 1, "read": 1}),
			("Product Bundle", {"permlevel": 0, "select": 1, "read": 1}),
			("Quality Goal", {"permlevel": 0, "select": 1, "read": 1}),
			("Quality Review", {"permlevel": 0, "select": 1, "read": 1, "create": 1}),
			("Sales Taxes and Charges Template", {"permlevel": 0, "select": 1, "read": 1}),
			("Stock Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Territory", {"permlevel": 0, "select": 1, "read": 1}),
			("UOM", {"permlevel": 0, "select": 1, "read": 1}),
			("User", {"permlevel": 0, "select": 1, "read": 1}),
			("User", {"permlevel": 1, "read": 1, "write": 1}),
			("Warehouse", {"permlevel": 0, "select": 1, "read": 1}),
		],

		"URY Cashier": [
			("Account", {"permlevel": 0, "select": 1, "read": 1}),
			("Accounts Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Bin", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("BOM", {"permlevel": 0, "select": 1, "read": 1}),
			("Branch", {"permlevel": 0, "select": 1, "read": 1}),
			("Buying Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Company", {"permlevel": 0, "select": 1, "read": 1}),
			("Cost Center", {"permlevel": 0, "select": 1, "read": 1}),
			("Currency", {"permlevel": 0, "select": 1, "read": 1}),
			("Customer", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Customer Group", {"permlevel": 0, "select": 1, "read": 1}),
			("Fiscal Year", {"permlevel": 0, "select": 1, "read": 1}),
			("Item", {"permlevel": 0, "select": 1, "read": 1}),
			("Item Group", {"permlevel": 0, "select": 1, "read": 1}),
			("Item Price", {"permlevel": 0, "select": 1, "read": 1}),
			("Mode of Payment", {"permlevel": 0, "select": 1, "read": 1}),
			("POS Closing Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1}),
			("POS Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1}),
			("POS Invoice Merge Log", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1}),
			("POS Opening Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1}),
			("POS Profile", {"permlevel": 0, "select": 1, "read": 1}),
			("Price List", {"permlevel": 0, "select": 1, "read": 1}),
			("Print Format", {"permlevel": 0, "select": 1, "read": 1}),
			("Product Bundle", {"permlevel": 0, "select": 1, "read": 1}),
			("Quality Goal", {"permlevel": 0, "select": 1, "read": 1}),
			("Quality Review", {"permlevel": 0, "select": 1, "read": 1, "create": 1}),
			("Role", {"permlevel": 0, "select": 1, "read": 1}),
			("Sales Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1}),
			("Sales Taxes and Charges Template", {"permlevel": 0, "select": 1, "read": 1}),
			("Stock Ledger Entry", {"permlevel": 0, "select": 1, "read": 1}),
			("Stock Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Tax Rule", {"permlevel": 0, "select": 1, "read": 1}),
			("Territory", {"permlevel": 0, "select": 1, "read": 1}),
			("UOM", {"permlevel": 0, "select": 1, "read": 1}),
			("User", {"permlevel": 0, "select": 1, "read": 1}),
			("User", {"permlevel": 1, "read": 1, "write": 1}),
			("Warehouse", {"permlevel": 0, "select": 1, "read": 1}),
		],


		"URY Manager": [
			("Account", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "share": 1}),
			("Accounts Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Accounts Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Address", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Address Template", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1, "export": 1, "share": 1}),
			("Bank Reconciliation Tool", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Bin", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("BOM", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "import": 1, "export": 1, "share": 1}),
			("Branch", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Buying Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Company", {"permlevel": 0, "select": 1, "read": 1}),
			("Cost Center", {"permlevel": 0, "select": 1, "read": 1}),
			("Currency", {"permlevel": 0, "select": 1, "read": 1}),
			("Customer", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "share": 1}),
			("Customer Group", {"permlevel": 0, "select": 1, "read": 1}),
			("Employee", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("GL Entry", {"permlevel": 0, "select": 1, "read": 1, "print": 1, "report": 1, "share": 1}),
			("Item", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Item Group", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Item Price", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Journal Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "import": 1, "export": 1, "share": 1}),
			("Landed Cost Voucher", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "import": 1, "export": 1, "share": 1}),
			("Material Request", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Mode of Payment", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Module Profile", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Payment Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "import": 1, "export": 1, "share": 1}),
			("Payment Ledger Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1, "export": 1}),
			("Payment Term", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Payment Terms Template", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export" : 1, "share": 1}),
			("POS Closing Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("POS Closing Entry", {"permlevel": 1, "read": 1, "write": 1}),
			("POS Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "share": 1}),
			("POS Invoice Merge Log", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "cancel": 1}),
			("POS Opening Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("POS Profile", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Prepared Report", {"permlevel": 0, "select": 1, "read": 1}),
			("Price List", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Production Plan", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1}),
			("Product Bundle", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Purchase Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "import": 1, "export": 1, "share": 1}),
			("Purchase Order", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Purchase Receipt", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "import": 1, "export": 1, "share": 1}),
			("Quality Goal", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Quality Review", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Role", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Role Profile", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Sales Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1}),
			("Sales Order", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Sales Taxes and Charges Template", {"permlevel": 0, "select": 1, "read": 1}),
			("Stock Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Stock Entry Type", {"permlevel": 0, "select": 1, "read": 1}),
			("Stock Entry Type", {"permlevel": 0, "select": 1, "read": 1, "print": 1, "report": 1, "share": 1}),
			("Stock Ledger Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "share": 1}),
			("Stock Reconciliation", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1, "import": 1, "export": 1, "share": 1}),
			("Stock Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Supplier", {"permlevel": 0, "select": 1, "read": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Supplier Group", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Territory", {"permlevel": 0, "select": 1, "read": 1}),
			("UOM", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("User", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("User", {"permlevel": 1, "read": 1}),
			("Warehouse", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1, "share": 1}),
			("Work Order", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1}),
		],
	}

	for role, doctypes in permissions_map.items():
		for doctype, perms in doctypes:
			add_role_permissions(doctype, role, perms)

	frappe.clear_cache()

def add_role_permissions(doctype, role, perms):
	permlevel = perms.get("permlevel", 0)

	if frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": permlevel}):
		update_permission_flags(doctype, role, perms)
		return

	frappe.permissions.add_permission(doctype, role, permlevel=permlevel)

	update_permission_flags(doctype, role, perms)

def update_permission_flags(doctype, role, perms):
	permlevel = perms.get("permlevel", 0)

	name = frappe.db.get_value(
		"Custom DocPerm",
		{"parent": doctype, "role": role, "permlevel": permlevel},
		"name")

	if not name:
		return

	doc = frappe.get_doc("Custom DocPerm", name)

	for key, val in perms.items():
		if key in ["permlevel", "select", "read", "write", "create", "delete", "submit", "cancel", "amend", "print", "email", "report", "import", "export", "share"]:
			setattr(doc, key, max(getattr(doc, key, 0), val))

	doc.save(ignore_permissions=True)