import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_stock_service import (
    effective_department_holding,
    list_stock_movements,
    receive_at_department,
    remaining_transferable_qty,
    return_to_central_store,
    transfer_to_department,
)


MODULE = "ury.ury.api.ury_stock_service"


def _auth_doc(**values):
    doc = frappe._dict(
        {
            "name": "IA-1",
            "status": "Authorized",
            "branch": "Branch A",
            "company": "Company A",
            "department": "DEPT-1",
            "component_item": "COMP-1",
            "stock_uom": "Nos",
            "authorized_qty": 10,
        }
    )
    doc.update(values)
    return doc


def _new_doc_recorder():
    """Return a frappe.get_doc side_effect that records the constructed record."""
    created = {}

    def _get_doc(*args, **kwargs):
        arg = args[0] if args else kwargs.get("arg1")
        if isinstance(arg, dict):
            doc = frappe._dict(arg)
            doc.insert = MagicMock()
            created["doc"] = doc
            return doc
        raise AssertionError("lookups should be mocked separately via dispatch")

    return _get_doc, created


class TestTransferToDepartment(FrappeTestCase):
    def setUp(self):
        # _new_movement() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_transfer_within_authorized_qty_succeeds(self):
        auth_doc = _auth_doc()
        new_doc_side_effect, created = _new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ):
            result = transfer_to_department(
                issue_authorization="IA-1",
                qty=4,
                branch="Branch A",
                company="Company A",
            )

        self.assertEqual(result.qty, 4)
        self.assertEqual(result.movement_type, "Transfer")
        self.assertEqual(result.from_location, "Central Store")
        self.assertEqual(result.to_location, "DEPT-1")
        audit = json.loads(result.audit_log)
        self.assertEqual(audit[0]["qty"], 4)
        result.insert.assert_called_once()

    def test_transfer_rejected_when_exceeding_authorized_qty(self):
        auth_doc = _auth_doc()
        # Prior transfers already used 8 of the 10 authorized units, no returns yet.
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=auth_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", side_effect=[[8], [0]]
        ):
            with self.assertRaises(frappe.ValidationError):
                transfer_to_department(
                    issue_authorization="IA-1",
                    qty=5,
                    branch="Branch A",
                    company="Company A",
                )

    def test_transfer_rejected_when_authorization_not_authorized(self):
        auth_doc = _auth_doc(status="Rejected")
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=auth_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                transfer_to_department(
                    issue_authorization="IA-1",
                    qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_branch_mismatch_fails_closed(self):
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=auth_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                transfer_to_department(
                    issue_authorization="IA-1",
                    qty=1,
                    branch="Branch B",
                    company="Company A",
                )

    def test_company_scope_ambiguity_fails_closed(self):
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=auth_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Other Company"):
            with self.assertRaises(frappe.ValidationError):
                transfer_to_department(
                    issue_authorization="IA-1",
                    qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_permission_check_blocks_unauthorized_actor(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=False):
            with self.assertRaises(frappe.PermissionError):
                transfer_to_department(
                    issue_authorization="IA-1",
                    qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_non_positive_qty_rejected(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=True):
            with self.assertRaises(frappe.ValidationError):
                transfer_to_department(
                    issue_authorization="IA-1",
                    qty=0,
                    branch="Branch A",
                    company="Branch A",
                )


class TestReceiveAtDepartment(FrappeTestCase):
    def setUp(self):
        # _new_movement() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _transfer_doc(self, **values):
        doc = frappe._dict(
            {
                "name": "MOV-TRANSFER-1",
                "movement_type": "Transfer",
                "issue_authorization": "IA-1",
                "branch": "Branch A",
                "company": "Company A",
                "from_location": "Central Store",
                "to_location": "DEPT-1",
                "qty": 6,
            }
        )
        doc.update(values)
        return doc

    def test_receipt_confirms_within_transfer_qty(self):
        auth_doc = _auth_doc()
        transfer_doc = self._transfer_doc()
        new_doc_side_effect, created = _new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Stock Movement":
                return transfer_doc
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ):
            result = receive_at_department(
                transfer_movement="MOV-TRANSFER-1",
                qty=6,
                branch="Branch A",
                company="Company A",
            )

        self.assertEqual(result.movement_type, "Receipt")
        self.assertEqual(result.transfer_ref, "MOV-TRANSFER-1")
        self.assertEqual(result.qty, 6)
        result.insert.assert_called_once()

    def test_receipt_rejected_when_exceeding_outstanding_transfer_qty(self):
        auth_doc = _auth_doc()
        transfer_doc = self._transfer_doc()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Stock Movement":
                return transfer_doc
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            raise AssertionError("unexpected get_doc call")

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[4]
        ):
            with self.assertRaises(frappe.ValidationError):
                receive_at_department(
                    transfer_movement="MOV-TRANSFER-1",
                    qty=3,
                    branch="Branch A",
                    company="Company A",
                )

    def test_receipt_rejected_when_referenced_movement_is_not_transfer(self):
        auth_doc = _auth_doc()
        wrong_doc = self._transfer_doc(movement_type="Return")

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Stock Movement":
                return wrong_doc
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            raise AssertionError("unexpected get_doc call")

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ):
            with self.assertRaises(frappe.ValidationError):
                receive_at_department(
                    transfer_movement="MOV-TRANSFER-1",
                    qty=1,
                    branch="Branch A",
                    company="Company A",
                )


