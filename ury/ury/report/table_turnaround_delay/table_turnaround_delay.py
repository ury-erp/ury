import frappe
from datetime import datetime, timedelta


def execute(filters=None):
	"""Generate Table Turnaround Delay Report.

	Lists draft, unprinted POS Invoices created today whose time since creation
	exceeds the table_attention_time threshold from the POS Profile for the branch.

	Args:
		filters: dict with 'branch' key (mandatory)

	Returns:
		(columns, data) where:
		- columns: list of column definitions
		- data: list of rows showing invoices with delayed table turnaround
	"""
	branch = filters.get("branch")
	if not branch:
		frappe.throw("Branch is required.")

	# Get POS Profile for the branch
	pos_profile_name = frappe.db.exists("POS Profile", {"branch": branch})
	if not pos_profile_name:
		frappe.throw(f"No POS Profile found for branch: {branch}")

	pos_prof = frappe.get_doc("POS Profile", pos_profile_name)

	# Get the table attention time threshold (in minutes)
	table_attention_time = pos_prof.table_attention_time
	if not table_attention_time:
		frappe.throw("table_attention_time is not set in the POS Profile for this branch.")

	# Get today's date
	today = frappe.utils.today()

	# Query for draft, unprinted POS Invoices created today
	invoices = frappe.db.sql('''
		SELECT
			pi.name AS "invoice_name",
			pi.posting_date AS "posting_date",
			pi.posting_time AS "posting_time",
			pi.creation AS "creation",
			pi.restaurant_table AS "restaurant_table",
			pi.waiter AS "waiter",
			pi.grand_total AS "grand_total",
			EXTRACT(EPOCH FROM (NOW() - pi.creation)) / 60 AS "elapsed_minutes"
		FROM `tabPOS Invoice` pi
		WHERE
			pi.docstatus = 0
			AND pi.invoice_printed = 0
			AND DATE(pi.creation) = %(today)s
			AND pi.branch = %(branch)s
		ORDER BY
			pi.creation ASC
	''', {"today": today, "branch": branch}, as_dict=True)

	# Filter invoices where elapsed time exceeds the threshold
	data = []
	for invoice in invoices:
		# Calculate elapsed time in minutes from creation to now
		elapsed_minutes = invoice.get("elapsed_minutes")
		if elapsed_minutes and elapsed_minutes > table_attention_time:
			# Format time for display
			created_time = invoice.get("creation")
			if isinstance(created_time, str):
				created_dt = datetime.fromisoformat(created_time)
			else:
				created_dt = created_time

			# Format creation time as HH:MM AM/PM
			created_time_str = created_dt.strftime("%I:%M %p")

			data.append({
				"Invoice": invoice.get("invoice_name"),
				"Table": invoice.get("restaurant_table"),
				"Created At": created_time_str,
				"Elapsed Minutes": int(round(elapsed_minutes)),
				"Waiter": invoice.get("waiter"),
				"Total": invoice.get("grand_total")
			})

	columns = [
		{"label": "Invoice", "fieldname": "Invoice", "fieldtype": "Link", "options": "POS Invoice", "width": 120},
		{"label": "Table", "fieldname": "Table", "fieldtype": "Data", "width": 100},
		{"label": "Created At", "fieldname": "Created At", "fieldtype": "Data", "width": 100},
		{"label": "Elapsed Minutes", "fieldname": "Elapsed Minutes", "fieldtype": "Int", "width": 120},
		{"label": "Waiter", "fieldname": "Waiter", "fieldtype": "Data", "width": 100},
		{"label": "Total", "fieldname": "Total", "fieldtype": "Currency", "width": 100}
	]

	return columns, data
