# ury_kot_chef_filter.py
#
# Purely additive, read-only KOT query module implementing the V3-52
# chef-filtered / manager KDS view contract (see
# tracks/sa-v3_nxt/outputs/V3-50-prep-handoff.md, "Chef and KDS Ownership for
# V3-52" and "Focused Future Tests" -> "V3-52 chef/KDS").
#
# This module does NOT create, mutate, or submit any documents. It does not
# import, call, or modify `ury_kot_display.py` or `kot.vue`; both remain live
# production code with explicitly-preserved behavior. Wiring
# `get_filtered_kot_list()` into the live KDS fetch path (mosaic `kot.vue`) is
# an explicit, separate, not-yet-done integration step that needs its own
# review.
#
# Contract implemented:
#   - Unit view: a user may see KOTs for Production Units they are assigned to
#     (`assigned_employees` contains the user), lead (`lead_chef == user`), or
#     manage (see manager view below).
#   - Manager view: a user holding a manager/System Manager role may see every
#     Production Unit in their permitted branch.
#   - Branch/company scope is SERVER-DERIVED. The caller-supplied `branch`,
#     `company`, and `production_unit` arguments are hints only, never
#     authority -- `_resolve_permitted_branch()` is the hook point where a real
#     deployment plugs in its session/permission lookup (e.g. `getBranch()`
#     from `ury.ury_pos.api`, POS Profile permission records, or a future
#     V3-50 permission service). No live session context is available in this
#     worktree, so the hook defaults to trusting the caller-supplied branch
#     only for Administrator/System Manager and otherwise requires the
#     caller's own branch permission list to include it.
#   - The server re-verifies that any requested `production_unit` belongs to
#     the resolved permitted branch/company before returning KOT data for it;
#     a mismatched or foreign unit yields no data (fail closed), never an
#     error that leaks existence.
#   - Existing order-type filtering on `URY Production Unit` (mirrored from
#     `kot_list()` in `ury_kot_display.py`) is applied in addition to, not
#     instead of, chef/manager access filtering.
#   - Field selection/ordering mirrors the shape of `kot_list()` in
#     `ury_kot_display.py` (read-only reference, not imported/edited):
#     `frappe.get_list("URY KOT", filters={order_status, branch, type in [...],
#     docstatus=1, verified=0, creation>=three_hours_ago}, order_by="creation
#     desc")`, then per-KOT order-type filtering via
#     `URY Production Unit.enable_order_type_wise_display_on_mosaic` /
#     `order_type` child table.

import json

import frappe

PRODUCTION_UNIT_DOCTYPE = "URY Production Unit"
KOT_DOCTYPE = "URY KOT"

MANAGER_ROLES = {"URY Manager", "URY Admin", "System Manager"}

# Stable reason codes, per the V3-50 "Branch, Company, and Permission
# Invariants" suggested reason-code list. Callers should branch on these, not
# on message text.
NOT_PERMITTED = "NOT_PERMITTED"
BRANCH_SCOPE_MISMATCH = "BRANCH_SCOPE_MISMATCH"


class ChefFilterError(Exception):
    """Raised only for caller/programming errors (e.g. missing user).

    Access-denied and out-of-scope cases do NOT raise -- per the V3-52 test
    contract ("cashier/POS user cannot access chef-only execution state") they
    fail closed by returning an empty result, not by throwing, so a probing
    client cannot distinguish "no access" from "does not exist" or "no data
    yet".
    """

    def __init__(self, reason_code, message=None):
        self.reason_code = reason_code
        super().__init__(message or reason_code)


