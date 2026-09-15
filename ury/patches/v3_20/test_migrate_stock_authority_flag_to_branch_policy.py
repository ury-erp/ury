# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""T2 tests for the v3_20 migration patch that seeds `URY Branch Stock
Policy` rows from the retired site-wide `pos_stock_authority_v2` flag.

Follows the mock-based pattern from
`ury.ury.api.test_ury_stock_policy` (no live site/DB needed): every
`frappe.db.*` call the patch makes is mocked, so these tests assert the
patch's *decision logic* (when it creates rows, with which values, and
when it does nothing) rather than exercising a real migration.

Covered:
1. Old flag ON -> a `URY Branch Stock Policy` row is created for every
   branch, with all three gates set to 1.
2. Old flag OFF -> no-op, nothing created.
3. Running twice (rows already exist) -> idempotent, no duplicate
   inserts, no error.
4. Old `URY Feature Flags` doctype/table doesn't exist at all (fresh
   install) -> no-op, no error.
"""

from unittest.mock import MagicMock, call, patch

from frappe.tests.utils import FrappeTestCase

from ury.patches.v3_20.migrate_stock_authority_flag_to_branch_policy import (
    NEW_POLICY_DOCTYPE,
    OLD_FLAG_DOCTYPE,
    OLD_FLAG_FIELD,
    execute,
)

MODULE = "ury.patches.v3_20.migrate_stock_authority_flag_to_branch_policy.frappe"


class TestMigrateStockAuthorityFlagToBranchPolicy(FrappeTestCase):
    def _mock_frappe(self, mock_frappe, new_doctype_table_exists=True, old_doctype_exists=True,
                      old_field_exists=True, old_flag_value=1, branches=None,
                      existing_policy_branches=None):
        branches = branches if branches is not None else ["Branch A", "Branch B"]
        existing_policy_branches = existing_policy_branches or set()

        def table_exists_side_effect(doctype):
            # Only the NEW doctype is ever checked via table_exists -- the
            # OLD doctype is a Single and is checked via DocType/DocField
            # existence instead (see exists_side_effect below).
            if doctype == NEW_POLICY_DOCTYPE:
                return new_doctype_table_exists
            return False

        def exists_side_effect(doctype, filters=None):
            if doctype == "DocType" and filters == OLD_FLAG_DOCTYPE:
                return old_doctype_exists
            if doctype == "DocField" and filters == {"parent": OLD_FLAG_DOCTYPE, "fieldname": OLD_FLAG_FIELD}:
                return old_field_exists
            if doctype == NEW_POLICY_DOCTYPE:
                return filters.get("branch") in existing_policy_branches
            return False

        mock_frappe.db.table_exists.side_effect = table_exists_side_effect
        mock_frappe.db.get_single_value.return_value = old_flag_value
        mock_frappe.db.exists.side_effect = exists_side_effect
        mock_frappe.get_all.return_value = list(branches)

        created_docs = []

        def new_doc_side_effect(doctype):
            doc = MagicMock()
            doc.doctype = doctype
            created_docs.append(doc)
            return doc

        mock_frappe.new_doc.side_effect = new_doc_side_effect
        mock_frappe.logger.return_value = MagicMock()
        return created_docs

    @patch(MODULE)
    def test_flag_on_migrates_every_branch(self, mock_frappe):
        created = self._mock_frappe(mock_frappe, old_flag_value=1,
                                     branches=["Branch A", "Branch B"])

        execute()

        self.assertEqual(len(created), 2)
        for doc in created:
            self.assertEqual(doc.reservation_control_enabled, 1)
            self.assertEqual(doc.realtime_production_posting_enabled, 1)
            self.assertEqual(doc.closing_reconciliation_enabled, 1)
            self.assertEqual(doc.enabled_by, "Administrator")
            doc.insert.assert_called_once_with(ignore_permissions=True)
        mock_frappe.db.commit.assert_called_once()

    @patch(MODULE)
    def test_flag_off_is_noop(self, mock_frappe):
        created = self._mock_frappe(mock_frappe, old_flag_value=0,
                                     branches=["Branch A", "Branch B"])

        execute()

        self.assertEqual(created, [])
        mock_frappe.get_all.assert_not_called()

    @patch(MODULE)
    def test_running_twice_is_idempotent(self, mock_frappe):
        # Simulate the second run: both branches already have a policy row.
        created = self._mock_frappe(
            mock_frappe,
            old_flag_value=1,
            branches=["Branch A", "Branch B"],
            existing_policy_branches={"Branch A", "Branch B"},
        )

        execute()

        self.assertEqual(created, [])

    @patch(MODULE)
    def test_fresh_install_no_old_doctype_is_noop(self, mock_frappe):
        created = self._mock_frappe(mock_frappe, old_doctype_exists=False)

        execute()

        self.assertEqual(created, [])
        mock_frappe.db.get_single_value.assert_not_called()

    @patch(MODULE)
    def test_old_doctype_present_but_field_missing_is_noop(self, mock_frappe):
        created = self._mock_frappe(mock_frappe, old_doctype_exists=True,
                                     old_field_exists=False)

        execute()

        self.assertEqual(created, [])
        mock_frappe.db.get_single_value.assert_not_called()

    @patch(MODULE)
    def test_new_doctype_table_missing_is_noop(self, mock_frappe):
        created = self._mock_frappe(mock_frappe, new_doctype_table_exists=False)

        execute()

        self.assertEqual(created, [])
        mock_frappe.db.get_single_value.assert_not_called()

    @patch(MODULE)
    def test_get_single_value_error_fails_closed(self, mock_frappe):
        created = self._mock_frappe(mock_frappe)
        mock_frappe.db.get_single_value.side_effect = Exception("boom")
        mock_frappe.get_traceback.return_value = "traceback"

        execute()

        self.assertEqual(created, [])
        mock_frappe.log_error.assert_called_once()
        mock_frappe.get_all.assert_not_called()
