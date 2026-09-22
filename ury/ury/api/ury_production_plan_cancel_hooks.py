# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Let a Production Plan be cancelled without forcing its linked URY Sales
Plan to be cancelled too, and refuse to cancel one out from under posted or
in-flight production (D6).

Frappe blocks cancelling a document while any OTHER submitted document still
links to it (``Document.check_no_back_links_exist`` ->
``frappe.model.delete_doc.check_if_doc_is_linked``), unless the doctype being
cancelled lists that link's doctype in ``self.ignore_linked_doctypes`` -- the
same mechanism/idiom ERPNext's own core doctypes use (see e.g.
``SalesOrder.on_cancel``, ``PurchaseOrder.on_cancel``, ``StockEntry.on_cancel``).

Without this, a Production Plan whose Sales Plan is still
Approved/Locked-for-Production (the normal case -- cancelling a Production
Plan just means the making didn't happen or needs replanning, it does not
mean the demand record itself was wrong) could never be cancelled or
deleted: "Cannot delete or cancel because Production Plan ... is linked
with URY Sales Plan ...". The client-side fix in
production_plan_cancel_guard.js (``ignore_doctypes_on_cancel_all``) only
keeps the Sales Plan out of the "Cancel All Documents" dialog/cascade; this
server-side hook is what actually lets a plain Cancel succeed, since
``check_no_back_links_exist`` runs independently of that dialog.

The Sales Plan itself is never touched here -- it stays Approved/Locked,
exactly as URY's own Return-to-Draft/Cancel guard on the Sales Plan side
(ury_sales_plan._check_live_production_plan) already expects: once this
Production Plan is cancelled, that guard opens back up and the Sales Plan
can be returned to Draft/cancelled through its own UI, with its own reason,
if that is genuinely what's needed.

## D6 -- cancellation guard, per department plan

Added in this revision, on top of the pre-existing Sales Plan exemption
above:

- State ``Processing`` (``custom_ury_production_state`` --
  ``ury_prepare_production.STATE_PROCESSING``): refuse outright. A concurrent
  Prepare Production execution is either still running or, if its job died,
  needs a System Manager's explicit stale reset first
  (``ury_prepare_production.reset_stale_execution``) -- never an implicit
  cancel racing it.
- Any linked, submitted (``docstatus == 1``) Manufacture Stock Entry: refuse,
  naming the entries. Submitting one declares physical production complete
  (see ``ury_prepare_production`` module docstring); a Production Plan behind
  that can never be cancelled.
- Submitted Work Orders with nothing produced yet (``produced_qty == 0``) do
  not block cancellation, but the manager is told, via ``frappe.msgprint``,
  that those Work Orders may need cancelling first -- cancelling the
  Production Plan does not cascade into them automatically.

The string constant for the state field is duplicated here rather than
imported from ``ury_prepare_production`` to avoid a hooks-module ->
orchestrator-module import (this file is wired into ``hooks.py``'s
``doc_events`` and is loaded very early); it is the same
``custom_ury_production_state`` fieldname ``ury_sales_plan_production_plan.PP_STATE_FIELD``
and ``ury_prepare_production.FIELD_STATE`` both already use.
"""

import frappe
from frappe import _

STATE_FIELD = "custom_ury_production_state"
STATE_PROCESSING = "Processing"

WORK_ORDER_DOCTYPE = "Work Order"
STOCK_ENTRY_DOCTYPE = "Stock Entry"
MANUFACTURE_PURPOSE = "Manufacture"


def before_cancel(doc, method=None):
	existing = doc.get("ignore_linked_doctypes") or ()
	doc.ignore_linked_doctypes = tuple(set(existing) | {"URY Sales Plan"})

	_refuse_if_processing(doc)
	_guard_posted_production(doc)


def _refuse_if_processing(doc):
	if doc.get(STATE_FIELD) == STATE_PROCESSING:
		frappe.throw(
			_(
				"{0} is currently Processing a Prepare Production execution and cannot be "
				"cancelled. Wait for it to finish, or ask a System Manager to reset it first."
			).format(doc.name),
			frappe.ValidationError,
		)


def _guard_posted_production(doc):
	"""Refuse when any submitted Manufacture Stock Entry is linked (naming
	them); otherwise, if only unstarted submitted Work Orders exist, allow
	but say they may need cancelling first (D6)."""
	work_orders = frappe.get_all(
		WORK_ORDER_DOCTYPE, filters={"production_plan": doc.name, "docstatus": 1}, pluck="name"
	)
	if not work_orders:
		return

	manufacture_entries = frappe.get_all(
		STOCK_ENTRY_DOCTYPE,
		filters={"work_order": ["in", work_orders], "purpose": MANUFACTURE_PURPOSE, "docstatus": 1},
		pluck="name",
	)
	if manufacture_entries:
		frappe.throw(
			_(
				"{0} cannot be cancelled: production has already been posted through submitted "
				"Manufacture Stock Entries {1}."
			).format(doc.name, ", ".join(manufacture_entries)),
			frappe.ValidationError,
		)

	# Frappe's own `check_if_doc_is_linked` runs after this hook and refuses
	# the cancel outright while any submitted Work Order links back to this
	# plan, regardless of what this function decided. Without adding
	# "Work Order" here the branch below is unreachable: the msgprint would
	# never be seen, because LinkExistsError is raised first. D6 deliberately
	# allows this case -- unstarted Work Orders are a loose end for the
	# manager to tidy, not posted production -- so the link check has to be
	# waived for it. Manufacture entries are refused above, before this point,
	# so nothing that already produced stock can reach here.
	existing = doc.get("ignore_linked_doctypes") or ()
	doc.ignore_linked_doctypes = tuple(set(existing) | {WORK_ORDER_DOCTYPE})

	frappe.msgprint(
		_(
			"{0} has submitted Work Orders with nothing produced yet ({1}); they may need "
			"cancelling first."
		).format(doc.name, ", ".join(work_orders))
	)