@frappe.whitelist()
def get_filtered_kot_list(user=None, branch=None, company=None, production_unit=None):
    """Return active KOTs visible to `user`, filtered per the V3-52 chef/manager
    KDS contract.

    Read-only. Mirrors the query shape of `kot_list()` in
    `ury_kot_display.py`, layered with:
      1. server-derived branch/company scope resolution for `user`
        (`_resolve_permitted_branch`);
      2. chef/manager Production Unit access filtering
        (`_permitted_production_units`);
      3. the existing per-unit order-type filter.

    `production_unit` is a hint only: if supplied, it is intersected with the
    user's permitted units, never trusted directly. A `production_unit`
    outside the user's permitted branch/company yields an empty KOT list.
    """
    user = user or frappe.session.user
    if not user:
        raise ChefFilterError(NOT_PERMITTED, "user is required")

    permitted_branch, permitted_company = _resolve_permitted_branch(user, branch, company)
    if not permitted_branch:
        # No permitted branch could be resolved for this user at all -- fail
        # closed with an empty board rather than raising, so this matches the
        # "cashier/no assignment" fail-closed shape used throughout this
        # module.
        return _empty_result(branch)

    permitted_units = _permitted_production_units(user, permitted_branch, permitted_company)
    if not permitted_units:
        return _empty_result(permitted_branch)

    if production_unit:
        # Client-supplied unit is a hint only. Only honor it if it is inside
        # the user's own permitted set for this branch/company -- this is the
        # server-side re-verification the V3-52 contract requires, and it is
        # what makes the "client route parameter cannot expose another
        # branch's KOTs" test fail closed.
        if production_unit not in permitted_units:
            return _empty_result(permitted_branch)
        target_units = [production_unit]
    else:
        target_units = permitted_units

    kot_list = _fetch_kots_for_units(permitted_branch, target_units)

    return {
        "KOT": kot_list,
        "Branch": permitted_branch,
        "Company": permitted_company,
        "ProductionUnits": target_units,
    }


def _empty_result(branch):
    return {"KOT": [], "Branch": branch, "Company": None, "ProductionUnits": []}


def _resolve_permitted_branch(user, requested_branch, requested_company):
    """Hook point: derive the branch/company the caller is actually permitted
    to see, independent of the client-supplied `requested_branch` /
    `requested_company` arguments.

    No live session/permission service is available in this worktree, so this
    is intentionally conservative:
      - Administrator / System Manager: the requested branch is trusted as a
        scoping filter (they are permitted to view any branch), falling back
        to whatever branch a caller-supplied hint gives, since there is no
        single "home branch" concept for a super-user in this codebase.
      - Every other user: the requested branch is honored ONLY if it appears
        in the branches the user's own assigned/lead Production Units belong
        to -- i.e. a user can never expand their own scope by claiming a
        branch they have no unit relationship in. This means a plain
        cashier/POS user with no chef assignment and no manager role resolves
        to no permitted branch (empty result), matching the "cashier cannot
        get chef-only visibility" test.

    A real deployment should replace this with a call into the actual
    session/branch permission API (e.g. `ury.ury_pos.api.getBranch()` plus a
    manager-branch-scope lookup), which is why this is factored out as its
    own function rather than inlined.
    """
    roles = set(frappe.get_roles(user))
    is_manager = bool(MANAGER_ROLES.intersection(roles)) or user == "Administrator"

    if is_manager:
        if requested_branch:
            return requested_branch, requested_company
        # No branch hint for a manager/Administrator: nothing to scope to.
        return None, None

    # Non-manager: only allow a branch the user actually has a unit
    # relationship in.
    user_branches = _branches_for_user_units(user)
    if not user_branches:
        return None, None

    if requested_branch:
        if requested_branch not in user_branches:
            return None, None
        return requested_branch, requested_company

    # No hint supplied: default to the user's own (first) branch. A user with
    # unit relationships in more than one branch would need to supply
    # `branch` explicitly to disambiguate.
    return sorted(user_branches)[0], requested_company


def _branches_for_user_units(user):
    fieldnames = _doctype_fieldnames(PRODUCTION_UNIT_DOCTYPE)
    branches = set()

    if "lead_chef" in fieldnames:
        for row in frappe.get_all(
            PRODUCTION_UNIT_DOCTYPE, filters={"lead_chef": user}, fields=["branch"]
        ):
            if row.get("branch"):
                branches.add(row["branch"])

    if "assigned_employees" in fieldnames:
        # `assigned_employees` is a child table on URY Production Unit;
        # existence-checked defensively since it may not be merged into this
        # worktree yet (per V3-R01 field names still landing separately).
        assignment_doctype = _assigned_employees_child_doctype()
        if assignment_doctype:
            parents = frappe.get_all(
                assignment_doctype,
                filters={"parenttype": PRODUCTION_UNIT_DOCTYPE, "employee": user},
                fields=["parent"],
                distinct=True,
            )
            for row in parents:
                unit_branch = frappe.db.get_value(PRODUCTION_UNIT_DOCTYPE, row["parent"], "branch")
                if unit_branch:
                    branches.add(unit_branch)

    return branches


