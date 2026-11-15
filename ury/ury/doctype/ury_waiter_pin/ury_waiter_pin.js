frappe.ui.form.on("URY Waiter PIN", {
	refresh(frm) {
		frm.set_df_property("new_pin", "label", frm.is_new() ? __("PIN") : __("Change PIN"));
		frm.set_df_property("new_pin", "reqd", frm.is_new() ? 1 : 0);
	},
});
