// Copyright (c) 2024, Tridz and contributors
// For license information, please see license.txt

frappe.query_reports["Food Cost Yesterday"] = {
	"filters": [
		{
			"fieldname":"branch",
			"label": __("Branch"),
			"fieldtype": "Link",
			"options":"Branch",
			"reqd": 1
		}
	]
};
