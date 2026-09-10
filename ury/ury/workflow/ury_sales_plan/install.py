"""Seeds the Workflow State / Workflow Action Master records the "URY Sales
Plan" workflow fixture (ury_sales_plan.json) depends on.

Frappe's core install only seeds the generic Pending/Approved/Rejected
Workflow States and Approve/Reject/Review Workflow Actions. This workflow's
own states (Draft, Proposed, Submitted for Approval, Locked for Production,
Superseded/Cancelled -- "Approved" already exists as a core seed) and actions
(Propose, Submit for Approval, Lock for Production, Supersede/Cancel) are not
created by anything else, and a `fixtures` entry for the Workflow doctype
does not create the Link targets it points at -- so without this, importing
the fixture on a fresh site fails validation.

Registered under `before_migrate` in hooks.py -- deliberately *before*, not
after: `bench migrate` runs `frappe.modules.utils.sync_fixtures()` (which
imports this app's Workflow fixture) before firing any `after_migrate` hook,
so seeding these Link targets in `after_migrate` would be too late on a
fresh site and the fixture import would fail. `before_migrate` runs ahead of
everything else in the migrate sequence, so it is safe here.

Idempotent: safe to run on every migrate (including re-runs).
"""

import frappe

REQUIRED_WORKFLOW_STATES = [
	"Draft",
	"Proposed",
	"Submitted for Approval",
	"Locked for Production",
	"Superseded/Cancelled",
]

REQUIRED_WORKFLOW_ACTIONS = [
	"Propose",
	"Submit for Approval",
	"Lock for Production",
	"Supersede/Cancel",
]


def before_migrate():
	"""Ensure the Workflow State / Workflow Action Master rows this app's
	Sales Plan workflow fixture references actually exist before the
	fixture itself is imported by `bench migrate`."""
	seed_workflow_states()
	seed_workflow_actions()


def seed_workflow_states():
	for state_name in REQUIRED_WORKFLOW_STATES:
		if frappe.db.exists("Workflow State", state_name):
			continue
		frappe.get_doc(
			{"doctype": "Workflow State", "workflow_state_name": state_name}
		).insert(ignore_permissions=True)


def seed_workflow_actions():
	for action_name in REQUIRED_WORKFLOW_ACTIONS:
		if frappe.db.exists("Workflow Action Master", action_name):
			continue
		frappe.get_doc(
			{"doctype": "Workflow Action Master", "workflow_action_name": action_name}
		).insert(ignore_permissions=True)
