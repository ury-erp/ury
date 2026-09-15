// BUG_LIST.md B05 — "Get Items from Sales Plan" button on Production Plan.
//
// Manual, low-risk alternative to an automatic Sales-Plan-submit hook (see
// PLAN.md Phase 2 item 5): the user opens a new Production Plan, clicks
// "Get Items From > Sales Plan", picks an Approved / Locked for Production
// URY Sales Plan, and this fills in company/posting_date/items for them to
// review before saving. Nothing is auto-submitted or auto-created.
frappe.ui.form.on("Production Plan", {
	refresh(frm) {
		if (!frm.doc.__islocal) {
			// Only offer this on a fresh, unsaved Production Plan -- mirrors
			// ERPNext's own "Get Items From" buttons, which are for building
			// up a new plan, not editing an existing one.
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