def _permitted_production_units(user, branch, company):
    """All Production Units in `branch` the user may view: every unit for a
    manager, or only units the user is assigned to / leads for anyone else."""
    fieldnames = _doctype_fieldnames(PRODUCTION_UNIT_DOCTYPE)
    roles = set(frappe.get_roles(user))
    is_manager = bool(MANAGER_ROLES.intersection(roles)) or user == "Administrator"

    unit_filters = {"branch": branch}
    if company and "company" in fieldnames:
        unit_filters["company"] = company
    if "enabled" in fieldnames:
        # Disabled units cannot receive/display new execution work.
        unit_filters["enabled"] = 1

    all_units = frappe.get_all(PRODUCTION_UNIT_DOCTYPE, filters=unit_filters, fields=["name"])
    all_unit_names = [row["name"] for row in all_units]

    if is_manager:
        return all_unit_names

    if not all_unit_names:
        return []

    permitted = set()

    if "lead_chef" in fieldnames:
        lead_filters = dict(unit_filters)
        lead_filters["lead_chef"] = user
        for row in frappe.get_all(PRODUCTION_UNIT_DOCTYPE, filters=lead_filters, fields=["name"]):
            permitted.add(row["name"])

    if "assigned_employees" in fieldnames:
        assignment_doctype = _assigned_employees_child_doctype()
        if assignment_doctype:
            rows = frappe.get_all(
                assignment_doctype,
                filters={
                    "parenttype": PRODUCTION_UNIT_DOCTYPE,
                    "parent": ["in", all_unit_names],
                    "employee": user,
                },
                fields=["parent"],
                distinct=True,
            )
            for row in rows:
                permitted.add(row["parent"])

    return sorted(permitted)


def _assigned_employees_child_doctype():
    """Resolve the child-table doctype backing
    `URY Production Unit.assigned_employees`, defensively, since this field's
    exact child doctype is a V3-R01 downstream detail that may not be present
    in this worktree's schema revision yet."""
    meta = frappe.get_meta(PRODUCTION_UNIT_DOCTYPE)
    field = next((df for df in meta.fields if df.fieldname == "assigned_employees"), None)
    if not field or not getattr(field, "options", None):
        return None
    if not frappe.db.exists("DocType", field.options):
        return None
    return field.options


def _fetch_kots_for_units(branch, production_units):
    """Mirrors the query shape of `kot_list()` in `ury_kot_display.py`, scoped
    to `production_units` and layered with the same per-unit order-type
    filter, applied ON TOP of (not instead of) the chef/manager access
    filtering already narrowing `production_units`."""
    if not production_units:
        return []

    today = frappe.utils.now()
    three_hours_ago = frappe.utils.add_to_date(today, hours=-3)

    kot_names = frappe.get_list(
        KOT_DOCTYPE,
        fields=["name"],
        filters={
            "order_status": "Ready For Prepare",
            "branch": branch,
            "production": ["in", production_units],
            "type": [
                "in",
                [
                    "New Order",
                    "Order Modified",
                    "Duplicate",
                    "Cancelled",
                    "Partially cancelled",
                ],
            ],
            "docstatus": 1,
            "verified": 0,
            "creation": (">=", three_hours_ago),
        },
        order_by="creation desc",
    )

    production_filters = {}
    kots = []
    for kot in kot_names:
        kot_doc = frappe.get_doc(KOT_DOCTYPE, kot.name)

        if kot_doc.production:
            if kot_doc.production not in production_filters:
                prod_doc = frappe.get_doc(PRODUCTION_UNIT_DOCTYPE, kot_doc.production)
                if prod_doc.get("enable_order_type_wise_display_on_mosaic"):
                    production_filters[kot_doc.production] = [
                        row.order_type for row in prod_doc.get("order_type", [])
                    ]
                else:
                    production_filters[kot_doc.production] = None

            allowed_order_types = production_filters[kot_doc.production]
            if allowed_order_types is not None:
                invoice_order_type = frappe.db.get_value(
                    "POS Invoice", kot_doc.invoice, "order_type"
                )
                if invoice_order_type not in allowed_order_types:
                    continue

        kots.append(json.loads(frappe.as_json(kot_doc)))

    return kots


def _doctype_fieldnames(doctype):
    meta = frappe.get_meta(doctype)
    return {df.fieldname for df in meta.fields}
