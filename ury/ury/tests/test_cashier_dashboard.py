"""POS Operations: Number Card figures, role-based workspace visibility and the cashier Module Profile."""

import frappe
from frappe.desk.desktop import get_workspaces
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime


BRANCH_A = "ZZ Cashier Branch A"
BRANCH_B = "ZZ Cashier Branch B"
MODULE = "URY POS"
USER = "zz-cashier-dash@example.com"
CARDS = (
	"URY Cashier Sales Today",
	"URY Cashier Bills Today",
	"URY Cashier Average Bill",
	"URY Cashier Open KOTs",
	"URY Cashier Unsettled Bills",
)


def _insert_branch(name):
	frappe.db.sql(
		"INSERT INTO `tabBranch` (name, branch, creation, modified, owner, modified_by, docstatus) "
		"VALUES (%s, %s, NOW(), NOW(), 'Administrator', 'Administrator', 0)",
		(name, name),
	)


def _assign_user(branch, user):
	frappe.db.sql(
		"INSERT INTO `tabURY User` (name, parent, parenttype, parentfield, user, creation, modified, "
		"owner, modified_by, docstatus, idx) VALUES (%s, %s, 'Branch', 'user', %s, NOW(), NOW(), "
		"'Administrator', 'Administrator', 0, 1)",
		(frappe.generate_hash(length=10), branch, user),
	)


def _invoice(total, branch=BRANCH_A, docstatus=1, status="Paid", is_return=0):
	now = now_datetime()
	frappe.db.sql(
		"INSERT INTO `tabPOS Invoice` (name, docstatus, status, is_return, posting_date, posting_time, "
		"grand_total, branch, creation, modified, owner, modified_by) "
		"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), 'Administrator', 'Administrator')",
		(f"ZZ-CD-{frappe.generate_hash(length=8)}", docstatus, status, is_return, now.date(), now.time(), total, branch),
	)


def _kot(branch=BRANCH_A, order_status="Ready For Prepare"):
	frappe.db.sql(
		"INSERT INTO `tabURY KOT` (name, docstatus, order_status, verified, branch, date, creation, modified, "
		"owner, modified_by) VALUES (%s, 1, %s, 0, %s, CURDATE(), NOW(), NOW(), 'Administrator', 'Administrator')",
		(f"ZZ-CDK-{frappe.generate_hash(length=8)}", order_status, branch),
	)


def _make_user(*roles):
	if frappe.db.exists("User", USER):
		frappe.delete_doc("User", USER, force=True)
	user = frappe.get_doc({"doctype": "User", "email": USER, "first_name": "ZZ", "send_welcome_email": 0})
	user.insert(ignore_permissions=True)
	user.add_roles(*roles)
	return user


def _card_value(card_name):
	"""Value of a Number Card exactly as the workspace computes it (permission-aware get_list)."""
	from frappe.desk.doctype.number_card.number_card import get_result

	card = frappe.get_doc("Number Card", card_name)
	filters = frappe.parse_json(card.filters_json or "[]")
	for doctype, field, op, _value in frappe.parse_json(card.dynamic_filters_json or "[]"):
		filters.append([doctype, field, op, str(now_datetime().date())])  # frappe.datetime.get_today()
	return get_result(card.as_dict(), filters)


class TestCashierDashboardCards(FrappeTestCase):
	"""Cards are standard Document Type cards. Branch scoping is out of scope (see requirements section 6)."""

	def setUp(self):
		_insert_branch(BRANCH_A)
		_make_user("URY Cashier")
		frappe.set_user(USER)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def test_cards_are_document_type_cards_without_custom_methods(self):
		for name in CARDS:
			card = frappe.get_doc("Number Card", name)
			self.assertEqual(card.type, "Document Type", name)
			self.assertFalse(card.method, name)
			self.assertEqual(card.module, MODULE, name)

	def test_sales_bills_and_average_use_only_valid_non_return_invoices(self):
		before = {c: _card_value(c) for c in CARDS}
		_invoice(100)
		_invoice(50, status="Consolidated")
		_invoice(900, docstatus=2, status="Cancelled")  # cancelled
		_invoice(-40, is_return=1, status="Return")  # return
		_invoice(70, docstatus=0, status="Draft")  # unsettled, not a sale
		self.assertEqual(_card_value("URY Cashier Sales Today") - before["URY Cashier Sales Today"], 150)
		self.assertEqual(_card_value("URY Cashier Bills Today") - before["URY Cashier Bills Today"], 2)
		self.assertEqual(_card_value("URY Cashier Unsettled Bills") - before["URY Cashier Unsettled Bills"], 1)

	def test_average_bill_is_exact_with_only_seeded_invoices(self):
		frappe.set_user("Administrator")
		frappe.db.sql("UPDATE `tabPOS Invoice` SET posting_date = '2000-01-01' WHERE posting_date = CURDATE()")
		frappe.set_user(USER)
		self.assertEqual(_card_value("URY Cashier Average Bill"), 0)
		_invoice(100)
		_invoice(50)
		self.assertEqual(_card_value("URY Cashier Average Bill"), 75)

	def test_open_kots_count_only_ready_for_prepare_unverified(self):
		before = _card_value("URY Cashier Open KOTs")
		_kot()
		_kot(order_status="Served")
		self.assertEqual(_card_value("URY Cashier Open KOTs") - before, 1)


