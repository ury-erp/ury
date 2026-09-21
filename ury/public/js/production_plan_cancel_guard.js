// Cancelling a Production Plan that has a live linked URY Sales Plan
// (custom_ury_sales_plan) surfaces it in ERPNext's own "Cancel All
// Documents" cascade alongside its Work Orders. Cascading into the Sales
// Plan is a dead end: that cascade calls doc.cancel() with no way to supply
// the reason URY Sales Plan's own guard requires
// (_guard_backward_transition in ury_sales_plan.py), so it throws and the
// whole cascade gets stuck with no way forward. The Sales Plan side has its
// own guard (Block/Warn on a live Production Plan, see
// ury_sales_plan._check_live_production_plan) for exactly this -- once the
// Production Plan is cancelled here (Work Orders cascade fine), the user
// cancels the Sales Plan themselves, through its own UI, with a reason.
//
// Split out from the now-removed production_plan_from_sales_plan.js (the
// deprecated manual "Get Items From > Sales Plan" button): that fix is
// independent of this one and must not be lost along with it.
frappe.ui.form.on("Production Plan", {
	refresh(frm) {
		frm.ignore_doctypes_on_cancel_all = Array.from(
			new Set([...(frm.ignore_doctypes_on_cancel_all || []), "URY Sales Plan"])
		);
	},
});
