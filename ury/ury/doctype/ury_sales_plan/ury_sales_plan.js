// Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('URY Sales Plan Item', {
	item_code: function(frm, cdt, cdn) {
		let row = frappe.get_doc(cdt, cdn);
		if (row.item_code && frm.doc.branch && frm.doc.company) {
			frappe.call({
				method: "ury.ury.api.ury_production_context.resolve_production_context",
				args: {
					item: row.item_code,
					branch: frm.doc.branch,
					company: frm.doc.company
				},
				callback: function(r) {
					if (r.message) {
						frappe.model.set_value(cdt, cdn, 'department', r.message.department);
						frappe.model.set_value(cdt, cdn, 'production_unit', r.message.production_unit);
						frappe.model.set_value(cdt, cdn, 'production_policy', r.message.production_policy);
						frappe.model.set_value(cdt, cdn, 'bom', r.message.bom);
					} else {
						// If no configuration is found, we might want to clear the fields or leave them as is
						frappe.model.set_value(cdt, cdn, 'department', '');
						frappe.model.set_value(cdt, cdn, 'production_unit', '');
						frappe.model.set_value(cdt, cdn, 'production_policy', '');
						frappe.model.set_value(cdt, cdn, 'bom', '');
					}
				}
			});
		}
	}
});