class TestWorkspaceVisibility(FrappeTestCase):
	"""Standard role-based Workspace visibility, the POS module, and the cashier Module Profile."""

	MANAGEMENT = ("URY", "URY Operate", "URY Control", "URY Finance", "URY Setup")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def _names(self, *roles, profiles=False):
		frappe.set_user("Administrator")
		user = _make_user(*roles)
		if profiles:
			user.role_profile_name = "URY Cashier"
			user.module_profile = "URY Cashier"
			user.save(ignore_permissions=True)
		frappe.set_user(USER)
		frappe.clear_cache(user=USER)
		return [p["name"] for p in get_workspaces()["pages"]]

	def test_pos_operations_workspace_and_sidebar_live_in_pos_module(self):
		ws = frappe.get_doc("Workspace", "POS Operations")
		self.assertEqual(ws.module, MODULE)
		self.assertEqual([r.role for r in ws.roles], ["URY Cashier"])
		self.assertEqual(ws.route if hasattr(ws, "route") else "pos/pos-operations", "pos/pos-operations")
		sidebar = frappe.get_doc("Sidebar", "POS Operations")
		self.assertEqual(sidebar.module, MODULE)
		urls = [i.url for i in sidebar.items if i.link_type == "URL"]
		self.assertEqual(urls, ["/pos", "/mosaic", "/ury"])
		self.assertIn("POS Operations", [i.link_to for i in sidebar.items if i.link_type == "Workspace"])

	def test_workspace_content_blocks_use_number_card_row_labels(self):
		"""Desk matches content blocks to Workspace Number Card rows by label, not by card name."""
		ws = frappe.get_doc("Workspace", "POS Operations")
		labels = {r.label for r in ws.number_cards}
		blocks = [b for b in frappe.parse_json(ws.content) if b["type"] == "number_card"]
		self.assertEqual(len(blocks), len(CARDS))
		for block in blocks:
			self.assertIn(block["data"]["number_card_name"], labels)

	def test_ury_operate_no_longer_lists_cashier(self):
		roles = [r.role for r in frappe.get_doc("Workspace", "URY Operate").roles]
		self.assertNotIn("URY Cashier", roles)

	def test_cashier_without_module_profile_sees_pos_operations_not_management(self):
		names = self._names("URY Cashier")
		self.assertIn("POS Operations", names)
		for workspace in self.MANAGEMENT:
			self.assertNotIn(workspace, names)

	def test_cashier_with_profiles_sees_only_pos_module(self):
		names = self._names("URY Cashier", profiles=True)
		self.assertEqual(names, ["POS Operations"])

	def test_profile_fixtures(self):
		blocked = {r.module for r in frappe.get_doc("Module Profile", "URY Cashier").block_modules}
		self.assertIn("URY", blocked)
		self.assertIn("Accounts", blocked)
		self.assertNotIn(MODULE, blocked)
		self.assertEqual([r.role for r in frappe.get_doc("Role Profile", "URY Cashier").roles], ["URY Cashier"])

	def test_cashier_with_manager_keeps_management_workspaces(self):
		names = self._names("URY Cashier", "URY Manager")
		self.assertIn("POS Operations", names)
		for workspace in self.MANAGEMENT:
			self.assertIn(workspace, names)

	def test_cashier_with_admin_or_system_manager_keeps_privileged_workspaces(self):
		self.assertIn("URY Analytics Branch Manager", self._names("URY Cashier", "URY Admin"))
		self.assertIn("URY", self._names("URY Cashier", "System Manager"))

	def test_manager_only_does_not_get_pos_operations(self):
		names = self._names("URY Manager")
		self.assertIn("URY", names)
		self.assertNotIn("POS Operations", names)
