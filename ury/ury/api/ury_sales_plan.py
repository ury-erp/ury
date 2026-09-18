"""Governed Sales Plan state and approval snapshot helpers."""

import hashlib
import json

import frappe
from frappe import _
from frappe.model.workflow import (
    apply_workflow,
    get_transitions,
    get_workflow_name,
    is_transition_condition_satisfied,
)

from ury.ury.api.ury_production_validation import validate_item_production_configuration


def transition_sales_plan(doc, target_state, actor=None):
    """Apply a state transition via Frappe's real Workflow engine.

    Finds the workflow transition whose current state matches ``doc.status``
    and whose ``next_state`` equals ``target_state``, then calls
    ``apply_workflow()`` for that transition's action. ``apply_workflow()``
    both enforces the role gating declared in the "URY Sales Plan" Workflow
    fixture (raising ``frappe.PermissionError``/``WorkflowPermissionError``
    if the current user's role doesn't allow the transition) and performs the
    actual save -- including a real ``doc.submit()``/``doc.cancel()`` when the
    transition crosses a ``doc_status`` boundary (see
    ``ury/fixtures/workflow.json``: Approved/Locked for Production are
    doc_status 1, Superseded/Cancelled is doc_status 2). This replaces the
    hand-rolled ``TRANSITIONS`` edge dict that used to live here -- it was a
    second, independently-maintained copy of the same graph Frappe's own
    ``validate_workflow()`` already re-checks on every save.

    The guardrails that used to run here directly (scope check, item
    validation, approval-snapshot freeze, audit append) now run
    unconditionally inside ``URYSalesPlan.validate()`` on every ``doc.save()``
    -- including Desk/Workflow-driven transitions -- so this function does
    not duplicate them.
    """
    current = doc.get("status") or "Draft"
    workflow_name = get_workflow_name(doc.doctype)
    if not workflow_name:
        frappe.throw(_("Invalid Sales Plan transition from {0} to {1}").format(current, target_state), frappe.ValidationError)

    transitions = get_transitions(doc, raise_exception=False)
    transition = next((t for t in transitions if t.state == current and t.next_state == target_state), None)
    if not transition:
        # Either there is no such edge in the workflow at all, or the current
        # user's role does not permit it (get_transitions() already filters
        # by frappe.get_roles()) -- in the latter case surface a
        # PermissionError instead of a generic ValidationError so callers can
        # distinguish "no such transition" from "not allowed to do this".
        all_transitions = frappe.get_doc("Workflow", workflow_name).transitions
        matching = [t for t in all_transitions if t.state == current and t.next_state == target_state]
        if matching:
            if not any(is_transition_condition_satisfied(t, doc) for t in matching):
                frappe.throw(
                    _("Invalid Sales Plan transition from {0} to {1}").format(current, target_state),
                    frappe.ValidationError,
                )
            frappe.throw(_("Not permitted to change this Sales Plan"), frappe.PermissionError)
        frappe.throw(_("Invalid Sales Plan transition from {0} to {1}").format(current, target_state), frappe.ValidationError)

    return apply_workflow(doc, transition.action)


def _validate_plan_scope(doc):
    branch = doc.get("branch")
    company = doc.get("company")
    if not branch or not company:
        frappe.throw(_("Sales Plan branch and company are required"), frappe.ValidationError)
    branch_company = frappe.db.get_value("Branch", branch, "company")
    if not branch_company or branch_company != company:
        frappe.throw(_("Sales Plan branch and company do not match"), frappe.ValidationError)


def validate_plan_items(doc):
    """Validate every mapped line that is actually part of the plan before
    approval can freeze demand.

    The comparable-history panel pre-populates every catalog item the branch
    has ever sold as a row on the plan, most left at their default
    ``qty: 0`` -- they are suggestions the user never acted on, not lines the
    user is actually planning. Requiring a complete production configuration
    (department/BOM/etc.) for those untouched rows would make history-derived
    suggestions gate approval of the whole plan, exactly what
    "historical-data-driven suggestions must be additive, never gating"
    (see PLAN.md's own Context and the workspace's
    feedback_history_is_suggestion_not_precondition memory) forbids. Only a
    row with a nonzero qty is actually being planned, so only those need a
    valid production configuration.
    """
    for row in doc.get("items") or []:
        item_code = row.get("item_code")
        if not item_code:
            frappe.throw(_("Sales Plan item is required"), frappe.ValidationError)
        if not row.get("qty"):
            continue
        validate_item_production_configuration(item_code, doc.get("branch"))


