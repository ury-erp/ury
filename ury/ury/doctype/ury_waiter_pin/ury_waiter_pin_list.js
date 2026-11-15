frappe.listview_settings["URY Waiter PIN"] = {
	onload(listview) {
		listview.page.add_inner_button(__("New Waiter"), () => {
			const dialog = new frappe.ui.Dialog({
				title: __("New Waiter"),
				fields: [
					{ fieldname: "full_name", fieldtype: "Data", label: __("Name"), reqd: 1 },
					{ fieldname: "pin", fieldtype: "Password", label: __("PIN"), reqd: 1 },
					{ fieldname: "branch", fieldtype: "Link", options: "Branch", label: __("Branch"),
					  description: __("Leave empty if there is only one.") },
					{ fieldname: "pos_profile", fieldtype: "Link", options: "POS Profile", label: __("POS Profile"),
					  description: __("Leave empty if the branch has only one.") },
				],
				primary_action_label: __("Create"),
				primary_action(values) {
					frappe.call({
						method: "ury.ury.station.waiter.create_waiter",
						args: values,
						freeze: true,
						callback(r) {
							if (!r.message) return;
							dialog.hide();
							frappe.show_alert({ message: __("{0} can now sign in at a station.", [r.message.full_name]), indicator: "green" });
							listview.refresh();
						},
					});
				},
			});
			dialog.show();
		}).addClass("btn-primary");
	},
};
