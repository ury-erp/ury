// Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('URY Print Job', {
    refresh: function(frm) {
        const indicator_map = {
            'COMPLETED': 'green',
            'PROCESSING': 'blue',
            'QUEUED': 'yellow',
            'PENDING': 'yellow',
            'SUBMITTED': 'yellow',
            'FAILED': 'red',
            'CANCELED': 'red',
            'CANCELLED': 'red'
        };
        if (frm.doc.status && indicator_map[frm.doc.status]) {
            frm.page.set_indicator(frm.doc.status, indicator_map[frm.doc.status]);
        }
    }
});
