import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from ury.ury.api.ury_service_line import (
    get_service_line,
    get_running_low,
)


class TestGetServiceLine(FrappeTestCase):

    def setUp(self):
        # require_manager() is no longer called by get_service_line() --
        # it now goes through require_branch_staff(), which also decides
        # the *effective* branch (`branch = require_branch_staff(branch)`).
        # Every test in this class below runs as Administrator (the
        # FrappeTestCase default) and passes branch="URY Branch" straight
        # through, asserting on that exact value in cache keys/results, so
        # the mock must pass the branch argument through unchanged rather
        # than swallowing it the way the old no-return require_manager()
        # mock did.
        patcher = patch(
            "ury.ury.api.ury_service_line.require_branch_staff",
            side_effect=lambda branch=None: branch,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    def test_cache_hit_returns_immediately(self, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_data = [{"table": "Table 1", "stage": "open", "minutes": None}]
        mock_cache_instance.get_value.return_value = cached_data

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result, cached_data)
        mock_cache_instance.get_value.assert_called_once_with("ury_dashboard_service_line:URY Branch")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    def test_unoccupied_table_stage_open(self, mock_get_all, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 1",
                "occupied": 0,
                "latest_invoice_time": None,
                "is_take_away": 0,
            })
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["table"], "Table 1")
        self.assertEqual(result[0]["stage"], "open")
        self.assertIsNone(result[0]["minutes"])

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_occupied_table_stage_fired_when_kot_not_served(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        # get_datetime() is called twice in source with different args: once
        # bare for "now", once with t.latest_invoice_time to normalize it.
        # A plain return_value would collapse both calls to the same value
        # and always yield a zero minute delta, so use side_effect to mimic
        # real get_datetime's passthrough-on-datetime-arg behavior.
        mock_get_datetime.side_effect = lambda *args: now if not args else args[0]

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 2",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-001"})],
            [frappe._dict({"order_status": "Ready For Prepare"})],
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["stage"], "fired")
        self.assertEqual(result[0]["minutes"], 30)

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_occupied_table_stage_served_when_kot_served(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        mock_get_datetime.return_value = now

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 3",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-002"})],
            [frappe._dict({"order_status": "Served"})],
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result[0]["stage"], "served")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_occupied_table_stage_seated_when_no_invoice(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        mock_get_datetime.return_value = now

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 4",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 15, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.return_value = []

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result[0]["stage"], "seated")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_take_away_table_is_skipped(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        mock_get_datetime.return_value = now

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Take Away Table",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 1,
            })
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(len(result), 0)
        mock_sql.assert_not_called()

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_table_stage_over_when_minutes_exceed_75(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 15, 45, 0)
        mock_get_datetime.side_effect = lambda *args: now if not args else args[0]

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 5",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-003"})],
            [frappe._dict({"order_status": "Served"})],
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result[0]["stage"], "over")
        self.assertEqual(result[0]["minutes"], 105)


