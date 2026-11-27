# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Apply a department Production Plan's own quantities to compiled targets.

``compile_production_targets`` derives every target's ``required_qty`` from
the frozen Sales Plan snapshot. A department Production Plan copies that
value into ``po_items[].planned_qty`` at creation, and a Draft plan may then
have its quantities edited (Chef UI, track ``sa-chef-ui-production-queue``).

Every consumer that turns compiled targets into stock movements -- Prepare
Production preflight and job, the Transfer Material Request generator, the
Purchase Material Request generator and the Chef UI raw-material view --
calls :func:`apply_production_plan_quantities` so they all act on the
quantity the Production Plan actually carries, never a recompiled one.

For each target matched to a ``po_items`` row on ``(item_code, bom_no)``,
``factor = planned_qty / required_qty`` scales ``required_qty``,
``component_vector`` and ``raw_material_vector``. BOM quantities, yield and
stock UOM are already folded into those vectors by the compiler, so scaling
is linear. A target with no matching row is left unchanged, except a pure
sub-assembly (below), which has no row when stock already covers it.

## Sub-assemblies

A *pure sub-assembly* is a target needed only by other targets (every compiler
source is ``nested_dependency``), never planned directly. Its plan quantity is
what its parents consume; its **production quantity** is that demand minus the
stock already in the department warehouse, never below 0
(:func:`derive_plan_quantities`). It is derived, not edited: changing a parent's
quantity re-derives it. ERPNext requires ``planned_qty > 0`` on a Production
Plan row, so a sub-assembly that stock fully covers gets no row;
:func:`apply_quantities_to_bucket` then drops it (and removes it from its
parents' ``depends_on``) instead of producing it.
"""

from __future__ import annotations

import copy

import frappe
from frappe import _
from frappe.utils import flt

SOURCE_NESTED = "nested_dependency"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"
PRODUCTION_PLAN_ITEM_DOCTYPE = "Production Plan Item"

_QTY_EPSILON = 1e-9


def get_planned_qty_by_target(production_plan):
	"""``{(item_code, bom_no): planned_qty}`` for one Production Plan's
	``po_items``. Rows sharing a key are summed (the creation path never
	writes duplicates, but a Desk edit could)."""
	item = frappe.qb.DocType(PRODUCTION_PLAN_ITEM_DOCTYPE)
	rows = (
		frappe.qb.from_(item)
		.select(item.item_code, item.bom_no, item.planned_qty)
		.where(item.parent == production_plan)
		.where(item.parenttype == PRODUCTION_PLAN_DOCTYPE)
		.where(item.parentfield == "po_items")
	).run(as_dict=True)
	planned = {}
	for row in rows:
		key = (row["item_code"], row["bom_no"])
		planned[key] = flt(planned.get(key)) + flt(row["planned_qty"])
	return planned


def scale_target(target, planned_qty):
	"""Return a copy of ``target`` scaled so ``required_qty == planned_qty``."""
	scaled = copy.deepcopy(target)
	required = flt(target.get("required_qty"))
	if required <= _QTY_EPSILON:
		scaled["required_qty"] = flt(planned_qty)
		return scaled
	factor = flt(planned_qty) / required
	if abs(factor - 1.0) <= _QTY_EPSILON:
		return scaled
	scaled["required_qty"] = flt(planned_qty)
	for vector_key in ("component_vector", "raw_material_vector"):
		for row in scaled.get(vector_key) or []:
			row["required_qty"] = flt(row.get("required_qty")) * factor
	scaled["production_plan_factor"] = factor
	return scaled


def target_key(target):
	return (target.get("item_code"), target.get("bom_no"))


def is_pure_sub_assembly(target):
	"""True when every compiler source of ``target`` is a nested dependency,
	i.e. it is produced only to feed other targets."""
	sources = target.get("sources") or []
	return bool(sources) and all(source.get("source_type") == SOURCE_NESTED for source in sources)


def apply_quantities_to_bucket(bucket, planned_by_target, missing_sub_assembly="drop"):
	"""Scale every target in ``bucket["targets"]`` using ``planned_by_target``
	(see :func:`get_planned_qty_by_target`). Returns a new bucket; the input
	is not mutated.

	A pure sub-assembly with no Production Plan row is fully covered by stock:
	``missing_sub_assembly="drop"`` (default, for Prepare, transfer and
	purchase) removes it and prunes it from the other targets' ``depends_on``;
	``"zero"`` keeps it at quantity 0 (for display).
	"""
	result = dict(bucket)
	targets = []
	dropped = set()
	for target in bucket.get("targets") or []:
		key = target_key(target)
		if key in planned_by_target:
			targets.append(scale_target(target, planned_by_target[key]))
		elif is_pure_sub_assembly(target):
			if missing_sub_assembly == "zero":
				targets.append(scale_target(target, 0))
			else:
				dropped.add(target.get("item_code"))
		else:
			targets.append(copy.deepcopy(target))
	if dropped:
		for target in targets:
			depends_on = target.get("depends_on") or []
			if any(code in dropped for code in depends_on):
				target["depends_on"] = [code for code in depends_on if code not in dropped]
	result["targets"] = targets
	return result


def consumption_by_item(targets):
	"""``{item_code: qty}`` that the targets' ``component_vector`` rows consume
	of items that are themselves targets in the same list. Call with targets
	already scaled to their plan quantities."""
	codes = {target.get("item_code") for target in targets}
	consumed = {}
	for target in targets:
		for row in target.get("component_vector") or []:
			code = row.get("item_code")
			if code in codes and code != target.get("item_code"):
				consumed[code] = flt(consumed.get(code)) + flt(row.get("required_qty"))
	return consumed


def derive_plan_quantities(targets, direct_qty_by_key, stock_by_item, overrides=None):
	"""Plan quantities for every target, as ``{(item_code, bom_no): qty}``.

	Targets that are not pure sub-assemblies take ``direct_qty_by_key`` (their
	compiled ``required_qty`` when absent). A pure sub-assembly takes what the
	targets that consume it need, minus ``stock_by_item``, never below 0.
	``overrides`` maps a pure sub-assembly's key to an explicit quantity that
	replaces the derived one (a chef-set value); the levels below it then follow
	that quantity. ``targets`` must be dependency-first (as the compiler returns
	them), so the reverse pass sees every consumer before the item it consumes.
	"""
	overrides = overrides or {}
	consumption = {}
	codes = {target.get("item_code") for target in targets}
	result = {}
	for target in reversed(targets):
		key = target_key(target)
		code = target.get("item_code")
		if is_pure_sub_assembly(target):
			demand = consumption.get(code)
			if demand is None:
				demand = flt(target.get("required_qty"))
			qty = max(0.0, flt(demand) - flt(stock_by_item.get(code)))
			if key in overrides:
				qty = flt(overrides[key])
		else:
			qty = flt(direct_qty_by_key.get(key, target.get("required_qty")))
		result[key] = qty
		scaled = scale_target(target, qty)
		for row in scaled.get("component_vector") or []:
			row_code = row.get("item_code")
			if row_code in codes and row_code != code:
				consumption[row_code] = flt(consumption.get(row_code)) + flt(row.get("required_qty"))
	return result


def get_warehouse_stock(warehouse, item_codes):
	"""``{item_code: actual_qty}`` of ``item_codes`` in ``warehouse``."""
	item_codes = sorted({code for code in item_codes if code})
	if not warehouse or not item_codes:
		return {}
	bin_ = frappe.qb.DocType("Bin")
	rows = (
		frappe.qb.from_(bin_)
		.select(bin_.item_code, bin_.actual_qty)
		.where(bin_.warehouse == warehouse)
		.where(bin_.item_code.isin(item_codes))
	).run(as_dict=True)
	return {row["item_code"]: flt(row["actual_qty"]) for row in rows}


def apply_production_plan_quantities(bucket, production_plan):
	"""Scale one department bucket to ``production_plan``'s own quantities."""
	if not production_plan:
		return bucket
	return apply_quantities_to_bucket(bucket, get_planned_qty_by_target(production_plan))


def dependency_shortfalls(targets):
	"""Quantities of targets that no longer cover what their consumers need.

	A target that other targets consume (and that is also planned directly)
	must be produced in at least the quantity the others consume through their
	``component_vector``. Pure sub-assemblies are skipped: their quantity is
	derived from their parents, never edited. Returns a list of
	``{"item_code", "planned_qty", "consumed_qty"}`` for every target whose
	``required_qty`` is below that consumption (empty when consistent).
	"""
	consumed = consumption_by_item(targets)

	shortfalls = []
	for target in targets:
		if is_pure_sub_assembly(target):
			continue  # derived from its parents; see derive_plan_quantities
		code = target.get("item_code")
		need = flt(consumed.get(code))
		if need > flt(target.get("required_qty")) + 1e-6:
			shortfalls.append(
				{"item_code": code, "planned_qty": flt(target.get("required_qty")), "consumed_qty": need}
			)
	return shortfalls


def validate_dependency_quantities(targets):
	"""Throw if :func:`dependency_shortfalls` reports anything."""
	shortfalls = dependency_shortfalls(targets)
	if not shortfalls:
		return
	lines = [
		_("{0}: planned {1}, required by other items {2}").format(
			row["item_code"], frappe.format(row["planned_qty"]), frappe.format(row["consumed_qty"])
		)
		for row in shortfalls
	]
	frappe.throw(
		_("Sub-assembly quantities are below what other items in this plan consume:")
		+ "<br>"
		+ "<br>".join(lines),
		frappe.ValidationError,
	)
