frappe.ui.form.on('POS Opening Entry', {
    pos_profile: function(frm) {
        if (frm.doc.pos_profile) {
            frappe.db.get_value('POS Profile', frm.doc.pos_profile, ['custom_enable_multiple_cashier', 'restaurant', 'branch'])
                .then(r => {
                    if (r.message) {
                        // If multiple cashier is enabled OR the profile has a restaurant/branch set, make them mandatory
                        let is_ury_pos = r.message.custom_enable_multiple_cashier || r.message.restaurant || r.message.branch;
                        frm.set_df_property('restaurant', 'reqd', is_ury_pos ? 1 : 0);
                        frm.set_df_property('branch', 'reqd', is_ury_pos ? 1 : 0);
                    }
                });
        } else {
            frm.set_df_property('restaurant', 'reqd', 0);
            frm.set_df_property('branch', 'reqd', 0);
        }
    },
    refresh: function(frm) {
        if (frm.doc.pos_profile) {
            frm.trigger('pos_profile');
        }
    }
});
