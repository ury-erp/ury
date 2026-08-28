// Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("URY Item Production Configuration", {
	refresh(frm) {
        frm.set_query("bom", function() {
            return {
                filters: {
                    item: frm.doc.item
                }
            };
        });
        frm.set_query("department", function() {
            return {
                filters: {
                    branch: frm.doc.branch
                }
            };
        });
        frm.set_query("production_unit", function() {
            return {
                filters: {
                    branch: frm.doc.branch
                }
            };
        });
	},
});
