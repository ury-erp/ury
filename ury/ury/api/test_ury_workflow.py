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
