import frappe

# The four URY dashboard charts were renamed without the "URY " prefix; Dashboard Chart is not
# removed by the migrate reaper, so drop the old records here.
OLD = ("URY Sales Trend", "URY Order Type Split", "URY Payment Mode Split", "URY Top Items")


def execute():
	for name in OLD:
		if frappe.db.exists("Dashboard Chart", name):
			frappe.delete_doc("Dashboard Chart", name, force=True, ignore_permissions=True)