def validate_no_overlapping_plan_scope(doc):
    """Reject approval if another Approved/Locked plan already covers the
    same item+branch+day scope as any row on this plan.

    Decided design (see tracks/sa-architecture-closure/item3-sales-plan-capping-plan.md
    open question #1): rather than letting `_resolve_plan_remaining` silently
    sum across multiple matching plans and letting `ury_sales_plan_commit`'s
    counter-mutation helper pick an ambiguous winner at reservation time, this
    disallows the overlap outright at the point a plan is approved -- the
    earliest, clearest place to catch it, and the one place a human is
    actively making the "this is now governing" decision.

    Scope is per Sales Plan Item row: an overlap on ANY item shared between
    this plan and an existing Approved/Locked plan for the same branch and
    `plan_date` blocks the whole approval (company/branch/plan_date are
    already the parent Sales Plan's own scope, so only `item_code` needs to
    be compared row-by-row against the other plan's rows).
    """
    branch = doc.get("branch")
    plan_date = doc.get("plan_date")
    if not branch or not plan_date:
        return

    item_codes = {row.get("item_code") for row in (doc.get("items") or []) if row.get("item_code")}
    if not item_codes:
        return

    other_plan_names = frappe.get_all(
        "URY Sales Plan",
        filters={
            "branch": branch,
            "plan_date": plan_date,
            "status": ["in", ["Approved", "Locked for Production"]],
            "name": ["!=", doc.name or ""],
        },
        pluck="name",
    )
    if not other_plan_names:
        return

    conflicts = frappe.get_all(
        "URY Sales Plan Item",
        filters={"parent": ["in", other_plan_names], "item_code": ["in", list(item_codes)]},
        fields=["item_code", "parent"],
        order_by="parent asc",
    )
    if not conflicts:
        return

    conflict = conflicts[0]
    conflict_status = frappe.db.get_value("URY Sales Plan", conflict["parent"], "status")
    frappe.throw(
        _(
            "Cannot approve: Item {0} at Branch {1} on {2} is already covered by Sales "
            "Plan {3} ({4}). Overlapping Approved/Locked-for-Production plans for the "
            "same item/branch/day are not allowed."
        ).format(conflict["item_code"], branch, plan_date, conflict["parent"], conflict_status),
        frappe.ValidationError,
    )


def flag_stale_bom_revisions(doc):
    """Surface (never block on) plan rows computed from a now-outdated BOM.

    Each row's `bom_revision` was captured (in `save_draft`, from the BOM's
    `custom_bom_revision` -- see `ury.ury.hooks.ury_bom.set_bom_revision`)
    at the time the row was added to the plan. If the linked BOM has since
    been resaved with different yield-adjusted quantities (e.g. because a
    component Item's `custom_yield_percent` standard changed), the BOM's
    current `custom_bom_revision` will differ from what this row captured
    -- meaning the row's `qty` requirement may have been computed from a
    stale standard.

    This only sets an informational `bom_revision_stale` flag on each row;
    it never raises. A Draft/Proposed plan must remain free to still
    reflect a stale calculation while a reviewer looks at it -- only
    `freeze_approval_snapshot` (which runs on the Approved transition)
    actually locks values in, and by design this function is only called
    for plans that haven't reached that point yet (see `validate()` in
    `ury.ury.doctype.ury_sales_plan.ury_sales_plan`).
    """
    for row in doc.get("items") or []:
        bom = row.get("bom")
        captured_revision = row.get("bom_revision")
        if not bom or not captured_revision:
            row.bom_revision_stale = 0
            continue
        current_revision = frappe.db.get_value("BOM", bom, "custom_bom_revision")
        row.bom_revision_stale = 1 if current_revision and current_revision != captured_revision else 0


