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

        ury_check_bom_components_stocked(frm);
	},
	item(frm) {
		ury_check_bom_components_stocked(frm);
	},
	bom(frm) {
		ury_check_bom_components_stocked(frm);
	},
	department(frm) {
		ury_check_bom_components_stocked(frm);
	},
	production_unit(frm) {
		ury_check_bom_components_stocked(frm);
	},
});

// Item 4 (G-13, sa-pos-followups-and-ux §5.2 B-2): a proactive, non-blocking
// warning that some of this MADE_TO_ORDER item's BOM components are not
// stocked in the warehouse this item will actually issue from. This is a
// WARNING only -- zero stock is legitimate before the first transfer -- it
// never prevents saving the configuration (see B-3: the near-dead
// validate-time cross-department throw was retired in favour of this).
function ury_check_bom_components_stocked(frm) {
	frm.dashboard.clear_headline();

	if (frm.is_new() || frm.doc.production_policy !== "MADE_TO_ORDER") {
		return;
	}
	if (!frm.doc.item || !frm.doc.branch || !frm.doc.bom) {
		return;
	}

	frappe.call({
		method: "ury.ury.api.ury_production_context.check_bom_components_stocked",
		args: {
			item: frm.doc.item,
			branch: frm.doc.branch,
			department: frm.doc.department,
			bom: frm.doc.bom,
		},
		callback: function (r) {
			const data = r.message || {};
			const warehouse = data.warehouse;
			const components = data.components || [];
			if (!warehouse || !components.length) {
				return;
			}

			const missing = components.filter((c) => !c.has_bin);
			if (!missing.length) {
				return;
			}

			const missing_names = missing.map((c) => c.item_code).join(", ");
			const message = __(
				"{0} of {1} ingredients are not stocked in {2}, the warehouse this item's ingredients are issued from: {3}. Transfer them in from your central store before this item can be ordered.",
				[missing.length, components.length, warehouse, missing_names]
			);

			frm.dashboard.set_headline_alert(
				`<div class="row">
					<div class="col-sm-9">
						<span>${message}</span>
					</div>
					<div class="col-sm-3 text-right">
						<button class="btn btn-xs btn-warning" onclick="ury_create_stock_entry_for_missing(cur_frm, '${warehouse}', ${JSON.stringify(
					missing.map((c) => c.item_code)
				).replace(/"/g, "&quot;")})">
							${__("Create Stock Entry")}
						</button>
					</div>
				</div>`,
				"orange"
			);
		},
	});
}

// eslint-disable-next-line no-unused-vars
function ury_create_stock_entry_for_missing(frm, warehouse, missing_items) {
	frappe.model.with_doctype("Stock Entry", function () {
		const stock_entry = frappe.model.get_new_doc("Stock Entry");
		stock_entry.stock_entry_type = "Material Transfer";
		stock_entry.purpose = "Material Transfer";

		(missing_items || []).forEach(function (item_code) {
			const row = frappe.model.add_child(stock_entry, "Stock Entry Detail", "items");
			row.item_code = item_code;
			row.t_warehouse = warehouse;
			row.qty = 1;
		});

		frappe.set_route("Form", "Stock Entry", stock_entry.name);
	});
}
