// Copyright (c) 2026, Tridz and contributors
// For license information, please see license.txt

function toggle_customer_filter(report) {
	const order_type = report.get_filter_value("order_type");
	const branch = report.get_filter_value("branch");
	const customer_filter = report.get_filter("customer");
	if (customer_filter) {
		if (order_type === "Aggregators" && branch) {
			customer_filter.df.hidden = 0;
			customer_filter.df.reqd = 1;
		} else {
			report.set_filter_value("customer", "");
			customer_filter.df.hidden = 1;
			customer_filter.df.reqd = 0;
		}
		customer_filter.refresh();
	}
}

frappe.query_reports["Order Type Item Wise Sales"] = {
	"filters": [
		{
			fieldname: "start_date",
			label: __("From Date"),
			fieldtype: "Date",
			reqd: 1,
		},
		{
			fieldname: "end_date",
			label: __("To Date"),
			fieldtype: "Date",
			reqd: 1,
		},
		{
			fieldname: "branch",
			label: __("Branch"),
			fieldtype: "Link",
			options: "Branch",
			reqd: 1,
			only_select: 1,
			on_change: function() {
				toggle_customer_filter(frappe.query_report);
				frappe.query_report.refresh();
			}
		},
		{
			fieldname: "order_type",
			label: __("Order Type"),
			fieldtype: "Select",
			options: "\nDine In\nPhone In\nTake Away\nTable Takeaway\nDelivery\nAggregators",
			reqd: 0,
			on_change: function() {
				toggle_customer_filter(frappe.query_report);
				frappe.query_report.refresh();
			}
		},
		{
			fieldname: "customer",
			label: __("Customer"),
			fieldtype: "Link",
			options: "Customer",
			reqd: 0,
			hidden: 1,
			only_select: 1,
			get_query: function() {
				const branch = frappe.query_report.get_filter_value("branch");
				if (branch) {
					return {
						query: "ury.ury.report.order_type_item_wise_sales.order_type_item_wise_sales.get_aggregator_customers",
						filters: { branch: branch }
					};
				}
			}
		}
	],
	onload: function(report) {
		toggle_customer_filter(report);
	}
};
