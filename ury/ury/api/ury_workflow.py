"""Generic, doctype-agnostic helpers for introspecting and driving any
Frappe Workflow through the real workflow engine.

Not specific to "URY Sales Plan" or any other doctype -- a later frontend
task builds a reusable React component/hook on top of these two endpoints
for any submittable/workflow-driven doctype.
"""

import frappe
from frappe import _
from frappe.model.workflow import apply_workflow, get_transitions, get_workflow_name


@frappe.whitelist(methods=["GET"])
def get_workflow_status(doctype, name):
    """Return the current workflow state, all defined states, and the
    actions the CURRENT USER is allowed to take from the current state, for
    any doctype with an active Frappe Workflow.

    Returns ``None`` if the doctype has no active workflow.
    """
    if not frappe.has_permission(doctype, "read", doc=name):
        frappe.throw(_("Not permitted to read this document"), frappe.PermissionError)

    workflow_name = get_workflow_name(doctype)
    if not workflow_name:
        return None

    workflow = frappe.get_doc("Workflow", workflow_name)
    workflow_state_field = workflow.workflow_state_field

    doc = frappe.get_doc(doctype, name)
    current_state = doc.get(workflow_state_field)

    allowed_transitions = get_transitions(doc, workflow=workflow, raise_exception=False)

    return {
        "workflow_state_field": workflow_state_field,
        "current_state": current_state,
        "states": [{"state": s.state, "doc_status": s.doc_status} for s in workflow.states],
        "actions": [{"action": t.action, "next_state": t.next_state} for t in allowed_transitions],
    }


@frappe.whitelist(methods=["POST"])
def apply_workflow_action(doctype, name, action):
    """Apply a named workflow action to a doc via Frappe's real workflow
    engine. ``apply_workflow()`` enforces the role gating declared on the
    doctype's Workflow and performs the actual save (including a real
    submit()/cancel() where the transition crosses a doc_status boundary).

    ``frappe.model.workflow.apply_workflow()`` itself raises a generic
    ``WorkflowTransitionError`` ("Not a valid Workflow Action") both when the
    action doesn't exist on the doctype's current state AND when it exists
    but the current user's role isn't allowed to take it -- because its
    candidate-transition list is already role-filtered by ``get_transitions()``.
    To let callers distinguish "no such action" from "not permitted", check
    the *unfiltered* workflow definition first and raise
    ``frappe.PermissionError`` explicitly for the latter case.
    """
    workflow_name = get_workflow_name(doctype)
    if not workflow_name:
        frappe.throw(_("{0} has no active Workflow").format(doctype), frappe.ValidationError)

    workflow = frappe.get_doc("Workflow", workflow_name)
    workflow_state_field = workflow.workflow_state_field

    doc = frappe.get_doc(doctype, name)
    current_state = doc.get(workflow_state_field)

    allowed_transitions = get_transitions(doc, workflow=workflow, raise_exception=False)
    if not any(t.action == action for t in allowed_transitions):
        action_exists = any(t.state == current_state and t.action == action for t in workflow.transitions)
        if action_exists:
            frappe.throw(_("Not permitted to take this workflow action"), frappe.PermissionError)
        frappe.throw(_("Invalid workflow action {0} from state {1}").format(action, current_state), frappe.ValidationError)

    doc = apply_workflow(doc, action)

    return {"name": doc.name, "status": doc.get(workflow_state_field)}
