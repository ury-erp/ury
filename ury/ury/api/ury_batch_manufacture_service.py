"""Start Batch / Receive Batch: the real stock-posting trigger for pre-produced items.

sa-arch-item1-manufacturing (see
tracks/sa-architecture-closure/item1-pre-produced-manufacturing-plan.md).

Before this module, `ury_batch_work_order_adapter.py` only produced a
read-only, never-persisted draft dict for what a batch Work Order *would*
look like -- nothing in the repo ever actually posted stock for a
pre-produced batch. This module is the first thing that does: a manual,
kitchen-triggered whitelisted action (not automatic off a Sales Plan
approval -- see the plan doc's "3.2 Trigger point" section for why) that
posts a real, submitted `Stock Entry` for one `URY Item Production
Configuration` row.

Two branches, selected by the config row's `sourcing_mode`:

- IN_HOUSE (`start_batch`): resolves the item's active BOM (reusing
  `ury_batch_work_order_adapter._resolve_active_bom`) and posts a real
  `Manufacture` Stock Entry -- raw-material components as `s_warehouse`
  rows sourced from the production unit/department warehouse, the finished
  item as a `t_warehouse` row (with `is_finished_item: 1`, since this is a
  hand-built entry with no linked `work_order`/`bom_no` for ERPNext to
  infer that from) landing in the config's `direct_retail_warehouse` --
  the same warehouse `ury_production_context.resolve_production_context`
  and `ury_availability._fill_pre_produced` already treat as the
  PRE_PRODUCED finished-goods location. This deliberately mirrors
  `ury_fulfilment_posting_service._submit_stock_entry`/`_stock_entry_items`'s
  existing MADE_TO_ORDER pattern: same hand-built-entry approach (see that
  module's module docstring for why a real ERPNext Work Order is not used),
  same `is_finished_item` workaround, same stock-entry-construction shape.
  This is a deliberate consistency choice, not an oversight: the repo
  should have one pattern for "post a Manufacture Stock Entry", not two.
- EXTERNAL_RECEIPT (`receive_batch`): no BOM, no component consumption. A
  plain `Material Receipt` Stock Entry receives the finished item directly
  into the config's `external_receiving_warehouse`.

Authorization and locking conventions are copied from
`ury_fulfilment_posting_service.py`:

- `_authorize_batch_action` mirrors `_authorize_posting` (role check against
  a fixed set, Administrator bypass, plus a `frappe.has_permission` read
  check on the config row being acted on).
- The `URY Item Production Configuration` row is locked `FOR UPDATE` for the
  duration of the request (`_lock_config`), so two concurrent "Start Batch"
  clicks for the *same config row* (e.g. a double-tap on a kitchen tablet)
  serialize instead of racing -- the second call observes the first
  request's effects (if any) once it acquires the lock.
- Callers may additionally pass a client-supplied `idempotency_key` (e.g. a
  UUID generated once per tap and resent on retry). When given,
  `_find_existing_stock_entry` performs the same indexed, `FOR UPDATE`
  exact-match dedupe lookup `ury_fulfilment_posting_service.py` uses (via
  the new `custom_ury_batch_request` field, same rationale as that module's
  `custom_ury_posting_intent`: an indexed equality lookup, never a
  leading-wildcard LIKE scan) and replays the existing Stock Entry instead
  of posting a second one. Without an `idempotency_key`, no cross-request
  dedupe is possible (there is nothing to key it on) -- the row lock above
  is still the only protection against a true double-tap race, so UI
  callers are expected to always pass one.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.api.ury_batch_work_order_adapter import _resolve_active_bom
from ury.ury.api.ury_bom_compiler import compile_bom_vector
from ury.ury.api.ury_fulfilment_posting_service import _service_mutation


CONFIG_DOCTYPE = "URY Item Production Configuration"

PRE_PRODUCED = "PRE_PRODUCED"
IN_HOUSE = "IN_HOUSE"
EXTERNAL_RECEIPT = "EXTERNAL_RECEIPT"

BATCH_ROLES = {"System Manager", "Stock Manager", "Production Manager", "Chef"}


class BatchManufactureError(frappe.ValidationError):
	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


def _authorize_batch_action(actor, config_name):
	if actor == "Administrator":
		return
	roles = set(frappe.get_roles(actor))
	if not roles.intersection(BATCH_ROLES):
		raise frappe.PermissionError(_("You are not permitted to start or receive a production batch"))
	if not frappe.has_permission(CONFIG_DOCTYPE, "read", config_name, user=actor):
		raise frappe.PermissionError(_("You are not permitted to act on this production configuration"))


def _lock_config(config_name):
	"""Row-lock one `URY Item Production Configuration` for the request.

	Serializes concurrent Start Batch/Receive Batch calls for the *same*
	config row (e.g. a double-tap) against each other, same `FOR UPDATE`
	convention `ury_fulfilment_posting_service._lock_intent` uses.
	"""
	rows = frappe.db.sql(
		f"""
		SELECT name, active, item, branch, department, production_unit,
		       production_policy, sourcing_mode, direct_retail_warehouse,
		       external_receiving_warehouse
		FROM `tab{CONFIG_DOCTYPE}`
		WHERE name = %(name)s
		FOR UPDATE
		""",
		{"name": config_name},
		as_dict=True,
	)
	if not rows:
		raise BatchManufactureError(
			"CONFIGURATION_NOT_FOUND", _("Production configuration {0} not found").format(config_name)
		)
	return rows[0]


def _resolve_company(branch):
	company = frappe.db.get_value("Branch", branch, "company")
	if not company:
		raise BatchManufactureError(
			"COMPANY_NOT_RESOLVED", _("Could not resolve a company for branch {0}").format(branch)
		)
	return company


def _resolve_source_warehouse(config_row):
	"""Same resolution order as `ury_production_context.resolve_production_context`
	uses for MADE_TO_ORDER: production unit warehouse, falling back to the
	department warehouse."""
	warehouse = None
	if config_row.get("production_unit"):
		warehouse = frappe.db.get_value("URY Production Unit", config_row["production_unit"], "warehouse")
	if not warehouse and config_row.get("department"):
		warehouse = frappe.db.get_value("URY Production Department", config_row["department"], "department_warehouse")
	if not warehouse:
		raise BatchManufactureError(
			"SOURCE_WAREHOUSE_NOT_CONFIGURED",
			_("Production configuration {0} has no production unit/department warehouse configured").format(
				config_row["name"]
			),
		)
	return warehouse


def _find_existing_stock_entry(idempotency_key):
	"""Locking, indexed dedupe lookup keyed on `custom_ury_batch_request`,
	same rationale/shape as
	`ury_fulfilment_posting_service._find_existing_stock_entry`."""
	if not idempotency_key:
		return None
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabStock Entry`
		WHERE docstatus = 1 AND custom_ury_batch_request = %(key)s
		ORDER BY creation DESC
		LIMIT 1
		FOR UPDATE
		""",
		{"key": idempotency_key},
		as_dict=True,
	)
	return rows[0].get("name") if rows else None


