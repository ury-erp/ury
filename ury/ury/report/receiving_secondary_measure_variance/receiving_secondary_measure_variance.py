import frappe


def execute(filters=None):
	"""Receiving Secondary-Measure Variance report.

	Surfaces Purchase Receipt Item rows where a secondary measure (e.g. weight
	per bird, pieces per kg) was captured at receiving, so buyers/QA can spot
	items landing outside expected spec.

	Args:
		filters: dict, optional. Supported keys: company, warehouse, item_code,
			supplier, from_date, to_date, off_spec_only.

	Returns:
		(columns, data) tuple expected by Frappe Script Reports.
	"""
	filters = filters or {}
	conditions, values = get_conditions(filters)

	data = frappe.db.sql(
		f"""
		SELECT
			pr.posting_date AS posting_date,
			pr.supplier AS supplier,
			pri.item_code AS item_code,
			pri.item_name AS item_name,
			pri.qty AS stock_qty,
			pri.custom_rcv_item_secondary_measure AS secondary_measure,
			pri.custom_rcv_expected_secondary_qty AS expected_secondary_qty,
			pri.custom_rcv_secondary_qty AS actual_secondary_qty,
			pri.custom_rcv_actual_secondary_per_stock_unit AS actual_per_stock_unit,
			pri.custom_rcv_variance_pct AS variance_pct,
			pri.custom_rcv_off_spec AS off_spec,
			pri.custom_rcv_variance_reason AS variance_reason
		FROM `tabPurchase Receipt` pr
		JOIN `tabPurchase Receipt Item` pri ON pri.parent = pr.name
		WHERE
			pr.docstatus = 1
			AND pri.custom_rcv_secondary_qty > 0
			{conditions}
		ORDER BY pr.posting_date DESC, pr.name DESC
		""",
		values,
		as_dict=True,
	)

	columns = get_columns()
	return columns, data


def get_conditions(filters):
	conditions = []
	values = {}

	if filters.get("company"):
		conditions.append("AND pr.company = %(company)s")
		values["company"] = filters.get("company")

	if filters.get("warehouse"):
		conditions.append("AND pri.warehouse = %(warehouse)s")
		values["warehouse"] = filters.get("warehouse")

	if filters.get("item_code"):
		conditions.append("AND pri.item_code = %(item_code)s")
		values["item_code"] = filters.get("item_code")

	if filters.get("supplier"):
		conditions.append("AND pr.supplier = %(supplier)s")
		values["supplier"] = filters.get("supplier")

	if filters.get("from_date"):
		conditions.append("AND pr.posting_date >= %(from_date)s")
		values["from_date"] = filters.get("from_date")

	if filters.get("to_date"):
		conditions.append("AND pr.posting_date <= %(to_date)s")
		values["to_date"] = filters.get("to_date")

	if filters.get("off_spec_only"):
		conditions.append("AND pri.custom_rcv_off_spec = 1")

	return "\n\t\t\t".join(conditions), values


def get_columns():
	return [
		{"label": "Posting Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
		{"label": "Supplier", "fieldname": "supplier", "fieldtype": "Link", "options": "Supplier", "width": 150},
		{"label": "Item", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 120},
		{"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 150},
		{"label": "Stock Qty", "fieldname": "stock_qty", "fieldtype": "Float", "width": 100},
		{"label": "Secondary Measure", "fieldname": "secondary_measure", "fieldtype": "Data", "width": 130},
		{"label": "Expected Secondary Qty", "fieldname": "expected_secondary_qty", "fieldtype": "Float", "width": 150},
		{"label": "Actual Secondary Qty", "fieldname": "actual_secondary_qty", "fieldtype": "Float", "width": 150},
		{"label": "Actual per Stock Unit", "fieldname": "actual_per_stock_unit", "fieldtype": "Float", "width": 150},
		{"label": "Variance %", "fieldname": "variance_pct", "fieldtype": "Percent", "width": 100},
		{"label": "Off-Spec", "fieldname": "off_spec", "fieldtype": "Check", "width": 80},
		{"label": "Variance Reason", "fieldname": "variance_reason", "fieldtype": "Data", "width": 180},
	]
