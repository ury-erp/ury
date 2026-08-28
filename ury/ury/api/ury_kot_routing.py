# ury_kot_routing.py
#
# Purely additive, read-only routing-resolution module for item-to-production-unit
# routing (task V3-51).
#
# This module does NOT create, mutate, or submit any documents. It does not touch
# `ury_kot_generate.py`. Wiring this module's `resolve_production_units()` into the
# live KOT creation path is an explicit, separate, not-yet-done integration step
# that requires its own review, since `ury_kot_generate.py` is live production code
# with explicitly-preserved routing behavior.
#
# Precedence implemented (per V3-50 "Routing Precedence for V3-51" contract):
#   1. Active `URY Item Production Configuration` exact item mapping
#      (company/branch/department/production_unit/production_policy/service_context
#      scoped, where those fields exist on the doctype).
#   2. Multiple ambiguous exact mappings fail closed (`ROUTING_AMBIGUOUS`) — no
#      partial/guessed result.
#   3. No exact mapping -> fall back to the CURRENT branch-scoped
#      `URY Production Unit.item_groups` matching, replicated read-only from
#      `ury_kot_generate.py` (see `_legacy_item_group_fallback` docstring for the
#      exact source it mirrors).
#   4. Disabled department / disabled production unit blocks routing for
#      controlled items (`DEPARTMENT_DISABLED` / `PRODUCTION_UNIT_DISABLED`).
#   5. Missing branch/company scope, or an unresolved production unit for a
#      controlled item, fails closed (`ROUTING_NOT_CONFIGURED`).
#   6. `production_policy == "DIRECT_RETAIL"` items are not forced into
#      production-unit execution unless an exact config explicitly routes them —
#      returns an empty list (not an error) in that case.

import frappe

ITEM_PRODUCTION_CONFIG_DOCTYPE = "URY Item Production Configuration"
PRODUCTION_UNIT_DOCTYPE = "URY Production Unit"
PRODUCTION_ITEM_GROUPS_DOCTYPE = "URY Production Item Groups"
PRODUCTION_DEPARTMENT_DOCTYPE = "URY Production Department"

DIRECT_RETAIL_POLICY = "DIRECT_RETAIL"

# Stable reason codes. Treat these strings as a contract for callers.
ROUTING_AMBIGUOUS = "ROUTING_AMBIGUOUS"
ROUTING_NOT_CONFIGURED = "ROUTING_NOT_CONFIGURED"
DEPARTMENT_DISABLED = "DEPARTMENT_DISABLED"
PRODUCTION_UNIT_DISABLED = "PRODUCTION_UNIT_DISABLED"


class RoutingError(Exception):
    """Raised whenever routing resolution must fail closed.

    `reason_code` is one of the stable ROUTING_* / *_DISABLED constants above.
    Callers should branch on `reason_code`, not on the message text.
    """

    def __init__(self, reason_code, message=None):
        self.reason_code = reason_code
        super().__init__(message or reason_code)


def resolve_production_units(
    item_code,
    company,
    branch,
    department=None,
    production_policy=None,
    service_context=None,
):
    """Resolve the Production Unit(s) an item should route to.

    Read-only. Returns a list of `URY Production Unit` names (mirroring the
    "one KOT per matching Production Unit" shape `ury_kot_generate.py` currently
    produces via its Item Group match), or an empty list for direct-retail items
    that have no explicit routing configuration.

    Raises `RoutingError` (see reason codes above) whenever routing cannot be
    safely determined for a controlled (non-direct-retail-implicit) item.
    """
    if not item_code:
        raise RoutingError(ROUTING_NOT_CONFIGURED, "item_code is required to resolve routing")
    if not company or not branch:
        raise RoutingError(
            ROUTING_NOT_CONFIGURED, "company and branch scope are required to resolve routing"
        )

    exact_matches = _get_exact_mappings(
        item_code=item_code,
        company=company,
        branch=branch,
        department=department,
        production_policy=production_policy,
        service_context=service_context,
    )

    if exact_matches:
        if len(exact_matches) > 1:
            raise RoutingError(
                ROUTING_AMBIGUOUS,
                f"Multiple active URY Item Production Configuration records match "
                f"item {item_code} for branch {branch}: "
                f"{[m['name'] for m in exact_matches]}",
            )
        return _resolve_from_exact_match(exact_matches[0])

    # No exact mapping. Direct-retail items are not forced into production-unit
    # execution unless an explicit config said otherwise (handled above).
    if production_policy == DIRECT_RETAIL_POLICY:
        return []

    fallback_units = _legacy_item_group_fallback(item_code, branch)
    if not fallback_units:
        raise RoutingError(
            ROUTING_NOT_CONFIGURED,
            f"No exact mapping and no legacy Item Group match found for item "
            f"{item_code} in branch {branch}; routing cannot be determined for "
            f"this controlled item.",
        )
    return fallback_units