def _in_house_stock_entry_items(item_code, qty, company, source_warehouse, target_warehouse):
	vector = compile_bom_vector(item_code, qty, company)
	items = []
	for component in vector["components"]:
		if not component.get("component_item") or flt(component.get("qty")) <= 0:
			raise BatchManufactureError("INVALID_BOM_COMPONENT", _("BOM component row is incomplete"))
		items.append(
			{
				"item_code": component["component_item"],
				"qty": flt(component["qty"]),
				"s_warehouse": source_warehouse,
			}
		)
	items.append(
		{
			"item_code": item_code,
			"qty": flt(qty),
			"t_warehouse": target_warehouse,
			# Same workaround as ury_fulfilment_posting_service._stock_entry_items:
			# this is a hand-built entry with no linked work_order/bom_no, so
			# ERPNext's mark_finished_and_scrap_items() cannot auto-infer
			# is_finished_item and the submit is rejected without it.
			"is_finished_item": 1,
		}
	)
	return items, vector["bom"]


def _submit_stock_entry(*, company, stock_entry_type, items, config_name, idempotency_key, extra_remarks=None):
	existing = _find_existing_stock_entry(idempotency_key)
	if existing:
		return existing, True

	remarks = "URY Batch {0}: {1}".format(stock_entry_type, config_name)
	if extra_remarks:
		remarks = "{0} ({1})".format(remarks, extra_remarks)

	doc = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"company": company,
			"stock_entry_type": stock_entry_type,
			"purpose": stock_entry_type,
			"items": items,
			"remarks": remarks,
			"custom_ury_batch_request": idempotency_key,
		}
	)
	with _service_mutation():
		doc.insert(ignore_permissions=False)
		doc.submit()
	return doc.name, False


