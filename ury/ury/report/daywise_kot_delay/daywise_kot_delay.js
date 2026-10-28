// Copyright (c) 2024, Tridz and contributors
// For license information, please see license.txt

frappe.query_reports["Daywise KOT Delay"] = {
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
	  {
		"fieldname":"from_date",
		"label": __("From Date"),
		"fieldtype":"Date",
		"reqd": 1
	  },
	  {
		"fieldname":"to_date",
		"label": __("To Date"),
		"fieldtype":"Date",
		"reqd": 1
	  },
	  
	]
};
