// Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
// For license information, please see license.txt

frappe.ui.form.on("URY Table Reservation", {
	onload(frm) {
        if (frm.is_new()) {
            frm.set_value("reserved_by", frappe.session.user);
        }
    }
});
