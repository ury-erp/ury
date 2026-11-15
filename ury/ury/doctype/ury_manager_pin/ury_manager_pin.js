frappe.ui.form.on("URY Manager PIN", {
	refresh(frm) {
		frm.set_df_property("new_pin", "label", frm.is_new() ? __("Approval PIN") : __("Change Approval PIN"));
		frm.set_df_property("new_pin", "reqd", frm.is_new() ? 1 : 0);
		frm.set_query("user", () => ({
			query: "frappe.core.doctype.user.user.user_query",
			filters: { ignore_user_type: 1 },
		}));
	},
});
