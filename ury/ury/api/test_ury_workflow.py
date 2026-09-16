import json
import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_workflow import apply_workflow_action, get_workflow_status

TEST_MANAGER = "_test_ury_workflow_manager@example.com"
TEST_NON_MANAGER = "_test_ury_workflow_non_manager@example.com"


class TestURYWorkflowGeneric(FrappeTestCase):
    """get_workflow_status()/apply_workflow_action() are generic, doctype-
    agnostic wrappers around frappe.model.workflow -- exercised here against
    "URY Sales Plan" (which already has an active Workflow fixture) since
    that's the only submittable/workflow-driven doctype available in this
    app, but neither function contains any Sales-Plan-specific logic.
    """

    def _ensure_company(self, company_name, abbr):
        if not frappe.db.exists("Company", company_name):
            frappe.get_doc(
                {
                    "doctype": "Company",
                    "company_name": company_name,
                    "default_currency": "INR",
                    "abbr": abbr,
                }
            ).insert(ignore_permissions=True)

    def _ensure_branch(self, branch_name, company):
        if not frappe.db.exists("Branch", branch_name):
            frappe.get_doc(
                {
                    "doctype": "Branch",
                    "branch": branch_name,
                    "company": company,
                    "user": [{"user": "Administrator"}],
                }
            ).insert(ignore_permissions=True)

    def _ensure_item(self, item_code):
        if not frappe.db.exists("Item", item_code):
            frappe.get_doc(
                {
                    "doctype": "Item",
                    "item_code": item_code,
                    "item_name": item_code,
                    "item_group": "All Item Groups",
                    "stock_uom": "Nos",
                    "is_stock_item": 1,
                }
            ).insert(ignore_permissions=True)

    def _create_user(self, email, roles):
        if frappe.db.exists("User", email):
            frappe.delete_doc("User", email, force=True, ignore_permissions=True)
        user = frappe.get_doc(
            {
                "doctype": "User",
                "email": email,
                "first_name": email.split("@")[0],
                "send_welcome_email": 0,
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)
        for role in roles:
            user.add_roles(role)
        return user

    def setUp(self):
        frappe.set_user("Administrator")
        self.company = "URY Workflow Generic Test Co"
        self.branch = "URY Workflow Generic Test Branch"
        self.plan_date = "2026-09-27"
        self._ensure_company(self.company, "UWGT")
        self._ensure_branch(self.branch, self.company)
        self._ensure_item("MTPL")
        self._create_user(TEST_MANAGER, roles=["URY Manager"])
        self._create_user(TEST_NON_MANAGER, roles=[])
        frappe.db.delete(
            "URY Sales Plan",
            {"branch": self.branch, "company": self.company, "plan_date": self.plan_date},
        )

        from ury.ury.api.ury_sales_plan import save_draft

        created = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 5}],
        )
        self.plan_name = created["name"]

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.delete(
            "URY Sales Plan",
            {"branch": self.branch, "company": self.company, "plan_date": self.plan_date},
        )
        for user in (TEST_MANAGER, TEST_NON_MANAGER):
            if frappe.db.exists("User", user):
                frappe.delete_doc("User", user, force=True, ignore_permissions=True)

    def test_get_workflow_status_reports_current_state_and_manager_actions(self):
        frappe.set_user(TEST_MANAGER)
        try:
            status = get_workflow_status("URY Sales Plan", self.plan_name)
        finally:
            frappe.set_user("Administrator")

        self.assertIsNotNone(status)
        self.assertEqual(status["workflow_state_field"], "status")
        self.assertEqual(status["current_state"], "Draft")
        state_names = {s["state"] for s in status["states"]}
        self.assertIn("Approved", state_names)
        actions = {a["action"] for a in status["actions"]}
        self.assertIn("Propose", actions)

    def test_get_workflow_status_hides_actions_for_non_manager(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            status = get_workflow_status("URY Sales Plan", self.plan_name)
        finally:
            frappe.set_user("Administrator")

        self.assertIsNotNone(status)
        self.assertEqual(status["current_state"], "Draft")
        self.assertEqual(status["actions"], [])

    def test_apply_workflow_action_transitions_draft_to_proposed(self):
        frappe.set_user(TEST_MANAGER)
        try:
            result = apply_workflow_action("URY Sales Plan", self.plan_name, "Propose")
        finally:
            frappe.set_user("Administrator")

        self.assertEqual(result["name"], self.plan_name)
        self.assertEqual(result["status"], "Proposed")
        self.assertEqual(frappe.db.get_value("URY Sales Plan", self.plan_name, "status"), "Proposed")

    def test_apply_workflow_action_rejects_non_manager(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                apply_workflow_action("URY Sales Plan", self.plan_name, "Propose")
        finally:
            frappe.set_user("Administrator")

    def test_apply_workflow_action_walks_every_state_to_cancelled(self):
        """The generic endpoint must be able to drive EVERY edge declared on
        the workflow -- including the two that start from an already-submitted
        doc, which Frappe routes to `update_after_submit` (Approved -> Locked
        for Production, docstatus 1 -> 1) and to `cancel` (-> Superseded/
        Cancelled, docstatus 1 -> 2). Neither of those runs the doctype's
        validate(), and the first additionally rejects any field changed
        without `allow_on_submit` -- `status` itself included.
        """
        walk = [
            ("Propose", "Proposed", 0),
            ("Submit for Approval", "Submitted for Approval", 0),
            ("Approve", "Approved", 1),
            ("Lock for Production", "Locked for Production", 1),
            ("Supersede/Cancel", "Superseded/Cancelled", 2),
        ]

        frappe.set_user(TEST_MANAGER)
        try:
            previous_state = "Draft"
            for hop, (action, next_state, docstatus) in enumerate(walk, start=1):
                result = apply_workflow_action("URY Sales Plan", self.plan_name, action)
                self.assertEqual(result["status"], next_state)
                self.assertEqual(
                    frappe.db.get_value("URY Sales Plan", self.plan_name, "docstatus"),
                    docstatus,
                    f"docstatus wrong after action {action}",
                )

                raw = frappe.db.get_value("URY Sales Plan", self.plan_name, "audit_log")
                audit = json.loads(raw) if raw else []
                self.assertEqual(
                    len(audit), hop, f"audit_log did not grow on action {action}: {audit}"
                )
                self.assertEqual(audit[-1]["from_state"], previous_state)
                self.assertEqual(audit[-1]["to_state"], next_state)
                previous_state = next_state
        finally:
            frappe.set_user("Administrator")

    def test_apply_workflow_action_reports_unknown_action_as_validation_error(self):
        frappe.set_user(TEST_MANAGER)
        try:
            with self.assertRaises(frappe.ValidationError):
                apply_workflow_action("URY Sales Plan", self.plan_name, "No Such Action")
        finally:
            frappe.set_user("Administrator")

    def test_unsatisfied_condition_is_a_validation_error_not_a_permission_error(self):
        """A transition the user HAS the role for but whose `condition`
        doesn't hold must not be reported as a permission failure.

        `get_transitions()` filters on role membership AND condition, so the
        endpoint's "edge exists in the unfiltered definition" fallback cannot
        conclude "not permitted" on its own. The shipped fixture declares no
        conditions, so one is injected in-memory here.
        """
        from frappe.model.workflow import get_workflow_name

        workflow = frappe.get_doc("Workflow", get_workflow_name("URY Sales Plan"))
        for transition in workflow.transitions:
            if transition.action == "Propose":
                transition.condition = "doc.status == 'Nope'"
        workflow.save(ignore_permissions=True)
        frappe.clear_cache(doctype="URY Sales Plan")

        frappe.set_user(TEST_MANAGER)
        try:
            with self.assertRaises(frappe.ValidationError) as ctx:
                apply_workflow_action("URY Sales Plan", self.plan_name, "Propose")
            self.assertNotIsInstance(ctx.exception, frappe.PermissionError)
        finally:
            frappe.set_user("Administrator")
            workflow.reload()
            for transition in workflow.transitions:
                if transition.action == "Propose":
                    transition.condition = None
            workflow.save(ignore_permissions=True)
            frappe.clear_cache(doctype="URY Sales Plan")
