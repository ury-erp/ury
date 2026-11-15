frappe.ui.form.on("URY Station", {
	refresh(frm) {
		if (frm.is_new()) return;

		frm.add_custom_button(__("Activate a Screen"), () => {
			frm.call("new_activation_code").then((r) => {
				const { code, minutes } = r.message;
				frappe.msgprint({
					title: __("Activation Code"),
					indicator: "blue",
					message: __(
						"On the screen, open <b>/station</b>, enter station code <b>{0}</b> and this code:<br><br><span style='font-size:2rem;letter-spacing:.3em'><b>{1}</b></span><br><br>It works once and expires in {2} minutes. Activating a new screen signs the old one out of this station.",
						[frm.doc.code, code, minutes]
					),
				});
			});
		});

		if (frm.doc.device_activated_on) {
			frm.add_custom_button(__("Deactivate Screen"), () => {
				frappe.confirm(__("Waiters will not be able to sign in at this screen until it is activated again. Continue?"), () =>
					frm.call("deactivate_screen").then(() => frm.reload_doc())
				);
			});
		}
		if (frm.doc.locked_until && frappe.datetime.get_datetime_as_string() < frm.doc.locked_until) {
			frm.add_custom_button(__("Unlock Now"), () => frm.call("unlock").then(() => frm.reload_doc()));
		}
	},
});
