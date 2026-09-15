"""Shadow/parallel-run comparison report for the POS stock authority rollout.

Gap G-15 / architecture §3.4: states 2 ("reservations only") and 3
("+ real-time production posting, closing reconciliation still off") are
meant to serve as a shadow window -- production-side ``Stock Entry``
documents get posted for evidence, while the native closing-time
consolidated Sales Invoice deduction remains the sole authority, because
``closing_reconciliation_enabled`` is off and nothing blocks on it. That
window is only useful if someone can actually diff "what would Tier 2 have
deducted" against "what native actually deducted" -- this module is that
diff.

This module is purely observational. It never writes or mutates anything;
every function here only reads. It does not depend on T1's
``URY Branch Stock Policy`` / resolver contract -- it queries the branch and
date range directly, exactly as instructed for this task while that work is
still in flight. Once the resolver lands, the natural integration point is
in the caller: use ``get_branch_stock_policy(branch, company)`` to decide
*whether* to run this report (e.g. only meaningful while
``realtime_production_posting_enabled`` is/was on for the branch), not to
change anything inside it -- the comparison logic itself is tier-agnostic by
design, it just compares two ledgers for whatever branch/period it is asked
about.

Two-ledger model this report reconciles against (architecture §3.3):

- Production ledger: a ``Manufacture`` Stock Entry posted by
  ``ury_fulfilment_posting_service`` when a MADE_TO_ORDER KOT item reaches
  READY. Tracked durably by ``URY Fulfilment Posting Intent``
  (``status = POSTED``), which freezes the finished-good item/qty and the
  raw-material components at the moment of posting.
- Sale ledger: native ERPNext deduction, once per session, from the
  consolidated Sales Invoice's ``update_stock = 1`` at POS Closing Entry
  submit. Tracked via ``Stock Ledger Entry`` rows against that invoice.

"Consistent" is defined per item, per production policy -- not as a raw
quantity diff, because the two documents represent different things at
different times for different policies:

- MADE_TO_ORDER: the *only* policy that is expected to have a shadow
  production entry at all. Consistent means the finished-good quantity the
  production side received (summed across POSTED intents for that item in
  the window) matches, within tolerance, the finished-good quantity the
  sale side later deducted for that same item. A mismatch either way --
  production posted with no matching sale-side deduction, or a sale-side
  deduction with no corresponding production entry -- is a discrepancy
  worth investigating (a cancelled-after-READY item, a missed posting, a
  reservation mis-binding, etc).
- PRE_PRODUCED / DIRECT_RETAIL / unconfigured: under the merged Phase 0/1
  fix these policies post *nothing* at READY -- their finished-good stock is
  either produced ahead of time by the batch path or never produced at all,
  and the sale deducts it once, at closing. So the correct shadow-side
  expectation for these is "no shadow entry", and finding one is itself the
  discrepancy (it would mean the no-self-issue invariant from §3.3 has
  regressed), not a quantity to reconcile.
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import flt

from ury.ury.api.ury_production_context import resolve_production_context

MADE_TO_ORDER = "MADE_TO_ORDER"
PRE_PRODUCED = "PRE_PRODUCED"
DIRECT_RETAIL = "DIRECT_RETAIL"

POSTING_INTENT_DOCTYPE = "URY Fulfilment Posting Intent"
QTY_TOLERANCE = 0.001


def _pos_profiles_for_branch(branch):
	return frappe.get_all("POS Profile", filters={"branch": branch}, pluck="name")


def _pos_closing_entries(pos_profiles, from_date, to_date):
	if not pos_profiles:
		return []
	return frappe.get_all(
		"POS Closing Entry",
		filters={
			"docstatus": 1,
			"pos_profile": ["in", pos_profiles],
			"posting_date": ["between", [from_date, to_date]],
		},
		fields=["name", "pos_profile", "period_start_date", "period_end_date", "posting_date"],
		order_by="posting_date asc",
	)


def _consolidated_invoices_for_closing_entry(closing_entry_name):
	"""Return the distinct consolidated Sales Invoices for one closing entry.

	``POS Closing Entry.pos_transactions`` rows link to the original ``POS
	Invoice`` documents; each one carries ``consolidated_invoice`` once
	native consolidation has run (``pos_invoice_merge_log.py``). A closing
	entry can fan out to more than one consolidated invoice (accounting
	dimension splitting), so this returns a list, not a single name.
	"""
	pos_invoice_names = frappe.get_all(
		"POS Invoice Reference",
		filters={"parent": closing_entry_name, "parenttype": "POS Closing Entry"},
		pluck="pos_invoice",
	)
	if not pos_invoice_names:
		return []
	consolidated = frappe.get_all(
		"POS Invoice",
		filters={"name": ["in", pos_invoice_names], "consolidated_invoice": ["is", "set"]},
		pluck="consolidated_invoice",
		distinct=True,
	)
	return [name for name in consolidated if name]


def _native_deductions(consolidated_invoices):
	"""Sum outgoing Stock Ledger Entry qty per item for these Sales Invoices.

	Returns ``{item_code: {"qty": float, "warehouses": {warehouse, ...}}}``.
	``actual_qty`` on an outward SLE is negative; this reports the magnitude
	actually deducted. Return/credit-note reversals are separate Sales
	Invoice documents (``is_return=1``) and are intentionally not netted in
	here -- this report compares the shadow window against the *sale*
	event, not the post-return balance.
	"""
	result = {}
	if not consolidated_invoices:
		return result
	rows = frappe.get_all(
		"Stock Ledger Entry",
		filters={
			"voucher_type": "Sales Invoice",
			"voucher_no": ["in", consolidated_invoices],
			"is_cancelled": 0,
		},
		fields=["item_code", "actual_qty", "warehouse"],
	)
	for row in rows:
		qty = flt(row.get("actual_qty"))
		if qty >= 0:
			# Not an outgoing (deducting) movement for this voucher -- skip.
			continue
		entry = result.setdefault(row["item_code"], {"qty": 0.0, "warehouses": set()})
		entry["qty"] += abs(qty)
		if row.get("warehouse"):
			entry["warehouses"].add(row["warehouse"])
	return result


def _posted_intents(branch, period_start, period_end):
	return frappe.get_all(
		POSTING_INTENT_DOCTYPE,
		filters={
			"branch": branch,
			"status": "POSTED",
			"posted_at": ["between", [period_start, period_end]],
		},
		fields=[
			"name", "order_ref", "kot", "kot_item", "production_policy",
			"erpnext_stock_entry", "frozen_payload_json", "posted_at",
		],
	)


def _shadow_production(branch, period_start, period_end):
	"""Aggregate POSTED production-side postings per finished-good item.

	Returns ``{item_code: {"qty": .., "stock_entries": set(), "raw_material_consumption": {item_code: qty}}}``.
	Reads the frozen payload (item_code, accepted_qty, components) rather
	than re-deriving it from the Stock Entry, since the payload is the
	durable record of what was *decided* to post and is available even if
	the Stock Entry submission is still in flight for a claimed-but-not-yet-
	posted intent (excluded here anyway by ``status == POSTED``).
	"""
	result = {}
	for intent in _posted_intents(branch, period_start, period_end):
		try:
			payload = json.loads(intent.get("frozen_payload_json") or "{}")
		except (TypeError, ValueError):
			payload = {}
		item_code = payload.get("item_code")
		if not item_code:
			continue
		entry = result.setdefault(
			item_code,
			{"qty": 0.0, "stock_entries": set(), "raw_material_consumption": {}},
		)
		entry["qty"] += flt(payload.get("accepted_qty"))
		if intent.get("erpnext_stock_entry"):
			entry["stock_entries"].add(intent["erpnext_stock_entry"])
		for component in payload.get("components") or []:
			component_item = component.get("item_code")
			if not component_item:
				continue
			entry["raw_material_consumption"][component_item] = entry["raw_material_consumption"].get(
				component_item, 0.0
			) + flt(component.get("qty"))
	return result


def _resolve_policy(item_code, branch):
	context = resolve_production_context(item_code, branch)
	if context and context.get("production_policy"):
		return context["production_policy"]
	return "UNCONFIGURED"


def _reconcile_item(item_code, branch, native, shadow):
	native_qty = flt(native.get("qty")) if native else 0.0
	shadow_qty = flt(shadow.get("qty")) if shadow else 0.0
	policy = _resolve_policy(item_code, branch)
	expected_shadow_entry = policy == MADE_TO_ORDER

	consistent = True
	reason = None

	if not expected_shadow_entry:
		# PRE_PRODUCED / DIRECT_RETAIL / UNCONFIGURED must never post a
		# shadow production entry under the merged Phase 0/1 fix. Only
		# native applies; any shadow entry here means the no-self-issue
		# invariant (§3.3) has regressed.
		if shadow_qty > QTY_TOLERANCE:
			consistent = False
			reason = (
				"{0} item posted a shadow production entry (qty {1}); "
				"no production-side entry is expected for this policy"
			).format(policy, shadow_qty)
	else:
		if shadow_qty <= QTY_TOLERANCE and native_qty > QTY_TOLERANCE:
			consistent = False
			reason = "Sale deducted {0} but no shadow production entry was posted for this item".format(native_qty)
		elif native_qty <= QTY_TOLERANCE and shadow_qty > QTY_TOLERANCE:
			consistent = False
			reason = (
				"Shadow production posted {0} but no corresponding sale-side deduction "
				"occurred in this window (cancelled-after-READY? still open?)"
			).format(shadow_qty)
		elif abs(native_qty - shadow_qty) > QTY_TOLERANCE:
			consistent = False
			reason = "Native deducted {0} but shadow production posted {1}".format(native_qty, shadow_qty)

	return {
		"item_code": item_code,
		"production_policy": policy,
		"expected_shadow_entry": expected_shadow_entry,
		"native_deduction_qty": native_qty,
		"native_warehouses": sorted(native.get("warehouses") or []) if native else [],
		"shadow_production_qty": shadow_qty,
		"shadow_stock_entries": sorted(shadow.get("stock_entries") or []) if shadow else [],
		"shadow_raw_material_consumption": [
			{"item_code": raw_item, "qty": qty}
			for raw_item, qty in sorted((shadow.get("raw_material_consumption") or {}).items())
		]
		if shadow
		else [],
		"consistent": consistent,
		"discrepancy_reason": reason,
	}


@frappe.whitelist()
def get_shadow_comparison_report(branch, from_date, to_date):
	"""Compare native closing-time deduction against shadow production posting.

	Read-only. For each POS Closing Entry for ``branch`` in
	``[from_date, to_date]``, lists the native Sales-Ledger deduction (from
	the consolidated Sales Invoice's Stock Ledger Entries) alongside the
	production-side shadow posting (POSTED ``URY Fulfilment Posting
	Intent`` rows in that closing entry's period), with a per-item
	reconciliation flagging any inconsistency.

	Args:
		branch: Branch name to report on.
		from_date / to_date: inclusive date range (``YYYY-MM-DD``), matched
			against ``POS Closing Entry.posting_date``.

	Returns:
		dict with ``branch``, ``from_date``, ``to_date``, ``closing_entries``
		(one entry per POS Closing Entry, each with its own per-item
		``items`` reconciliation list) and a ``summary`` with aggregate
		counts, e.g.::

			{
				"branch": "Branch A",
				"from_date": "2026-09-01",
				"to_date": "2026-09-15",
				"closing_entries": [
					{
						"pos_closing_entry": "PCE-0001",
						"period_start_date": "...",
						"period_end_date": "...",
						"consolidated_invoices": ["SI-CONS-0001"],
						"items": [
							{
								"item_code": "Burger",
								"production_policy": "MADE_TO_ORDER",
								"expected_shadow_entry": True,
								"native_deduction_qty": 10.0,
								"native_warehouses": ["Kitchen WH - URY"],
								"shadow_production_qty": 10.0,
								"shadow_stock_entries": ["STE-0007"],
								"shadow_raw_material_consumption": [
									{"item_code": "Bun", "qty": 10.0},
									{"item_code": "Patty", "qty": 10.0},
								],
								"consistent": True,
								"discrepancy_reason": None,
							},
							...
						],
					},
					...
				],
				"summary": {
					"total_closing_entries": 1,
					"total_items_compared": 3,
					"total_discrepancies": 0,
				},
			}
	"""
	if not branch:
		frappe.throw(frappe._("Branch is required"))
	if not from_date or not to_date:
		frappe.throw(frappe._("from_date and to_date are required"))

	pos_profiles = _pos_profiles_for_branch(branch)
	closing_entries = _pos_closing_entries(pos_profiles, from_date, to_date)

	report_entries = []
	total_items = 0
	total_discrepancies = 0

	for closing_entry in closing_entries:
		consolidated_invoices = _consolidated_invoices_for_closing_entry(closing_entry["name"])
		native = _native_deductions(consolidated_invoices)
		shadow = _shadow_production(
			branch,
			closing_entry["period_start_date"],
			closing_entry["period_end_date"],
		)

		item_codes = sorted(set(native.keys()) | set(shadow.keys()))
		items = [
			_reconcile_item(item_code, branch, native.get(item_code), shadow.get(item_code))
			for item_code in item_codes
		]
		total_items += len(items)
		total_discrepancies += sum(1 for item in items if not item["consistent"])

		report_entries.append(
			{
				"pos_closing_entry": closing_entry["name"],
				"period_start_date": closing_entry["period_start_date"],
				"period_end_date": closing_entry["period_end_date"],
				"consolidated_invoices": consolidated_invoices,
				"items": items,
			}
		)

	return {
		"branch": branch,
		"from_date": from_date,
		"to_date": to_date,
		"closing_entries": report_entries,
		"summary": {
			"total_closing_entries": len(report_entries),
			"total_items_compared": total_items,
			"total_discrepancies": total_discrepancies,
		},
	}
