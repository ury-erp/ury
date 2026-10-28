// Copyright (c) 2026, Tridz and contributors
// For license information, please see license.txt

frappe.query_reports["Last Purchase Price Hike"] = {
	"filters": [
		{
			"fieldname": "from_date",
			"label": "From Date",
			"fieldtype": "Date",
			"reqd": 1
		},
		{
			"fieldname": "to_date",
			"label": "To Date",
			"fieldtype": "Date",
			"reqd": 1
		}
	]
};
