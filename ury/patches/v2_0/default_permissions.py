import frappe
from frappe.permissions import add_permission, update_permission_property
from frappe.core.doctype.doctype.doctype import validate_permissions_for_doctype


PERMISSION_KEYS = {
	"select", "read", "write", "create", "delete",
	"submit", "cancel", "amend", "print", "email",
	"report", "import", "export", "share"
}

def execute():
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
			("Account", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Accounts Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Address", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1,}),
			("Address Template", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Bank Reconciliation Tool", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Bin", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("BOM", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1}),
			("Branch", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Buying Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Company", {"permlevel": 0, "select": 1, "read": 1}),
			("Cost Center", {"permlevel": 0, "select": 1, "read": 1}),
			("Currency", {"permlevel": 0, "select": 1, "read": 1}),
			("Customer", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Customer Group", {"permlevel": 0, "select": 1, "read": 1}),
			("Employee", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("GL Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Item", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Item Group", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1,  "report": 1}),
			("Item Price", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Journal Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1}),
			("Landed Cost Voucher", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1}),
			("Material Request", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Mode of Payment", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Module Profile", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Payment Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Payment Ledger Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Payment Term", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Payment Terms Template", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("POS Closing Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1}),
			("POS Closing Entry", {"permlevel": 1, "read": 1, "write": 1}),
			("POS Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("POS Invoice Merge Log", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "cancel": 1}),
			("POS Opening Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1}),
			("POS Profile", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Prepared Report", {"permlevel": 0, "select": 1, "read": 1}),
			("Price List", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Production Plan", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1}),
			("Product Bundle", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "print": 1, "report": 1}),
			("Purchase Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Purchase Order", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Purchase Receipt", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Quality Goal", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Quality Review", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Role", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Role Profile", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Sales Invoice", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Sales Order", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Sales Taxes and Charges Template", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Stock Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1}),
			("Stock Entry Type", {"permlevel": 0, "select": 1, "read": 1}),
			("Stock Ledger Entry", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Stock Reconciliation", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "report": 1}),
			("Stock Settings", {"permlevel": 0, "select": 1, "read": 1}),
			("Supplier", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "report": 1}),
			("Supplier Group", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Tax Category", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Territory", {"permlevel": 0, "select": 1, "read": 1}),
			("UOM", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("User", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("User", {"permlevel": 1, "read": 1}),
			("Warehouse", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1}),
			("Work Order", {"permlevel": 0, "select": 1, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1}),
		],
	}

	for role, doctypes in permissions_map.items():
		for doctype, perms in doctypes:
			apply_permissions(doctype, role, perms)

	frappe.clear_cache()

def apply_permissions(doctype, role, perms):
	permlevel = perms.get("permlevel", 0)

	add_permission(doctype, role, permlevel)

	for ptype, value in perms.items():
		if ptype in PERMISSION_KEYS:
			update_permission_property(
				doctype=doctype,
				role=role,
				permlevel=permlevel,
				ptype=ptype,
				value=value,
				validate=False
			)

	validate_permissions_for_doctype(doctype)