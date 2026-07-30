import frappe


def execute():
	"""Pre-migration patch to sanitize quantity fields before altering schema from Data to Float."""
	if not frappe.db.table_exists("URY KOT Items"):
		return

	try:
		frappe.db.sql(
			"""
			UPDATE `tabURY KOT Items`
			SET cancelled_qty = '0'
			WHERE cancelled_qty IS NULL OR CAST(cancelled_qty AS CHAR) IN ('', 'None')
		"""
		)
		frappe.db.sql(
			"""
			UPDATE `tabURY KOT Items`
			SET quantity = '0'
			WHERE quantity IS NULL OR CAST(quantity AS CHAR) IN ('', 'None')
		"""
		)
	except Exception as e:
		frappe.log_error(f"clean_kot_item_qty patch warning: {e}")
