"""Read-only kitchen (KOT) status for the items of a running order."""

import frappe
from frappe import _

from ury.ury_pos.api import getBranch

# Least-advanced first: an item split over several KOTs shows its slowest state.
_STATE_ORDER = ("QUEUED", "IN_PREPARATION", "READY", "SERVED")


@frappe.whitelist()
def get_order_kot_status(invoice):
	"""Return ``{"items": {item_code: state}, "kots": [{name, order_status}]}``.

	``state`` is one of QUEUED / IN_PREPARATION / READY / SERVED, taken from
	URY KOT Item Execution (a KOT item with no execution row is implicitly
	QUEUED; a KOT already marked Served is SERVED). Cancel-type KOTs are skipped.
	"""
	branch = frappe.db.get_value("POS Invoice", invoice, "branch")
	if branch is None and not frappe.db.exists("POS Invoice", invoice):
		frappe.throw(_("Order not found"), frappe.DoesNotExistError)
	if not frappe.has_permission("POS Invoice", "read", doc=invoice):
		frappe.throw(_("Not permitted to view this order"), frappe.PermissionError)

	try:
		user_branch = getBranch()
	except frappe.ValidationError:
		if frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles():
			user_branch = None
		else:
			raise
	if user_branch and branch and branch != user_branch:
		frappe.throw(_("Not permitted to view orders outside your active branch"), frappe.PermissionError)

	kots = frappe.get_all(
		"URY KOT",
		filters={"invoice": invoice, "type": ["not in", ("Cancelled", "Partially cancelled")]},
		fields=["name", "order_status"],
		order_by="creation asc",
	)
	items = {}
	for kot in kots:
		served = kot.order_status == "Served"
		rows = frappe.get_all(
			"URY KOT Items", filters={"parent": kot.name}, fields=["name", "item"]
		)
		states = {
			r.kot_item: r.state
			for r in frappe.get_all(
				"URY KOT Item Execution",
				filters={"kot": kot.name},
				fields=["kot_item", "state"],
			)
		}
		for row in rows:
			state = "SERVED" if served else states.get(row.name, "QUEUED")
			prev = items.get(row.item)
			if prev is None or _STATE_ORDER.index(state) < _STATE_ORDER.index(prev):
				items[row.item] = state
	return {"items": items, "kots": [dict(k) for k in kots]}
