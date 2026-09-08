frappe.ui.form.on('Attendance', {
	refresh(frm) {
		frm.set_df_property('status', 'options', ['', 'Present', 'Absent', 'Half Day']);
	}
});
