"""V3-60: Optional Production Unit -> Workstation mapping.

Scope (deliberately conservative, additive-only):

- `URY Production Unit` (`ury/ury/doctype/ury_production_unit/ury_production_unit.json`)
  is a LIVE, already-accepted doctype (extended by V3-11/V3-12). This module
  does NOT edit that JSON. The optional link field it reads
  (`linked_workstation`) is a PROPOSAL ONLY -- see
  `ury/ury/doctype/ury_production_unit/proposed_workstation_mapping_field.md`
  for the exact field spec and the migration that would be required to apply
  it. Until that separate change lands, `linked_workstation` does not exist
  on any site, and every function below degrades gracefully rather than
  erroring.
- This module is a pure, standalone mapping capability. It is not imported
  by, and does not import, any live routing/execution code (V3-51's
  `ury_kot_routing.py` or V3-53's execution service). Nothing calls into
  this module today -- it exists to prove the mapping *can* be read/written
  safely, without being wired into anything.
- "Optional" is structural, not just documented: `get_mapped_workstation`
  returns `None` for every Production Unit today (field doesn't exist yet),
  and even once the field is applied, an empty/unset value is a fully valid,
  supported state (`validate_mapping_is_optional` exists specifically to
  make that explicit and testable).

Company scoping note: ERPNext's core `Workstation` doctype carries a
`warehouse` field but no direct `company` field (see
`erpnext/manufacturing/doctype/workstation/workstation.json`). This module's
"same company" scope check therefore compares the Production Unit's
resolved company (via `Branch.company`, following the same pattern used by
V3-53's `_kot_scope`) against the mapped Workstation's warehouse's company
(via `Warehouse.company`), when the Workstation has a warehouse set. If the
Workstation has no warehouse, the scope check is skipped (documented,
non-blocking limitation) rather than failing closed on a company mismatch
that cannot actually be determined -- a stricter enforcement is left as a
follow-up.
"""

from __future__ import annotations

import frappe

MANAGER_ROLES = {"URY Manager", "URY Admin", "System Manager"}

LINKED_WORKSTATION_FIELDNAME = "linked_workstation"
PRODUCTION_UNIT_DOCTYPE = "URY Production Unit"
WORKSTATION_DOCTYPE = "Workstation"


class WorkstationMappingError(frappe.ValidationError):
	"""Raised (with a `reason_code` attribute) when a mapping write is rejected."""

	def __init__(self, message: str, reason_code: str):
		super().__init__(message)
		self.reason_code = reason_code


def _field_exists(doctype: str, fieldname: str) -> bool:
	"""Defensive existence check, same pattern as V3-51/52/53 for
	not-yet-merged fields: never assume a field exists, always check the
	live meta first so this module degrades to a no-op instead of raising
	`frappe.db.sql` / AttributeError on a site where the proposed field has
	not been applied yet."""
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return False
	return bool(meta.has_field(fieldname))


def get_mapped_workstation(production_unit: str) -> str | None:
	"""Return the Workstation linked to `production_unit`, or `None`.

	Returns `None` (never raises) when:
	- the Production Unit does not exist,
	- the proposed `linked_workstation` field does not exist on this site
	  yet (the common case today -- the field is a proposal, not applied),
	- or the field exists but is empty for this Production Unit.

	This is the load-bearing "non-breaking" proof for V3-60: every existing
	Production Unit, on every site today, gets `None` from this call, with
	zero behavior change to any caller.
	"""
	if not production_unit:
		return None
	if not frappe.db.exists(PRODUCTION_UNIT_DOCTYPE, production_unit):
		return None
	if not _field_exists(PRODUCTION_UNIT_DOCTYPE, LINKED_WORKSTATION_FIELDNAME):
		return None

	value = frappe.db.get_value(
		PRODUCTION_UNIT_DOCTYPE, production_unit, LINKED_WORKSTATION_FIELDNAME
	)
	return value or None


