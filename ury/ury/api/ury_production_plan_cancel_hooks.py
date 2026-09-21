# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Let a Production Plan be cancelled without forcing its linked URY Sales
Plan to be cancelled too.

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
"""


def before_cancel(doc, method=None):
	existing = doc.get("ignore_linked_doctypes") or ()
	doc.ignore_linked_doctypes = tuple(set(existing) | {"URY Sales Plan"})
