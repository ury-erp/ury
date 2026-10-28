// Copyright (c) 2023, Tridz and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Pending KOTs"] = {
	"filters": [
		{
			"fieldname":"branch",
			"label": __("Branch"),
			"fieldtype":"Link",
			"options":"Branch",
			"reqd": 1,
			"default": function () {
				var defaultBranch = null;
				frappe.call({
					method: "ury.ury.hooks.user_access_utils.getBranch",
					async: false,
					callback: function (r) {
						if (r.message) {
							defaultBranch = r.message;
						} else if (r.exc) {
							console.error("Error fetching default branch:", r.exc);
						}
					},
					error: function (err) {
						console.error("Error in Frappe call:", err);
					}
				});
				return defaultBranch;
			}
		},
		
	]
};