def _load_and_validate_config(config_name, expected_sourcing_mode, actor):
	actor = actor or frappe.session.user
	_authorize_batch_action(actor, config_name)

	config_row = _lock_config(config_name)

	if not config_row.get("active"):
		raise BatchManufactureError(
			"CONFIGURATION_INACTIVE", _("Production configuration {0} is not active").format(config_name)
		)

	policy = (config_row.get("production_policy") or "").upper()
	if policy != PRE_PRODUCED:
		raise BatchManufactureError(
			"NOT_PRE_PRODUCED",
			_("Production configuration {0} has policy {1}; batch posting only applies to PRE_PRODUCED").format(
				config_name, policy or "UNSET"
			),
		)

	sourcing_mode = (config_row.get("sourcing_mode") or IN_HOUSE).upper()
	if sourcing_mode != expected_sourcing_mode:
		raise BatchManufactureError(
			"SOURCING_MODE_MISMATCH",
			_("Production configuration {0} has sourcing_mode {1}; expected {2}").format(
				config_name, sourcing_mode, expected_sourcing_mode
			),
		)

	return config_row, actor


@frappe.whitelist()
def start_batch(production_configuration, qty, idempotency_key=None, actor=None):
	"""IN_HOUSE path: post a real BOM-based Manufacture Stock Entry.

	Raw-material components are issued from the production unit/department
	warehouse; the finished pre-produced item is received into the config's
	`direct_retail_warehouse` (the same warehouse availability reads FG
	stock from). Fails closed if `sourcing_mode` is not IN_HOUSE, if the
	configuration is inactive, or if no active BOM/source warehouse can be
	resolved.
	"""
	qty = flt(qty)
	if qty <= 0:
		raise BatchManufactureError("INVALID_QTY", _("Quantity must be greater than zero"))

	config_row, actor = _load_and_validate_config(production_configuration, IN_HOUSE, actor)

	item_code = config_row["item"]
	company = _resolve_company(config_row["branch"])
	source_warehouse = _resolve_source_warehouse(config_row)
	target_warehouse = config_row.get("direct_retail_warehouse") or source_warehouse

	# Reuses the same active-BOM resolution contract as
	# ury_batch_work_order_adapter._resolve_active_bom / ury_bom_compiler --
	# fails closed (frappe.throw) if no active BOM exists for this item/company.
	_resolve_active_bom(item_code, company)

	items, bom_no = _in_house_stock_entry_items(item_code, qty, company, source_warehouse, target_warehouse)

	stock_entry, idempotent = _submit_stock_entry(
		company=company,
		stock_entry_type="Manufacture",
		items=items,
		config_name=production_configuration,
		idempotency_key=idempotency_key,
		extra_remarks="BOM {0}".format(bom_no),
	)
	return {
		"stock_entry": stock_entry,
		"idempotent_replay": idempotent,
		"item_code": item_code,
		"qty": qty,
		"bom": bom_no,
		"source_warehouse": source_warehouse,
		"target_warehouse": target_warehouse,
	}


@frappe.whitelist()
def receive_batch(production_configuration, qty, idempotency_key=None, actor=None):
	"""EXTERNAL_RECEIPT path: post a plain Material Receipt Stock Entry.

	No BOM, no component consumption -- the finished item is received
	directly into the config's `external_receiving_warehouse`. Fails closed
	if `sourcing_mode` is not EXTERNAL_RECEIPT, if the configuration is
	inactive, or if no `external_receiving_warehouse` is configured.
	"""
	qty = flt(qty)
	if qty <= 0:
		raise BatchManufactureError("INVALID_QTY", _("Quantity must be greater than zero"))

	config_row, actor = _load_and_validate_config(production_configuration, EXTERNAL_RECEIPT, actor)

	item_code = config_row["item"]
	company = _resolve_company(config_row["branch"])
	target_warehouse = config_row.get("external_receiving_warehouse")
	if not target_warehouse:
		raise BatchManufactureError(
			"EXTERNAL_RECEIVING_WAREHOUSE_NOT_CONFIGURED",
			_("Production configuration {0} has no external_receiving_warehouse configured").format(
				production_configuration
			),
		)

	items = [
		{
			"item_code": item_code,
			"qty": qty,
			"t_warehouse": target_warehouse,
		}
	]

	stock_entry, idempotent = _submit_stock_entry(
		company=company,
		stock_entry_type="Material Receipt",
		items=items,
		config_name=production_configuration,
		idempotency_key=idempotency_key,
	)
	return {
		"stock_entry": stock_entry,
		"idempotent_replay": idempotent,
		"item_code": item_code,
		"qty": qty,
		"target_warehouse": target_warehouse,
	}
