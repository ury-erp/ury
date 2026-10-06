// Copyright (c) 2024, Tridz and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Correction", {
	
	onload: function (frm) {
	
		frm.add_fetch("item_code", "item_name", "item_name");
		if (frm.doc.docstatus === 0 && !frm.doc.amended_from)
			frm.set_value("period_end_date", frappe.datetime.now_datetime());

		frm.set_query("item_code", "items", function (doc, cdt, cdn) {
			return {
				query: "erpnext.controllers.queries.item_query",
				filters: {
					is_stock_item: 1,
				},
			};
		});
		
		if (frm.doc.company) {
			erpnext.queries.setup_queries(frm, "Warehouse", function () {
				return erpnext.queries.warehouse(frm.doc);
			});
		}
	},
	refresh: function (frm) {
		if (frappe.user.has_role('URY Manager')) {
			if (frm.doc.docstatus === 1) {
				// Hide "Correct This Entry" if a submitted entry with a later posting_date exists
				frappe.db.get_list('Stock Correction', {
					filters: [
						['docstatus', '=', 1],
						['posting_date', '>', frm.doc.posting_date],
						['set_warehouse', '=', frm.doc.set_warehouse]
					],
					fields: ['name'],
					limit: 1
				}).then(later_entries => {
					if (later_entries && later_entries.length > 0) {
						// A later entry exists — do not show the button
						return;
					}
					frm.add_custom_button(__('Correct This Entry'), function () {
						let docName = frm.doc.name;
						let originalDate = frm.doc.posting_date;
						let originalTime = frm.doc.posting_time;

						// Compute posting_time + 5 minutes
						let [h, m, s] = (originalTime || "00:00:00").split(":").map(Number);
						let totalSeconds = h * 3600 + m * 60 + (s || 0) + 300; // +5 minutes
						let newH = Math.floor(totalSeconds / 3600) % 24;
						let newM = Math.floor((totalSeconds % 3600) / 60);
						let newS = totalSeconds % 60;
						let newTime = [newH, newM, newS].map(v => String(v).padStart(2, '0')).join(':');

						frappe.new_doc('Stock Correction').then((doc) => {
							frm.set_value('reference_stock_correction', docName);
							frm.set_value('posting_date', originalDate);
							frm.set_value('edit_posting_date', 1);
							frm.set_value('posting_time', newTime);
							frappe.set_route('Form', 'Stock Correction', doc.name);
						});
					});
				});
			}
		}

		if(frm.doc.docstatus == 1 && frm.doc.correction_stock_entries && frm.doc.correction_stock_entries.length > 0) {
			frm.add_custom_button(__("Cancel Selected Stock Entry"), function() {
				// Show dialog to select the item to cancel
				show_cancel_dialog(frm);
			});
		  }

        
    },
    

	set_warehouse: function (frm) {
		let transaction_controller = new erpnext.TransactionController({ frm: frm });
		transaction_controller.autofill_warehouse(frm.doc.items, "warehouse", frm.doc.set_warehouse);
	},

	get_items: function (frm) {
		let fields = [
			{
				label: "Warehouse",
				fieldname: "warehouse",
				fieldtype: "Link",
				options: "Warehouse",
				reqd: 1,
				get_query: function () {
					return {
						filters: {
							company: frm.doc.company,
						},
					};
				},
			},
			{
				label: "Item Code",
				fieldname: "item_code",
				fieldtype: "Link",
				options: "Item",
			},
			{
				label: __("Ignore Empty Stock"),
				fieldname: "ignore_empty_stock",
				fieldtype: "Check",
			},
		];

		frappe.prompt(
			fields,
			function (data) {
				frappe.call({
					method: "ury.ury.doctype.stock_correction.stock_correction.get_items",
					args: {
						warehouse: data.warehouse,
						posting_date: frm.doc.posting_date,
						posting_time: frm.doc.posting_time,
						company: frm.doc.company,
						item_code: data.item_code,
						ignore_empty_stock: data.ignore_empty_stock,
					},
					callback: function (r) {
						if (r.exc || !r.message || !r.message.length) return;

						frm.clear_table("items");

						r.message.forEach((row) => {
							let item = frm.add_child("items");
							$.extend(item, row);

							item.qty = item.qty || 0;
							item.valuation_rate = item.valuation_rate || 0;
							item.use_serial_batch_fields = cint(
								frappe.user_defaults?.use_serial_batch_fields
							);
						});
						frm.refresh_field("items");
					},
				});
			},
			__("Get Items"),
			__("Update")
		);
	},

	fetch_template: function (frm) {
		if (!frm.doc.branch) {
			frappe.msgprint(__("Please select a Branch first."));
			return;
		}

		frappe.call({
			method: "ury.ury.doctype.document_template.document_template.get_document_template",
			args: {
				reference_doctype: "Stock Correction",
				branch: frm.doc.branch,
				warehouse: frm.doc.set_warehouse || "",
				posting_date: frm.doc.posting_date,
				posting_time: frm.doc.posting_time,
				company: frm.doc.company
			},
			callback: function (r) {
				if (!r.message) {
					frappe.msgprint(__("No document template found for Stock Correction."));
					return;
				}

				let template = r.message;
				if (!template.items || !template.items.length) {
					frappe.msgprint(__("The template '{0}' contains no items.", [template.template_name]));
					return;
				}

				let apply_items = function () {
					frm.clear_table("items");

					template.items.forEach((d) => {
						let child = frm.add_child("items");
						child.item_code = d.item_code;
						if (d.item_name) child.item_name = d.item_name;
						if (d.item_group) child.item_group = d.item_group;
						child.warehouse = d.warehouse || frm.doc.set_warehouse;
						if (d.uom) child.uom = d.uom;
						child.qty = d.qty !== undefined ? flt(d.qty) : 0.0;
						child.valuation_rate = d.valuation_rate !== undefined ? flt(d.valuation_rate) : 0.0;
						child.amount = d.amount !== undefined ? flt(d.amount) : 0.0;
						child.current_qty = d.current_qty !== undefined ? flt(d.current_qty) : 0.0;
						child.current_amount = d.current_amount !== undefined ? flt(d.current_amount) : 0.0;
						child.current_valuation_rate = d.current_valuation_rate !== undefined ? flt(d.current_valuation_rate) : 0.0;
						child.quantity_difference = d.quantity_difference !== undefined ? flt(d.quantity_difference) : 0.0;
						child.amount_difference = d.amount_difference !== undefined ? flt(d.amount_difference) : 0.0;
					});

					frm.refresh_field("items");
					frappe.show_alert({
						message: __("Template '{0}' applied with {1} item(s).", [template.template_name, template.items.length]),
						indicator: "green"
					});
				};

				if (frm.doc.items && frm.doc.items.length > 0) {
					frappe.confirm(
						__("Applying template will clear existing items. Do you want to proceed?"),
						function () {
							apply_items();
						}
					);
				} else {
					apply_items();
				}
			}
		});
	},

	posting_date: function (frm) {
		frm.trigger("set_valuation_rate_and_qty_for_all_items");
	},

	posting_time: function (frm) {
		frm.trigger("set_valuation_rate_and_qty_for_all_items");
	},

	set_valuation_rate_and_qty_for_all_items: function (frm) {
		frm.doc.items.forEach((row) => {
			frm.events.set_valuation_rate_and_qty(frm, row.doctype, row.name);
		});
	},

	set_valuation_rate_and_qty: function (frm, cdt, cdn) {
		var d = frappe.model.get_doc(cdt, cdn);

		if (d.item_code && d.warehouse) {
			frappe.call({
				method: "ury.ury.doctype.stock_correction.stock_correction.get_stock_balance_for",
				args: {
					item_code: d.item_code,
					warehouse: d.warehouse,
					posting_date: frm.doc.posting_date,
					posting_time: frm.doc.posting_time,
					row: d,
				},
				callback: function (r) {
					const row = frappe.model.get_doc(cdt, cdn);
					frappe.model.set_value(cdt, cdn, "current_qty", r.message.qty);
				},
			});
		}
	},

	set_amount_quantity: function (doc, cdt, cdn) {
		var d = frappe.model.get_doc(cdt, cdn);
		if (d.qty && d.valuation_rate) {
			valuation_rate = parseFloat(d.valuation_rate).toFixed(2); // Rounding to 2 decimal places
			frappe.model.set_value(cdt, cdn, "amount", flt(d.qty) * flt(valuation_rate));
			frappe.model.set_value(cdt, cdn, "quantity_difference", flt(d.qty) - flt(d.current_qty));
			frappe.model.set_value(cdt, cdn, "amount_difference", flt(d.amount) - flt(d.current_amount));
		}
	},
	set_basic_rate: function (frm, cdt, cdn) {
		const item = locals[cdt][cdn];
		item.transfer_qty = flt(item.qty) * flt(item.conversion_factor);

		const args = {
			item_code: item.item_code,
			posting_date: frm.doc.posting_date,
			posting_time: frm.doc.posting_time,
			warehouse: cstr(item.warehouse),
			company: frm.doc.company,
			qty: item.qty,
			allow_zero_valuation: 0,
		};

		if (item.item_code) {
			frappe.call({
				method: "erpnext.stock.utils.get_incoming_rate",
				args: {
					args: args,
				},
				callback: function (r) {
					const row = frappe.model.get_doc(cdt, cdn);
					valuation_rate = parseFloat(r.message).toFixed(2); // Rounding to 2 decimal places
					frappe.model.set_value(cdt, cdn, "valuation_rate", r.message );
					frappe.model.set_value(cdt, cdn, "current_valuation_rate", r.message);
					frappe.model.set_value(cdt, cdn, "current_amount", r.message * row.current_qty);
					frappe.model.set_value(cdt, cdn, "amount", row.qty * row.valuation_rate);
				},
			});
		}
	},
	
});

