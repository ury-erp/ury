// Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("URY POS Terminal", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}

		frm.add_custom_button(__("Generate Enrollment Code"), () => {
			frappe.call({
				method: "ury.ury.api.pos_pin.generate_terminal_enrollment_code",
				args: { terminal: frm.doc.name },
				freeze: true,
				freeze_message: __("Generating enrollment code…"),
				callback: (r) => {
					if (!r.message) {
						return;
					}
					const { terminal_id, code, expires_in_minutes } = r.message;
					frappe.msgprint({
						title: __("Terminal Enrollment Code"),
						indicator: "green",
						message: __(
							"Enter these on the device once, on the POS enrollment screen. The code expires in {0} minutes and can be used only once.<br><br><b>Terminal ID:</b> {1}<br><b>Code:</b> <code>{2}</code>",
							[expires_in_minutes, frappe.utils.escape_html(terminal_id), frappe.utils.escape_html(code)]
						),
					});
				},
			});
		});
	},
});
