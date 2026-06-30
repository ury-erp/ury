// Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('URY Report Settings', {
	refresh: function(frm) {
        frm.page.wrapper.find(".comment-box").css({'display':'none'});
		frm.set_query("buying_price_list", function() {
            return {
                "filters": {
                    "buying":1
                }
            }
        });
        if(frm.doc.__islocal){
            frm.clear_table('consumables');
            frm.add_child('consumables', {
                material:"Gas",
                cost_per_unit: 0.0
            });
            frm.add_child('consumables', {
                material:"Charcoal",
                cost_per_unit: 0.0
            });
            frm.refresh_field('consumables');
        }
	}
});
