// Copyright (c) 2026, Tridz and contributors
// For license information, please see license.txt

frappe.query_reports["Aggregated Profit and Loss Report"] = {
	tree: true,
	name_field: "category",
	parent_field: "parent_category",
	initial_depth: 3,

	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			reqd: 1,
		},
		{
			fieldname: "to_date",
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
			only_select: 1
		},
	],

	onload(report) {
		if (
			window.location.pathname.includes(
				"/app/query-report/Aggregated%20Profit%20and%20Loss%20Report"
			)
		) {
			frappe.dom.set_style(
				`
				.report-summary {
					display: grid !important;
					grid-template-columns: repeat(3, 1fr) !important;
					gap: 20px 16px !important;
					align-items: center !important;
					justify-content: center !important;
					padding: 15px 20px !important;
				}

				@media (max-width: 575px) {
					.report-summary {
						grid-template-columns: repeat(2, 1fr) !important;
					}
				}

				.report-summary .summary-item {
					margin: 0 !important;
					min-width: 0 !important;
					max-width: none !important;
					width: 100% !important;
					text-align: center !important;
				}

				.report-summary .summary-label,
				.report-summary .summary-value {
					text-align: center !important;
				}
				`,
				"aggregated-pnl-report-summary-style"
			);
		}
	},

	formatter(value, row, column, data, default_formatter) {
		if (data && column.fieldname === "category") {
			column.is_tree = true;
		}

		value = default_formatter(value, row, column, data);

		if (data && (data.is_group || !data.parent_category)) {
			const $value = $("<span>")
				.html(value)
				.css("font-weight", "bold");

			if (
				data.warn_if_negative &&
				typeof data[column.fieldname] === "number" &&
				data[column.fieldname] < 0
			) {
				$value.addClass("text-danger");
			}

			return $("<div>").append($value).html();
		}

		return value;
	},
};