def validate_mapping_is_optional(production_unit: str) -> bool:
	"""Always returns True for an unmapped Production Unit; never raises.

	This is mostly a documentation/test anchor for the TODO.md V3-60
	constraint "must NOT touch: mandatory workstation" -- it exists so a
	test can assert, explicitly, that no code path in this module (or
	anywhere else) ever requires `get_mapped_workstation` to return a
	non-`None` value for a Production Unit to be considered valid.
	"""
	# Deliberately does not call frappe.throw / raise under any condition:
	# an absent mapping is always a valid state.
	get_mapped_workstation(production_unit)
	return True


def _require_manager(actor: str) -> None:
	roles = set(frappe.get_roles(actor))
	if not (roles & MANAGER_ROLES):
		raise WorkstationMappingError(
			f"{actor} is not permitted to set a Production Unit -> Workstation mapping.",
			reason_code="NOT_PERMITTED",
		)


def _resolve_production_unit_company(production_unit: str) -> str | None:
	branch = frappe.db.get_value(PRODUCTION_UNIT_DOCTYPE, production_unit, "branch")
	if not branch:
		return None
	return frappe.db.get_value("Branch", branch, "company")


def _resolve_workstation_company(workstation: str) -> str | None:
	warehouse = frappe.db.get_value(WORKSTATION_DOCTYPE, workstation, "warehouse")
	if not warehouse:
		return None
	return frappe.db.get_value("Warehouse", warehouse, "company")


def set_workstation_mapping(production_unit: str, workstation: str, actor: str) -> dict:
	"""Set (or clear, with `workstation=None`) the optional mapping.

	Permission-checked (manager role required, see `MANAGER_ROLES`).
	Validates:
	- the target Workstation actually exists,
	- the Production Unit exists,
	- when both the Production Unit's company (via `Branch.company`) and the
	  Workstation's company (via `Workstation.warehouse -> Warehouse.company`)
	  are resolvable, they must match -- "consistent scope" for this task is
	  defined as same company; branch-level scoping is not enforced because
	  ERPNext's `Workstation` has no branch concept.

	Raises `WorkstationMappingError` (fail-closed) with a `reason_code` on
	any failure: `NOT_PERMITTED`, `PRODUCTION_UNIT_NOT_FOUND`,
	`WORKSTATION_NOT_FOUND`, `COMPANY_SCOPE_MISMATCH`, or `FIELD_NOT_APPLIED`
	(the proposed field has not been migrated onto this site yet -- writing
	is refused rather than silently failing).

	This function performs a write via `frappe.db.set_value`; it is not
	called from anywhere else in this task (no live integration).
	"""
	_require_manager(actor)

	if not frappe.db.exists(PRODUCTION_UNIT_DOCTYPE, production_unit):
		raise WorkstationMappingError(
			f"Production Unit {production_unit} does not exist.",
			reason_code="PRODUCTION_UNIT_NOT_FOUND",
		)

	if workstation and not frappe.db.exists(WORKSTATION_DOCTYPE, workstation):
		raise WorkstationMappingError(
			f"Workstation {workstation} does not exist.",
			reason_code="WORKSTATION_NOT_FOUND",
		)

	if workstation:
		pu_company = _resolve_production_unit_company(production_unit)
		ws_company = _resolve_workstation_company(workstation)
		if pu_company and ws_company and pu_company != ws_company:
			raise WorkstationMappingError(
				f"Workstation {workstation} (company {ws_company}) is not in the same "
				f"company as Production Unit {production_unit} (company {pu_company}).",
				reason_code="COMPANY_SCOPE_MISMATCH",
			)

	if not _field_exists(PRODUCTION_UNIT_DOCTYPE, LINKED_WORKSTATION_FIELDNAME):
		raise WorkstationMappingError(
			"The proposed 'linked_workstation' field has not been applied to "
			"URY Production Unit on this site yet -- see "
			"proposed_workstation_mapping_field.md. Refusing to write.",
			reason_code="FIELD_NOT_APPLIED",
		)

	frappe.db.set_value(
		PRODUCTION_UNIT_DOCTYPE, production_unit, LINKED_WORKSTATION_FIELDNAME, workstation
	)
	return {
		"production_unit": production_unit,
		"linked_workstation": workstation,
		"actor": actor,
	}
