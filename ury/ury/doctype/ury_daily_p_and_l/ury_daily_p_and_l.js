// Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('URY Daily P and L', {
	refresh: function(frm) {
		frm.page.wrapper.find(".comment-box").css({'display':'none'});
		//restrict adding rows
		frm.set_df_property('materials_consumed', 'cannot_add_rows', true);
		//restrict deleting rows
		frm.set_df_property('materials_consumed', 'cannot_delete_rows', true);
		if(frm.doc.docstatus === 1){
			set_html_data(frm)
			$('#ury-daily-p-and-l-profit_loss_tab-tab').click();
		}
	},
	onload: function(frm) {
		if (frm.doc.remarks !== "" && frm.doc.docstatus === 0){
			frm.set_value("remarks","");
		}
	},
	branch: function(frm){
		if(frm.doc.branch === ""){
			frm.set_value("materials_consumed",[])
		}
		else{
			frappe.db.exists('URY Report Settings', frm.doc.branch).then(report_settings_exist => {
				if(report_settings_exist){
					frm.set_value("materials_consumed",[])
					frappe.db.get_doc('URY Report Settings', frm.doc.branch).then(report_settings => {
						// Access the child table data from Report Settings
			
						report_settings.consumables.forEach(materials_data_item => {
						
							const newRow = frappe.model.add_child(frm.doc, 'materials_consumed');
				
							newRow.material = materials_data_item.material;
							newRow.cost_per_unit = materials_data_item.cost_per_unit;
							newRow.material = materials_data_item.material;
							
							// Save the current document
							frm.refresh_field('materials_consumed');
						})
					});
				}
				else{
					frappe.throw({
						title: __("Missing URY Report Settings"),
						message: __("Please set up URY Report Settings for the selected branch: <strong>{0}</strong>", [frm.doc.branch]),
					});					
					frm.set_value("materials_consumed",[])
				}
			});
		}
	},
	date: function(frm){
		set_electricity_closing(frm)
	}
});

function set_html_data(frm) {
	if (frm.doc.docstatus === 1) {
		frappe.call({
			method: "get_proft_loss_details",
			doc: frm.doc,
			callback: (r) => {
				frm.get_field("proft_loss_details").$wrapper.html(r.message);
			}
		});
	}
}

function set_electricity_closing(frm) {
	try{
		var current_date_obj = new Date(frm.doc.date);

		current_date_obj.setDate(current_date_obj.getDate() - 1);

		var previous_date = current_date_obj.toISOString().split('T')[0];
		if (frm.doc.branch && frm.doc.date){
			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: 'URY Daily P and L',
					fields: ['electricity_closing'],
					filters: {
						'branch': frm.doc.branch,
						'date': previous_date
					},
					order_by: 'creation desc',
				},
				callback: function(response) {
					if (response.message && response.message.length > 0) {
						frm.set_value("electricity_opening",response.message[0].electricity_closing)
					}
					else {
						frm.set_value("electricity_opening","")
					}
				}
			});
		}
	}
	catch(err){
		console.log("Last P and L not found")
	}
}

frappe.ui.form.on('URY P and L Materials', {
	units_consumed: function(frm, cdt, cdn) {
		var row = locals[cdt][cdn];
		row.amount = row.cost_per_unit*row.units_consumed
		frm.refresh_fields();
	}
});