def _resolve_from_exact_match(config_row):
    department = config_row.get("department")
    production_unit = config_row.get("production_unit")

    _assert_department_enabled(department)

    if not production_unit:
        raise RoutingError(
            ROUTING_NOT_CONFIGURED,
            f"URY Item Production Configuration {config_row.get('name')} has no "
            f"production_unit set",
        )

    _assert_production_unit_enabled(production_unit)
    return [production_unit]


def _get_exact_mappings(item_code, company, branch, department, production_policy, service_context):
    """Query active exact item mappings, scoping by every field that both the
    caller supplied AND actually exists on the `URY Item Production
    Configuration` doctype (kept defensive since this module is additive and
    may run against a schema revision where some scoping fields, e.g.
    `company`/`service_context`, have not landed yet)."""
    if not frappe.db.exists("DocType", ITEM_PRODUCTION_CONFIG_DOCTYPE):
        return []

    fieldnames = _doctype_fieldnames(ITEM_PRODUCTION_CONFIG_DOCTYPE)

    filters = {"item": item_code, "branch": branch}
    if "active" in fieldnames:
        filters["active"] = 1

    optional_scopes = {
        "company": company,
        "department": department,
        "production_policy": production_policy,
        "service_context": service_context,
    }
    for fieldname, value in optional_scopes.items():
        if value is not None and fieldname in fieldnames:
            filters[fieldname] = value

    return frappe.get_all(
        ITEM_PRODUCTION_CONFIG_DOCTYPE,
        filters=filters,
        fields=["name", "production_unit", "department"],
    )


def _legacy_item_group_fallback(item_code, branch):
    """Replicates, read-only, the exact matching logic `ury_kot_generate.py`
    currently uses to route an item to one or more Production Units via
    branch-scoped `URY Production Unit.item_groups`.

    This mirrors `get_all_production_item_groups()` and the per-production-unit
    matching loop inside `process_items_for_kot()` in
    `ury/ury/api/ury_kot_generate.py` (read-only reference, not imported/edited):

        productions = frappe.db.get_all(
            "URY Production Unit", filters={"branch": pos_profile.branch}, fields=["name"]
        )
        ...
        for production in productions:
            productionItemGroupslist = frappe.get_all(
                "URY Production Item Groups",
                fields=["item_group"],
                filters={
                    "parent": production.name,
                    "parenttype": "URY Production Unit",
                },
                order_by="idx",
            )
            productionItemGroups = [
                item_group.item_group for item_group in productionItemGroupslist
            ]
            production_items = [
                item
                for item in kot_items
                if frappe.db.get_value("Item", item["item_code"], "item_group")
                in productionItemGroups
            ]

    Here, instead of building `production_items` for a batch of KOT items and
    creating KOT documents, we test a single `item_code` and collect the names
    of every Production Unit whose `item_groups` table contains that item's
    Item Group -- preserving the "an item can match multiple units, one KOT per
    unit" list shape.
    """
    productions = frappe.db.get_all(
        PRODUCTION_UNIT_DOCTYPE, filters={"branch": branch}, fields=["name"]
    )
    if not productions:
        return []

    item_group = frappe.db.get_value("Item", item_code, "item_group")
    if not item_group:
        return []

    matched_units = []
    for production in productions:
        production_item_groups_list = frappe.get_all(
            PRODUCTION_ITEM_GROUPS_DOCTYPE,
            fields=["item_group"],
            filters={
                "parent": production.name,
                "parenttype": PRODUCTION_UNIT_DOCTYPE,
            },
            order_by="idx",
        )
        production_item_groups = [
            row.item_group for row in production_item_groups_list
        ]
        if item_group in production_item_groups:
            matched_units.append(production.name)

    return matched_units


def _assert_department_enabled(department):
    if not department:
        return
    if not frappe.db.exists("DocType", PRODUCTION_DEPARTMENT_DOCTYPE):
        # Doctype not present in this schema revision yet; nothing to gate on.
        return
    fieldnames = _doctype_fieldnames(PRODUCTION_DEPARTMENT_DOCTYPE)
    if "enabled" not in fieldnames:
        return
    enabled = frappe.db.get_value(PRODUCTION_DEPARTMENT_DOCTYPE, department, "enabled")
    if enabled is not None and not enabled:
        raise RoutingError(
            DEPARTMENT_DISABLED, f"URY Production Department {department} is disabled"
        )


def _assert_production_unit_enabled(production_unit):
    if not frappe.db.exists(PRODUCTION_UNIT_DOCTYPE, production_unit):
        raise RoutingError(
            ROUTING_NOT_CONFIGURED,
            f"Configured production_unit {production_unit} does not exist",
        )
    fieldnames = _doctype_fieldnames(PRODUCTION_UNIT_DOCTYPE)
    if "enabled" not in fieldnames:
        # Field not present in this schema revision yet; nothing to gate on.
        return
    enabled = frappe.db.get_value(PRODUCTION_UNIT_DOCTYPE, production_unit, "enabled")
    if enabled is not None and not enabled:
        raise RoutingError(
            PRODUCTION_UNIT_DISABLED, f"URY Production Unit {production_unit} is disabled"
        )


def _doctype_fieldnames(doctype):
    meta = frappe.get_meta(doctype)
    return {df.fieldname for df in meta.fields}