def freeze_approval_snapshot(doc):
    """Freeze approved demand and mapping inputs into a deterministic snapshot."""
    if doc.get("approval_snapshot"):
        return doc.approval_snapshot
    payload = {
        "branch": doc.get("branch"),
        "company": doc.get("company"),
        "plan_date": str(doc.get("plan_date")) if doc.get("plan_date") else None,
        "service_period": doc.get("service_period"),
        "items": [snapshot_item(row) for row in (doc.get("items") or [])],
        "insight_snapshot": doc.get("insight_snapshot") or {},
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    doc.approval_snapshot = encoded
    doc.approval_snapshot_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    return encoded


def snapshot_item(row):
    return {key: row.get(key) for key in ("item_code", "qty", "stock_uom", "department", "production_unit", "production_policy", "bom", "bom_revision")}


def append_audit(doc, from_state, to_state, actor):
    audits = doc.get("audit_log") or []
    # audit_log is a Long Text (JSON) field: once a plan has gone through one
    # transition and been saved, the stored value is a JSON string, not a
    # Python list -- doc.get() returns it verbatim. Every transition after
    # the first must decode it back into a list before appending, or this
    # throws AttributeError on any plan with existing audit history.
    if isinstance(audits, str):
        audits = json.loads(audits) if audits else []
    audits.append({"from_state": from_state, "to_state": to_state, "actor": actor, "branch": doc.get("branch"), "company": doc.get("company")})
    doc.audit_log = audits


SALES_PLAN_ITEM_FIELDS = (
    "item_code",
    "qty",
    "stock_uom",
    "department",
    "production_unit",
    "production_policy",
    "bom",
    "bom_revision",
)


@frappe.whitelist(methods=["POST"])
def save_draft(plan_date, branch, company=None, service_period=None, items=None):
    """Create or update the Draft Sales Plan for a (branch, company, plan_date) scope."""
    if not plan_date or not branch:
        frappe.throw(_("plan_date and branch are required"), frappe.ValidationError)

    if not company:
        company = frappe.db.get_value("Branch", branch, "company")

    if not company:
        frappe.throw(_("Branch company is required for Sales Plan"), frappe.PermissionError)

    item_rows = frappe.parse_json(items) if isinstance(items, str) else (items or [])

    # Cancellation is terminal: a "Superseded/Cancelled" plan must not block a
    # fresh Draft from being created for the same (branch, company, plan_date)
    # scope, so those rows are excluded entirely -- as if no matching doc
    # existed. Among the remaining rows, deterministically pick the
    # most-recently-modified one rather than relying on frappe.db.exists()'s
    # unordered, arbitrary match (this doctype autonames via hash and has no
    # unique constraint on the scope, so more than one matching row can
    # already exist) -- mirroring the ordering used by get_plan_status().
    existing_rows = frappe.get_all(
        "URY Sales Plan",
        filters={
            "branch": branch,
            "company": company,
            "plan_date": plan_date,
            "status": ["!=", "Superseded/Cancelled"],
        },
        order_by="modified desc",
        limit_page_length=1,
        pluck="name",
    )
    existing_name = existing_rows[0] if existing_rows else None

    if existing_name:
        existing_status = frappe.db.get_value("URY Sales Plan", existing_name, "status")
        if existing_status not in ("Draft", "Proposed"):
            frappe.throw(
                _(
                    "Sales Plan {0} for this branch, company and date is already {1} and can no longer be saved as a draft"
                ).format(existing_name, existing_status),
                frappe.ValidationError,
            )
        doc = frappe.get_doc("URY Sales Plan", existing_name)
    else:
        doc = frappe.get_doc(
            {
                "doctype": "URY Sales Plan",
                "status": "Draft",
                "branch": branch,
                "company": company,
                "plan_date": plan_date,
            }
        )

    _validate_plan_scope(doc)

    doc.service_period = service_period
    doc.set("items", [])
    for row in item_rows:
        item_dict = {field: row.get(field) for field in SALES_PLAN_ITEM_FIELDS}
        # Capture the BOM's revision AS OF NOW (server-side, ignoring any
        # bom_revision the caller may have passed) so a later re-save can
        # detect whether the BOM has changed since this row was added --
        # see flag_stale_bom_revisions().
        if item_dict.get("bom"):
            item_dict["bom_revision"] = frappe.db.get_value("BOM", item_dict["bom"], "custom_bom_revision")
        doc.append("items", item_dict)

    if existing_name:
        doc.save()
    else:
        doc.insert()

    return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def transition_plan(name, target_state):
    """Apply an audited state transition to an existing Sales Plan and persist it.

    ``transition_sales_plan()`` now calls ``apply_workflow()`` itself, which
    already performs the save (a real ``submit()``/``cancel()`` where the
    transition crosses a doc_status boundary) -- an extra ``doc.save()`` here
    would be redundant and, worse, would fail outright once the doc has been
    submitted (docstatus 1), since a plain save on a submitted doc requires
    going through ``before_update_after_submit`` semantics rather than a
    normal save.
    """
    doc = frappe.get_doc("URY Sales Plan", name)
    doc = transition_sales_plan(doc, target_state, actor=frappe.session.user)
    return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["GET"])
def get_plan(name):
    """Fetch a Sales Plan by name for frontend state reload after save/transition."""
    if not frappe.has_permission("URY Sales Plan", "read", doc=name):
        frappe.throw(_("Not permitted to read this Sales Plan"), frappe.PermissionError)

    return frappe.get_doc("URY Sales Plan", name).as_dict()


@frappe.whitelist(methods=["GET"])
def get_plan_status(branch, plan_date):
    """Look up the (at most one, non-cancelled in normal operation) Sales Plan
    for a branch+date scope without needing its name up front."""
    if not frappe.has_permission("URY Sales Plan", "read"):
        frappe.throw(_("Not permitted to read Sales Plans"), frappe.PermissionError)

    rows = frappe.get_all(
        "URY Sales Plan",
        filters={"branch": branch, "plan_date": plan_date},
        fields=["name", "status"],
        order_by="modified desc",
        limit=1,
    )
    if not rows:
        return {"name": None, "status": None}
    return {"name": rows[0]["name"], "status": rows[0]["status"]}
