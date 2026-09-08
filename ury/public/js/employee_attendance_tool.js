frappe.ui.form.on('Employee Attendance Tool', {
	refresh(frm) {
		frm.set_df_property('status', 'options', ['', 'Present', 'Absent', 'Half Day']);
	},
	employee(frm) {
		if (frm.doc.employee && !frm.doc.branch) {
			frappe.db.get_value('Employee', frm.doc.employee, ['branch', 'company']).then(r => {
				if (r.message) {
					frm.set_value('branch', r.message.branch);
					frm.set_value('company', r.message.company);
				}
			});
		}
	}
});
