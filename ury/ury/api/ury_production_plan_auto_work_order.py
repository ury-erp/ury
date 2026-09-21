# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Optionally auto-create + auto-submit a Work Order per finished-goods item
when a Production Plan is submitted.

Gated behind ``URY Production Settings.enable_auto_work_order_on_production_plan_submit``
(default off). Fires on every Production Plan submit -- whether the plan was
submitted by the auto-create-on-Sales-Plan-approval path
(``ury_sales_plan_production_plan.create_or_get_production_plan(submit=True)``)
or a user manually submitting a plan opened via the "Production Plan" button
-- so both routes behave the same way once the setting is on.

Deliberately stops at a submitted Work Order: Material Transfer and
Manufacture are real physical actions and are never automated here. See
PLAN.md's "chef locks the Sales Plan, Production Plan is created and
submitted in the same step, only the actual making is pending" scenario.
"""

import frappe

from ury.ury.api.ury_production_settings import auto_work_order_on_production_plan_submit_enabled


def maybe_create_and_submit_work_orders(production_plan_doc, method=None):
	if not auto_work_order_on_production_plan_submit_enabled():
		return
	try:
		_create_and_submit_work_orders(production_plan_doc)
	except Exception:
		frappe.log_error(
			title="URY Production Plan auto Work Order creation failed",
			message=frappe.get_traceback(),
		)


def _create_and_submit_work_orders(production_plan_doc):
	# Reuses core ERPNext's own finished-goods Work Order creation (drafts
	# only, one per po_items row) -- URY's Production Plan Items are always
	# finished-goods (sellable) rows, sub-assembly explosion is a separate,
	# not-yet-built feature (see PLAN.md scope item 8 / sa-production-plan-
	# sales-plan-integration's documented gap), so make_work_order_for_
	# finished_goods is the entire creation surface that applies here.
	# wo_list only ever holds the names created by THIS call (see
	# make_work_order_for_finished_goods / create_work_order in ERPNext
	# core), so nothing else needs filtering.
	wo_list = []
	production_plan_doc.make_work_order_for_finished_goods(wo_list, get_default_warehouse())

	for name in wo_list:
		wo = frappe.get_doc("Work Order", name)
		if wo.docstatus == 0:
			wo.submit()


def get_default_warehouse():
	from erpnext.manufacturing.doctype.work_order.work_order import (
		get_default_warehouse as _get_default_warehouse,
	)

	return _get_default_warehouse()
