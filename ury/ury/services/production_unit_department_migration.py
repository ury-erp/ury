from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable

try:
    import frappe
except ModuleNotFoundError:  # pragma: no cover - allows host-side unit tests
    class _StubDB:
        def exists(self, *args: Any, **kwargs: Any) -> bool:
            return False

        def get_value(self, *args: Any, **kwargs: Any) -> Any:
            return None

    class _StubFrappe:
        db = _StubDB()

        def get_all(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            return []

        def get_doc(self, *args: Any, **kwargs: Any) -> Any:
            raise ModuleNotFoundError("frappe is not available in this host test environment")

    frappe = _StubFrappe()


MIGRATION_VERSION = "v3-14"
TARGET_DOCTYPE = "URY Production Department"
SOURCE_DOCTYPE = "URY Production Unit"
DEFAULT_ISSUE_POLICY = "Plan Controlled"


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip()


def _stable_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _idempotency_payload(
    rows: Iterable[dict[str, Any]],
    resolved_payloads: Iterable[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = {
        "migration": MIGRATION_VERSION,
        "rows": [
            {
                "source_name": row["source_name"],
                "target_department_name": row["target_department_name"],
                "branch": row.get("branch"),
                "pos_profile": row.get("pos_profile"),
                "warehouse": row.get("warehouse"),
                "department": row.get("department"),
            }
            for row in rows
        ],
    }
    if resolved_payloads is not None:
        payload["resolved_payloads"] = list(resolved_payloads)
    return payload


def _get_production_units() -> list[dict[str, Any]]:
    return frappe.get_all(
        SOURCE_DOCTYPE,
        fields=["name", "production", "pos_profile", "branch", "warehouse", "department"],
        order_by="name asc",
    )


def _build_target_name(unit_row: dict[str, Any]) -> str:
    base = _normalize(unit_row.get("production")) or unit_row["name"]
    return base


def _resolve_company(unit_row: dict[str, Any]) -> str | None:
    companies: list[str] = []
    for fieldname, doctype in (("warehouse", "Warehouse"), ("branch", "Branch"), ("pos_profile", "POS Profile")):
        value = unit_row.get(fieldname)
        if not value or not frappe.db.exists(doctype, value):
            continue
        company = frappe.db.get_value(doctype, value, "company")
        if company:
            companies.append(company)

    distinct_companies = sorted(set(companies))
    if len(distinct_companies) != 1:
        return None
    return distinct_companies[0]


def _resolve_cost_center(company: str | None) -> str | None:
    if not company:
        return None

    cost_centers = frappe.get_all(
        "Cost Center",
        filters={"company": company, "is_group": 0},
        pluck="name",
        limit=2,
    )
    if len(cost_centers) != 1:
        return None
    return cost_centers[0]


def _department_issue_fieldnames() -> list[str]:
    fieldnames = ["issue_policy"]
    try:
        meta = frappe.get_meta(TARGET_DOCTYPE)
    except Exception:  # pragma: no cover - host-side tests stub frappe
        return fieldnames

    docfield_names = {field.fieldname for field in getattr(meta, "fields", [])}
    if "issue_policy" in docfield_names:
        fieldnames = ["issue_policy"]
    if "allow_issue_override" in docfield_names:
        fieldnames.append("allow_issue_override")
    return fieldnames


def _build_compatibility_record(unit_row: dict[str, Any]) -> dict[str, Any]:
    target_department = _build_target_name(unit_row)
    return {
        "source_doctype": SOURCE_DOCTYPE,
        "source_name": unit_row["name"],
        "source_department_name": _normalize(unit_row.get("production")) or unit_row["name"],
        "target_doctype": TARGET_DOCTYPE,
        "target_department_name": target_department,
        "branch": unit_row.get("branch"),
        "pos_profile": unit_row.get("pos_profile"),
        "warehouse": unit_row.get("warehouse"),
        "department": unit_row.get("department"),
        "preserve_kot_routing": True,
        "preserve_warehouse": True,
    }


def build_production_department_migration_plan(
    production_units: Iterable[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    units = list(production_units) if production_units is not None else _get_production_units()

    plan_rows: list[dict[str, Any]] = []
    for row in units:
        plan_rows.append(_build_compatibility_record(row))

    return {
        "migration": MIGRATION_VERSION,
        "source_doctype": SOURCE_DOCTYPE,
        "target_doctype": TARGET_DOCTYPE,
        "dry_run": True,
        "idempotency_key": _stable_hash(_idempotency_payload(plan_rows)),
        "rows": plan_rows,
    }


def get_production_unit_department_mappings() -> dict[str, str]:
    """Return explicit unit->department links when the target doctype exists.

    Until the migration is explicitly applied, the compatibility layer returns an
    empty mapping so current Production Unit routing and warehouse semantics remain
    untouched.
    """

    if not frappe.db.exists("DocType", TARGET_DOCTYPE):
        return {}

    mappings: dict[str, str] = {}
    for unit in _get_production_units():
        department_name = frappe.db.get_value(
            TARGET_DOCTYPE,
            {"department_name": _build_target_name(unit)},
            "name",
        )
        if department_name:
            mappings[unit["name"]] = department_name
    return mappings


def resolve_production_department_for_unit(unit_name: str, default: str | None = None) -> str | None:
    mappings = get_production_unit_department_mappings()
    if unit_name in mappings:
        return mappings[unit_name]
    return default


def apply_production_department_migration(
    dry_run: bool = True,
) -> dict[str, Any]:
    plan = build_production_department_migration_plan()
    plan["dry_run"] = dry_run

    if dry_run:
        plan["applied"] = False
        plan["skipped_reason"] = "dry_run"
        return plan

    if not frappe.db.exists("DocType", TARGET_DOCTYPE):
        plan["applied"] = False
        plan["skipped_reason"] = "target_doctype_missing"
        return plan

    created: list[str] = []
    skipped: list[str] = []
    resolved_payloads: list[dict[str, Any]] = []
    for row in plan["rows"]:
        if frappe.db.exists(TARGET_DOCTYPE, {"department_name": row["target_department_name"]}):
            department_name = frappe.db.get_value(
                TARGET_DOCTYPE, {"department_name": row["target_department_name"]}, "name"
            )
            if department_name:
                _attach_unit_to_department(row["source_name"], department_name)
                created.append(department_name)
            else:
                skipped.append(row["target_department_name"])
            continue

        company = _resolve_company(row)
        cost_center = _resolve_cost_center(company)
        if not company or not cost_center:
            skipped.append(row["target_department_name"])
            continue

        department_payload = {
            "doctype": TARGET_DOCTYPE,
            "department_name": row["target_department_name"],
            "enabled": 1,
            "company": company,
            "branch": row["branch"],
            "department_warehouse": row["warehouse"],
            "cost_center": cost_center,
        }
        for fieldname in _department_issue_fieldnames():
            if fieldname == "allow_issue_override":
                department_payload[fieldname] = 0
            else:
                department_payload[fieldname] = DEFAULT_ISSUE_POLICY

        department = frappe.get_doc(department_payload)
        department.insert(ignore_permissions=True)
        resolved_payloads.append(
            {
                "source_name": row["source_name"],
                "target_department_name": row["target_department_name"],
                "company": company,
                "cost_center": cost_center,
                "department_payload": department_payload,
            }
        )
        _attach_unit_to_department(row["source_name"], department.name)
        created.append(department.name)

    plan["idempotency_key"] = _stable_hash(_idempotency_payload(plan["rows"], resolved_payloads))
    plan["applied"] = True
    plan["created"] = created
    plan["skipped"] = skipped
    return plan


def _attach_unit_to_department(unit_name: str, department_name: str) -> None:
    current_department = frappe.db.get_value(SOURCE_DOCTYPE, unit_name, "department")
    if current_department == department_name:
        return
    frappe.db.set_value(SOURCE_DOCTYPE, unit_name, "department", department_name, update_modified=False)