frappe.ui.form.on("Stock Correction Item", {
	warehouse: function (frm, cdt, cdn) {
		frm.events.set_valuation_rate_and_qty(frm, cdt, cdn);
	},

	item_code: function (frm, cdt, cdn) {
		var child = locals[cdt][cdn];
		if (child.batch_no && !frm.doc.scan_mode) {
			frappe.model.set_value(cdt, cdn, "batch_no", "");
		}
		frm.events.set_basic_rate(frm, cdt, cdn);
		frm.events.set_valuation_rate_and_qty(frm, cdt, cdn);
		
	},
	qty: function (frm, cdt, cdn) {
		frm.events.set_amount_quantity(frm, cdt, cdn);
	},

	valuation_rate: function (frm, cdt, cdn) {
		frm.events.set_amount_quantity(frm, cdt, cdn);
	},

	
	items_add: function (frm, cdt, cdn) {
		var item = frappe.get_doc(cdt, cdn);
		if (!item.warehouse && frm.doc.set_warehouse) {
			frappe.model.set_value(cdt, cdn, "warehouse", frm.doc.set_warehouse);
		}

	},

});

function show_cancel_dialog(frm) {
	// Create a list of items with their stock entries
	let items = [];
	frm.doc.correction_stock_entries.forEach(item => {
		if(item.stock_entry) {
			items.push({
				item_name: item.item_code,
				stock_entry: item.stock_entry
			});
		}
	});
	
	if(items.length === 0) {
		frappe.msgprint(__("No stock entries found to cancel."));
		return;
	}
	
	let d = new frappe.ui.Dialog({
		title: __("Select Stock Entry to Cancel"),
		fields: [
			{
				label: __("Select Items to Cancel"),
				fieldname: "selected_item",
				fieldtype: "Table",
				cannot_add_rows: true,
				cannot_delete_rows: true,
				in_place_edit: true,
				data: items,
				get_data: () => {
					return items;
				},
				fields: [
					{
						fieldname: "item_name",
						fieldtype: "Data",
						label: __("Item Name"),
						in_list_view: 1,
						columns: 2,
						read_only: 1
					},
					{
						fieldname: "stock_entry",
						fieldtype: "Data",
						label: __("Stock Entry"),
						in_list_view: 1,
						columns: 3,
						read_only: 1
					}
				]
			}
		],
		primary_action_label: __("Cancel Selected"),
		primary_action(values) {
			let selected = d.fields_dict.selected_item.grid.get_selected_children();
			
			if(selected.length === 0) {
				frappe.msgprint(__("Please select at least one item to cancel."));
				return;
			}
			
			frappe.confirm(
				__("Are you sure you want to cancel the selected stock entries?"),
				function() {
					frappe.call({
						method: "ury.ury.doctype.stock_correction.stock_correction.cancel_selected_stock_entries",
						args: {
							doc_name: frm.doc.name,
							entries: selected
						},
						freeze: true,
						freeze_message: __("Cancelling selected stock entries..."),
						callback: function(r) {
							if(r.message) {
								frappe.msgprint(__("Selected stock entries have been cancelled."));
								frm.reload_doc();
							}
						}
					});
					d.hide();
				}
			);
		}
	});
	d.show();
  }
erpnext.stock.StockCorrection = class StockCorrection extends erpnext.stock.StockController {
	setup() {
		this.setup_posting_date_time_check();
	}

};

cur_frm.cscript = new erpnext.stock.StockCorrection({ frm: cur_frm });