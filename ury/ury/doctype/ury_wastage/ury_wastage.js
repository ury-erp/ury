// Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("URY Wastage", {
    department: function(frm) {
        if (frm.doc.department) {
            // Fetch default warehouse associated with the selected department
            frappe.db.get_value("URY Production Department", frm.doc.department, "department_warehouse", (r) => {
                if (r && r.department_warehouse) {
                    frm.set_value("warehouse", r.department_warehouse);
                }
            });
        }
    }
});
