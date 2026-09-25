import frappe
from frappe.utils import flt


def validate_receiving_secondary_measure(doc, method=None):
	"""Compute Receiving Secondary-Measure Variance (Phase 1) on every
	Purchase Receipt save/submit.

	Advisory only: never blocks a real goods receipt. See ury_workspaces
	track yield-purchase-uom-bom-problem/PLAN.md sec 1.2 for the full spec
	and sec 1.7 for the defect list this implementation was written against
	(stock_qty not qty, is_return skip, reset-before-recompute, no per-row
	DB query, global-default tolerance fallback, try/except so a bug here
	can never stop stock from being received).
	"""
	try:
		_validate_receiving_secondary_measure(doc)
	except Exception:
		frappe.log_error(
			title="Receiving Secondary-Measure Variance hook failed",
			message=frappe.get_traceback(),
		)


def _validate_receiving_secondary_measure(doc):
	if doc.get("is_return"):
		# Returns are mapped from the original receipt and would otherwise
		# inherit a positive secondary_qty against a negative qty, producing
		# a bogus ~-200% variance and a false off-spec flag. Skip entirely --
		# the original receipt's row already carries the real variance.
		return

	items = doc.get("items") or []
	item_codes = {row.item_code for row in items if row.item_code}
	if not item_codes:
		return

	item_flags = {
		d.name: d
		for d in frappe.db.get_all(
			"Item",
			filters={"name": ["in", list(item_codes)]},
			fields=[
				"name",
				"custom_rcv_secondary_measure",
				"custom_rcv_std_secondary_per_stock_unit",
				"custom_rcv_tolerance_lower_pct",
				"custom_rcv_tolerance_upper_pct",
			],
		)
	}  # one query for all lines, not one per row

	settings = frappe.get_cached_doc("URY Receiving Settings")

	for row in items:
		flags = item_flags.get(row.item_code)

		# Always reset the *derived* fields first -- otherwise a row that had
		# tracking toggled off, or had its secondary qty cleared, keeps
		# showing stale computed values from a prior save. custom_rcv_std_
		# secondary_snapshot is deliberately NOT reset here: see below.
		row.custom_rcv_item_secondary_measure = ""
		row.custom_rcv_expected_secondary_qty = 0
		row.custom_rcv_actual_secondary_per_stock_unit = 0
		row.custom_rcv_variance_pct = 0
		row.custom_rcv_off_spec = 0

		if not flags or not flags.custom_rcv_secondary_measure:
			continue

		row.custom_rcv_item_secondary_measure = flags.custom_rcv_secondary_measure

		# Snapshot the standard ONLY the first time this row is ever
		# validated (i.e. while the field is still unset/0). validate()
		# re-runs on every later save of an already-submitted document too
		# (e.g. editing custom_rcv_variance_reason, which allow_on_submit
		# permits) -- if we recomputed the snapshot from the Item's current
		# standard on every one of those saves, a later revision of
		# Item.custom_rcv_std_secondary_per_stock_unit would retroactively
		# rewrite what this receipt reports, defeating the entire point of
		# having a snapshot. Once set, it is load-bearing history and must
		# survive every subsequent save of this same row, not just be
		# frozen once. amendment/copy_doc carries the field's stored value
		# forward (it is intentionally NOT no_copy), so an amended document
		# also preserves the original snapshot rather than picking up
		# whatever the Item's standard has since become.
		if not row.get("custom_rcv_std_secondary_snapshot"):
			row.custom_rcv_std_secondary_snapshot = flt(
				flags.custom_rcv_std_secondary_per_stock_unit
			)
		std = flt(row.custom_rcv_std_secondary_snapshot)

		# stock_qty, not qty: qty is in the purchase UOM (e.g. Box); stock_qty
		# is already converted to the Item's actual Stock UOM (Nos for
		# chicken, Kg for veal chops) -- the standard is always defined per
		# stock unit, whichever unit that is.
		stock_qty = flt(row.stock_qty)
		row.custom_rcv_expected_secondary_qty = stock_qty * std

		secondary_qty = flt(row.get("custom_rcv_secondary_qty"))
		if not secondary_qty or not stock_qty:
			continue  # advisory only -- never block missing entry or zero qty

		row.custom_rcv_actual_secondary_per_stock_unit = secondary_qty / stock_qty

		if not std:
			continue  # no standard configured yet -- variance stays blank/0

		row.custom_rcv_variance_pct = round(
			(row.custom_rcv_actual_secondary_per_stock_unit - std) / std * 100, 2
		)
		tolerance_lower = flt(flags.custom_rcv_tolerance_lower_pct) or flt(
			settings.default_tolerance_lower_pct
		)
		tolerance_upper = flt(flags.custom_rcv_tolerance_upper_pct) or flt(
			settings.default_tolerance_upper_pct
		)
		row.custom_rcv_off_spec = (
			row.custom_rcv_variance_pct < -tolerance_lower
			or row.custom_rcv_variance_pct > tolerance_upper
		)