class TestReturnToCentralStore(FrappeTestCase):
    def setUp(self):
        # _new_movement() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_return_within_received_holding_succeeds(self):
        auth_doc = _auth_doc()
        new_doc_side_effect, created = _new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            return new_doc_side_effect(*args, **kwargs)

        # received_qty() call returns [6], returned_qty() call returns [0].
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", side_effect=[[6], [0]]
        ):
            result = return_to_central_store(
                issue_authorization="IA-1",
                qty=2,
                branch="Branch A",
                company="Company A",
            )

        self.assertEqual(result.movement_type, "Return")
        self.assertEqual(result.from_location, "DEPT-1")
        self.assertEqual(result.to_location, "Central Store")
        self.assertEqual(result.qty, 2)
        result.insert.assert_called_once()

    def test_return_rejected_when_exceeding_effective_holding(self):
        auth_doc = _auth_doc()
        # received_qty() -> [6], returned_qty() -> [5]: only 1 unit of
        # effective holding remains, request of 2 must fail closed.
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=auth_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", side_effect=[[6], [5]]
        ):
            with self.assertRaises(frappe.ValidationError):
                return_to_central_store(
                    issue_authorization="IA-1",
                    qty=2,
                    branch="Branch A",
                    company="Company A",
                )

    def test_return_of_unreceived_material_rejected(self):
        auth_doc = _auth_doc()
        # No receipts confirmed yet: effective holding is zero.
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=auth_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", side_effect=[[], []]
        ):
            with self.assertRaises(frappe.ValidationError):
                return_to_central_store(
                    issue_authorization="IA-1",
                    qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_branch_mismatch_fails_closed(self):
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=auth_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                return_to_central_store(
                    issue_authorization="IA-1",
                    qty=1,
                    branch="Branch B",
                    company="Company A",
                )


class TestPureFormulas(FrappeTestCase):
    def setUp(self):
        # _new_movement() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_remaining_transferable_qty_formula(self):
        auth_doc = _auth_doc(authorized_qty=10)
        with patch(f"{MODULE}.frappe.get_all", side_effect=[[4], [1]]):
            # transferred=4, returned=1 -> 10 - 4 + 1 = 7
            self.assertEqual(remaining_transferable_qty(auth_doc), 7)

    def test_remaining_transferable_qty_floors_at_zero(self):
        auth_doc = _auth_doc(authorized_qty=10)
        with patch(f"{MODULE}.frappe.get_all", side_effect=[[12], [0]]):
            self.assertEqual(remaining_transferable_qty(auth_doc), 0)

    def test_effective_department_holding_formula(self):
        with patch(f"{MODULE}.frappe.get_all", side_effect=[[6], [2]]):
            self.assertEqual(effective_department_holding("IA-1"), 4)

    def test_effective_department_holding_floors_at_zero(self):
        with patch(f"{MODULE}.frappe.get_all", side_effect=[[3], [5]]):
            self.assertEqual(effective_department_holding("IA-1"), 0)


class TestListStockMovements(FrappeTestCase):
    def setUp(self):
        # _new_movement() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_list_scoped_by_branch_succeeds(self):
        rows = [
            {
                "name": "MOV-1",
                "issue_authorization": "IA-1",
                "movement_type": "Transfer",
                "department": "DEPT-1",
                "component_item": "COMP-1",
                "branch": "Branch A",
                "company": "Company A",
                "qty": 4,
                "stock_uom": "Nos",
                "from_location": "Central Store",
                "to_location": "DEPT-1",
                "posting_datetime": "2026-08-28 00:00:00",
                "transfer_ref": None,
            }
        ]
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ) as mock_get_all:
            result = list_stock_movements(branch="Branch A")

        self.assertEqual(result, rows)
        mock_get_all.assert_called_once()
        _, kwargs = mock_get_all.call_args
        self.assertEqual(kwargs["filters"], {"branch": "Branch A"})

    def test_missing_branch_fails_closed(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=True):
            with self.assertRaises(frappe.ValidationError):
                list_stock_movements(branch=None)

    def test_department_and_date_filters_narrow_results(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ) as mock_get_all:
            list_stock_movements(
                branch="Branch A",
                department="DEPT-1",
                company="Company A",
                from_date="2026-08-01",
                to_date="2026-08-28",
            )

        _, kwargs = mock_get_all.call_args
        self.assertEqual(
            kwargs["filters"],
            {
                "branch": "Branch A",
                "department": "DEPT-1",
                "company": "Company A",
                "posting_datetime": ["between", ["2026-08-01", "2026-08-28"]],
            },
        )

    def test_permission_check_blocks_unauthorized_actor(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=False):
            with self.assertRaises(frappe.PermissionError):
                list_stock_movements(branch="Branch A")
