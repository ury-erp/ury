//  Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
//  For license information, please see license.txt

// frappe.ui.form.on('URY Table', {
// 	// refresh: function(frm) {

// 	// }
// });

frappe.ui.form.on('URY Table', {
    refresh(frm) {
        frm.set_query('restaurant_room', function () {
            if (!frm.doc.branch) {
                return {
                    filters: {
                        name: ['=', '']
                    }
                };
            }
            return {
                filters: {
                    branch: frm.doc.branch
                }
            };
        });
    },

    branch(frm) {
        // Clear room when restaurant changes
        frm.set_value('restaurant_room', null);
    }
});
