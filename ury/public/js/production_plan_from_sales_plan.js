// BUG_LIST.md B05 — "Get Items from Sales Plan" button on Production Plan.
//
// Manual, low-risk alternative to an automatic Sales-Plan-submit hook (see
// PLAN.md Phase 2 item 5): the user opens a new Production Plan, clicks
// "Get Items From > Sales Plan", picks an Approved / Locked for Production
// URY Sales Plan, and this fills in company/posting_date/items for them to
// review before saving. Nothing is auto-submitted or auto-created.
frappe.ui.form.on("Production Plan", {
	refresh(frm) {
		// Cancelling a Production Plan that has a live linked URY Sales Plan
		// (custom_ury_sales_plan) surfaces it in ERPNext's own "Cancel All
		// Documents" cascade alongside its Work Orders. Cascading into the
		// Sales Plan is a dead end: that cascade calls doc.cancel() with no
		// way to supply the reason URY Sales Plan's own guard requires
		// (_guard_backward_transition), so it throws and the whole cascade
		// gets stuck with no way forward. The Sales Plan side has its own
		// guard (Block/Warn on a live Production Plan, see
		// ury_sales_plan.py) for exactly this -- once the Production Plan is
		// cancelled here (Work Orders cascade fine), the user cancels the
		// Sales Plan themselves, through its own UI, with a reason.
		frm.ignore_doctypes_on_cancel_all = Array.from(
			new Set([...(frm.ignore_doctypes_on_cancel_all || []), "URY Sales Plan"])
		);

		if (!frm.doc.__islocal) {
			// N5/N6: only meaningful once the plan exists and has po_items
			// with resolvable BOMs (i.e. saved/submitted, not a fresh draft
			// still being filled in via "Get Items From > Sales Plan" below).
			frm.add_custom_button(
				__("Generate Material Requests"),
				() => {
					frappe.call({
						method:
							"ury.ury.api.ury_production_plan_material_request.generate_material_requests_for_production_plan",
						args: { production_plan: frm.doc.name },
						freeze: true,
						freeze_message: __("Generating Material Requests..."),
						callback: (r) => {
							const data = r.message;
							if (!data) {
								return;
							}
							const purchaseCount = (data.purchase_material_requests || []).length;
							const transferCount = (data.transfer_material_requests || []).length;
							const skippedCount = (data.skipped_sufficient_stock || []).length;
							frappe.msgprint({
								title: __("Material Requests Generated"),
								indicator: "green",
								message: __(
									"Created {0} Purchase Material Request(s) and {1} Transfer Material Request(s). {2} item(s) skipped (sufficient department stock).",
									[purchaseCount, transferCount, skippedCount]
								),
							});
						},
					});
				},
				__("Create")
			);
			// The "Get Items From > Sales Plan" button below is only for
			// building up a fresh, unsaved Production Plan -- mirrors
			// ERPNext's own "Get Items From" buttons -- so nothing past
			// this point applies to an already-saved plan.
			return;
		}

		frm.add_custom_button(
			__("Sales Plan"),
			() => {
				frappe.prompt(
					{
						fieldname: "sales_plan",
						label: __("URY Sales Plan"),
						fieldtype: "Link",
						options: "URY Sales Plan",
						reqd: 1,
						get_query: () => ({
							filters: {
								status: ["in", ["Approved", "Locked for Production"]],
							},
						}),
					},
					(values) => {
						frappe.call({
							method: "ury.ury.api.ury_production_plan_adapter.get_items_from_sales_plan",
							args: { sales_plan: values.sales_plan },
							freeze: true,
							freeze_message: __("Fetching items from Sales Plan..."),
							callback: (r) => {
								const data = r.message;
								if (!data) {
									return;
								}
								if (data.company) {
									frm.set_value("company", data.company);
								}
								if (data.posting_date) {
									frm.set_value("posting_date", data.posting_date);
								}
								frm.clear_table("po_items");
								(data.items || []).forEach((item) => {
									const row = frm.add_child("po_items");
									row.item_code = item.item_code;
									row.bom_no = item.bom_no;
									row.planned_qty = item.planned_qty;
									row.stock_uom = item.stock_uom;
									row.planned_start_date = item.planned_start_date;
									row.warehouse = item.warehouse;
									row.custom_ury_department = item.custom_ury_department;
								});
								frm.refresh_field("po_items");
								frappe.show_alert({
									message: __("Fetched {0} item(s) from {1}", [
										(data.items || []).length,
										values.sales_plan,
									]),
									indicator: "green",
								});
							},
						});
					},
					__("Get Items From Sales Plan"),
					__("Get Items")
				);
			},
			__("Get Items From")
		);
	},
});
