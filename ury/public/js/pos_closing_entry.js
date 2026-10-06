frappe.ui.form.on('POS Closing Entry', {
    pos_opening_entry: function(frm) {
        frm.trigger("submit_stock_correction");
    },
    submit_stock_correction: function(frm) {
        if (frm.doc.pos_profile) {
            let closing_entry_doc = frm.doc.name;
            frappe.call({
                method: 'ury.ury.hooks.pos_closing.get_draft_stock_correction',
                args: {
                    pos_profile: frm.doc.pos_profile,
                    period_start_date: frm.doc.period_start_date,
                    period_end_date: frm.doc.period_end_date,
                    closing_entry: closing_entry_doc
                },
                callback: function(response) {
                    if (response.message == false) {
                        frappe.msgprint({
                            'title': 'Stock Correction Not Found',
                            'message': 'No draft stock correction found for this shift. You will not be able to save this entry until one is created.',
                            'indicator': 'red'
                        });
                        frm.set_value("draft_stock_correction", []);
                    } else if (response.message == true) {
                        // Stock correction submission not enabled for this profile
                    } else {
                        frm.set_value("draft_stock_correction", response.message);
                    }
                }
            });
        }
    }
});
