// Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt
//
// Item 4d (sa-pos-followups-and-ux). This app has no existing report.js file
// to mirror a report-level-button convention from (none of the other
// Script Reports under ury/ury/report/ ship a .js file), so this follows
// Frappe's standard frappe.query_reports[...] onload pattern.

frappe.query_reports["Shared Raw Materials Across Departments"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			reqd: 1,
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "branch",
			label: __("Branch"),
			fieldtype: "Link",
			options: "Branch",
			reqd: 1,
		},
		{
			fieldname: "department",
			label: __("Department"),
			fieldtype: "Link",
			options: "URY Production Department",
		},
		{
			fieldname: "only_show_gaps",
			label: __("Only show gaps"),
			fieldtype: "Check",
			default: 1,
		},
	],

	onload(report) {
		report.page.add_inline_button(__("Create Transfer for Missing"), () => {
			const filters = report.get_values();
			if (!filters.company || !filters.branch) {
				frappe.msgprint(__("Company and Branch are required."));
				return;
			}

			frappe.call({
				method:
					"ury.ury.report.shared_raw_materials_across_departments.shared_raw_materials_across_departments.create_transfer_for_missing",
				args: {
					company: filters.company,
					branch: filters.branch,
					department: filters.department,
				},
				freeze: true,
				freeze_message: __("Creating draft Material Transfer(s)..."),
				callback(r) {
					const created = r.message || [];
					if (!created.length) {
						frappe.msgprint(__("No missing raw materials found -- nothing to transfer."));
						return;
					}
					frappe.msgprint(
						__("Created {0} draft Material Transfer(s): {1}", [
							created.length,
							created
								.map(
									(name) =>
										`<a href="/app/stock-entry/${name}">${name}</a>`
								)
								.join(", "),
						])
					);
				},
			});
		});
	},
};
