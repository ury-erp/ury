// Copyright (c) 2026, Tridz and contributors
// For license information, please see license.txt

frappe.query_reports["Monthly Purchase Trend and Cost Impact"] = {
	"filters": [
		{
			"fieldname": "year",
			"label": "Year",
			"fieldtype": "Select",
			"options": get_years(),
			"default": new Date().getFullYear(),
			"reqd": 1
		},
		{
			"fieldname": "month",
			"label": "Month",
			"fieldtype": "Select",
			"options": [
				"January",
				"February",
				"March",
				"April",
				"May",
				"June",
				"July",
				"August",
				"September",
				"October",
				"November",
				"December"
			],
			"default": frappe.datetime.str_to_obj(frappe.datetime.now_date()).toLocaleString('default',{month:'long'}),
			"reqd": 1
		},
		{
			"fieldname": "item_group",
			"label": "Item Group",
			"fieldtype": "Link",
			"options": "Item Group"
		},
		{
			"fieldname": "min_impact",
			"label": "Impact",
			"fieldtype": "Currency"
		}
	]
};

function get_years() {
	let years = [];
	let current = new Date().getFullYear();

	for (let i = current; i >= current - 10; i--) {
		years.push(i);
	}

	return years.join("\n");
}