class TestGetRunningLow(FrappeTestCase):

    def setUp(self):
        # See TestGetServiceLine.setUp: same require_manager -> require_branch_staff
        # swap, same pass-through side_effect so branch="URY Branch"/None keep
        # flowing to cache keys/results exactly as these tests assert.
        patcher = patch(
            "ury.ury.api.ury_service_line.require_branch_staff",
            side_effect=lambda branch=None: branch,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    def test_cache_hit_returns_immediately(self, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_data = [
            {
                "item_code": "ITEM1",
                "item_name": "Item One",
                "remaining": 50,
                "qty_sold_today": 10,
                "eta_minutes": 300,
                "data_quality_issue": False,
            }
        ]
        mock_cache_instance.get_value.return_value = cached_data

        result = get_running_low(branch="URY Branch")

        self.assertEqual(result, cached_data)
        mock_cache_instance.get_value.assert_called_once()

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_with_items(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 4, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = [
            frappe._dict({
                "item_code": "ITEM1",
                "item_name": "Item One",
                "qty_sold": 10,
            })
        ]

        mock_get_value.side_effect = ["Kitchen - U", 50]

        result = get_running_low(branch="URY Branch")

        self.assertGreater(len(result), 0)
        first_item = result[0]
        self.assertEqual(first_item["item_code"], "ITEM1")
        self.assertEqual(first_item["remaining"], 50)
        self.assertEqual(first_item["qty_sold_today"], 10)
        self.assertIsNotNone(first_item["eta_minutes"])
        self.assertGreater(first_item["eta_minutes"], 0)
        self.assertFalse(first_item["data_quality_issue"])

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_negative_stock_flags_data_quality(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 2, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = [
            frappe._dict({
                "item_code": "ITEM2",
                "item_name": "Item Two",
                "qty_sold": 5,
            })
        ]

        mock_get_value.side_effect = ["Kitchen - U", -20]

        result = get_running_low(branch="URY Branch")

        first_item = result[0]
        self.assertTrue(first_item["data_quality_issue"])
        self.assertEqual(first_item["remaining"], 0)

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_no_items_sold(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 2, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = []

        result = get_running_low(branch="URY Branch")

        self.assertEqual(result, [])
        # The POS Profile warehouse lookup is gated only on `branch` being
        # truthy, not on whether any items sold — it always fires once here
        # since branch="URY Branch". The per-item Bin lookup inside the sold
        # items loop is what's skipped when there's nothing sold.
        mock_get_value.assert_called_once_with("POS Profile", {"branch": "URY Branch"}, "warehouse")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_no_branch(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 3, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = [
            frappe._dict({
                "item_code": "ITEM3",
                "item_name": "Item Three",
                "qty_sold": 20,
            })
        ]

        # branch=None skips the POS Profile warehouse lookup entirely (see
        # `if branch:` guard in get_running_low), so only the per-item Bin
        # lookup fires — a single call, not two.
        mock_get_value.side_effect = [100]

        result = get_running_low(branch=None)

        self.assertGreater(len(result), 0)
        first_item = result[0]
        self.assertEqual(first_item["item_code"], "ITEM3")
        self.assertEqual(first_item["remaining"], 100)


class TestServiceLineRealPermissionBoundary(FrappeTestCase):
	"""Real (non-mocked) coverage of `require_branch_staff()` for this
	module.

	Every test class above in this file patches the permission gate out
	entirely, so the actual gate guarding `get_service_line()` and
	`get_running_low()` has never been exercised against a real
	session/role/branch table -- only the business logic behind it has.
	This uses `frappe.set_user()` with real users (no role, staff-with-a-
	branch, manager) and asserts the actual `frappe.PermissionError`
	behavior of `require_branch_staff()`:
	  (a) no URY role at all -> PermissionError
	  (b) staff role, but requesting another branch -> PermissionError
	  (c) staff role, requesting their own branch -> allowed
	  (d) staff role, branch=None ("all branches") -> PermissionError
	  (e) manager role -> any branch (including None) is allowed
	"""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from ury.ury.tests.factories import make_branch, make_user

		cls.branch = make_branch(branch="P4R3 Service Line Branch").name
		cls.other_branch = make_branch(branch="P4R3 Service Line Other Branch").name

		cls.no_role_user = make_user(
			email="p4r3-serviceline-norole@ury.test", roles=[]
		).name
		cls.staff_user = make_user(
			email="p4r3-serviceline-staff@ury.test", roles=["URY Cashier"]
		).name
		cls.manager_user = make_user(
			email="p4r3-serviceline-manager@ury.test", roles=["URY Manager"]
		).name

		# Assign staff_user to cls.branch via Branch's custom `user` child
		# table, so ury.ury_pos.api.getBranch()'s raw SQL join resolves it
		# the same way the real POS frontend session would.
		branch_doc = frappe.get_doc("Branch", cls.branch)
		branch_doc.append("user", {"user": cls.staff_user})
		branch_doc.save(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	# ---------------------------------------------------------- (a) no role

	def test_get_service_line_rejects_user_without_any_ury_role(self):
		frappe.set_user(self.no_role_user)
		with self.assertRaises(frappe.PermissionError):
			get_service_line(branch=self.branch)

	def test_get_running_low_rejects_user_without_any_ury_role(self):
		frappe.set_user(self.no_role_user)
		with self.assertRaises(frappe.PermissionError):
			get_running_low(branch=self.branch)

	# ------------------------------------------------ (b) staff, other branch

	def test_get_service_line_rejects_staff_requesting_other_branch(self):
		frappe.set_user(self.staff_user)
		with self.assertRaises(frappe.PermissionError):
			get_service_line(branch=self.other_branch)

	def test_get_running_low_rejects_staff_requesting_other_branch(self):
		frappe.set_user(self.staff_user)
		with self.assertRaises(frappe.PermissionError):
			get_running_low(branch=self.other_branch)

	# -------------------------------------------------- (c) staff, own branch

	def test_get_service_line_allows_staff_requesting_own_branch(self):
		frappe.set_user(self.staff_user)
		result = get_service_line(branch=self.branch)
		self.assertIsInstance(result, list)

	def test_get_running_low_allows_staff_requesting_own_branch(self):
		frappe.set_user(self.staff_user)
		result = get_running_low(branch=self.branch)
		self.assertIsInstance(result, list)

	# ------------------------------------------------------- (d) staff, None

	def test_get_service_line_rejects_staff_with_no_branch(self):
		frappe.set_user(self.staff_user)
		with self.assertRaises(frappe.PermissionError):
			get_service_line(branch=None)

	def test_get_running_low_rejects_staff_with_no_branch(self):
		frappe.set_user(self.staff_user)
		with self.assertRaises(frappe.PermissionError):
			get_running_low(branch=None)

	# ------------------------------------------------------- (e) manager, any

	def test_get_service_line_allows_manager_for_any_branch(self):
		frappe.set_user(self.manager_user)
		result = get_service_line(branch=self.other_branch)
		self.assertIsInstance(result, list)

	def test_get_service_line_allows_manager_with_no_branch(self):
		frappe.set_user(self.manager_user)
		result = get_service_line(branch=None)
		self.assertIsInstance(result, list)

	def test_get_running_low_allows_manager_for_any_branch(self):
		frappe.set_user(self.manager_user)
		result = get_running_low(branch=self.other_branch)
		self.assertIsInstance(result, list)

	def test_get_running_low_allows_manager_with_no_branch(self):
		frappe.set_user(self.manager_user)
		result = get_running_low(branch=None)
		self.assertIsInstance(result, list)
