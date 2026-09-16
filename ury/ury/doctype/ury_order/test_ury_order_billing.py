# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Coverage for the live billing/table-lifecycle surface of `ury_order.py`.

`test_ury_order.py` already covers `sync_order`, `get_order_invoice`,
`table_transfer`/`captain_transfer`, and the *reservation/KOT* half of
`split_bill`. It never touches the functions in this file:

    merge_free_tables / merge_tables_batch, unmerge_tables,
    release_tables_after_print, pos_opening_check, make_invoice,
    and split_bill's own guard clauses (permission, branch, docstatus,
    quantity allocation).

Style follows the module's established convention (`unittest.mock.patch` on
`ury.ury.doctype.ury_order.ury_order.frappe.*` inside a `FrappeTestCase`)
rather than full DB round-trips: every function here is guard-clause and
table-state logic over `frappe.db`, so a real POS Invoice/KOT/reservation
write path would be exercised without adding any assertion power. The
`_FakeInvoice`/`_FakeRow` doubles are imported from `test_ury_order.py`
rather than duplicated.
"""

import json
import unittest
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_stock_policy import StockPolicy
from ury.ury.doctype.ury_order.test_ury_order import _FakeInvoice, _FakeRow
from ury.ury.doctype.ury_order.ury_order import (
    _validate_additional_discount,
    make_invoice,
    merge_free_tables,
    merge_tables_batch,
    pos_opening_check,
    release_tables_after_print,
    split_bill,
    unmerge_tables,
)

MODULE = "ury.ury.doctype.ury_order.ury_order"


class _FakeTableDB:
    """In-memory stand-in for the `URY Table` / `POS Invoice` reads and writes
    the merge/unmerge/release functions perform.

    Only the exact call shapes those functions use are supported -- notably
    `frappe.db.set_value` with either a single fieldname + value or a dict of
    fields, since `merge_tables_batch` uses the first form and
    `_sync_active_order_with_merge_cluster` / `release_tables_after_print`
    use the second.
    """

    def __init__(self, tables=None, invoices=None):
        # tables: {name: {"restaurant_room": ..., "merged_with": ..., "occupied": ...}}
        self.tables = {name: dict(row) for name, row in (tables or {}).items()}
        # invoices: [{"name", "restaurant_table", "custom_merged_tables",
        #             "docstatus", "invoice_printed"}]
        self.invoices = [dict(row) for row in (invoices or [])]
        self.set_value_calls = []
        self.commits = 0

    # --- frappe.db ---------------------------------------------------------
    def get_value(self, doctype, name, fieldname=None, **kwargs):
        if doctype != "URY Table":
            return None
        row = self.tables.get(name)
        if row is None:
            return None
        if isinstance(fieldname, (list, tuple)):
            return frappe._dict({field: row.get(field) for field in fieldname})
        return row.get(fieldname)

    def set_value(self, doctype, name, fieldname, value=None, **kwargs):
        self.set_value_calls.append((doctype, name, fieldname, value))
        if doctype != "URY Table":
            return
        row = self.tables.setdefault(name, {})
        if isinstance(fieldname, dict):
            row.update(fieldname)
        else:
            row[fieldname] = value

    def exists(self, doctype, filters=None):
        if doctype != "POS Invoice":
            return None
        for invoice in self.invoices:
            if all(invoice.get(key) == value for key, value in (filters or {}).items()):
                return invoice["name"]
        return None

    def commit(self):
        self.commits += 1

    # --- frappe ------------------------------------------------------------
    def get_all(self, doctype, filters=None, fields=None, **kwargs):
        filters = filters or {}
        if doctype == "URY Table":
            room = filters.get("restaurant_room")
            return [
                frappe._dict(dict(row, name=name))
                for name, row in self.tables.items()
                if row.get("restaurant_room") == room
            ]
        if doctype == "POS Invoice":
            return [frappe._dict(row) for row in self.invoices if self._matches(row, filters)]
        return []

    @staticmethod
    def _matches(row, filters):
        for key, value in filters.items():
            if isinstance(value, (list, tuple)) and len(value) == 2 and value[0] == "like":
                needle = str(value[1]).strip("%")
                if needle not in (row.get(key) or ""):
                    return False
            elif row.get(key) != value:
                return False
        return True


def _patch_db(stack, fake):
    """Route every `frappe` read/write the functions under test make through
    `fake`, for the duration of `stack`."""
    stack.enter_context(patch(f"{MODULE}.frappe.db.get_value", side_effect=fake.get_value))
    stack.enter_context(patch(f"{MODULE}.frappe.db.set_value", side_effect=fake.set_value))
    stack.enter_context(patch(f"{MODULE}.frappe.db.exists", side_effect=fake.exists))
    stack.enter_context(patch(f"{MODULE}.frappe.db.commit", side_effect=fake.commit))
    stack.enter_context(patch(f"{MODULE}.frappe.get_all", side_effect=fake.get_all))
    return fake


class TestMergeTables(FrappeTestCase):
    """`merge_free_tables` / `merge_tables_batch`: cluster construction and
    every guard clause that rejects a merge."""

    def _two_free_tables(self):
        return _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
                "T2": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
            }
        )

    def _run(self, fake, anchor, targets):
        with ExitStack() as stack:
            _patch_db(stack, fake)
            stack.enter_context(patch(f"{MODULE}._sync_active_order_with_merge_cluster"))
            stack.enter_context(patch(f"{MODULE}._reconcile_open_invoices_for_tables"))
            return merge_tables_batch(anchor, targets)

    def test_merge_writes_symmetric_partner_lists(self):
        fake = self._two_free_tables()
        self.assertTrue(self._run(fake, "T1", ["T2"]))
        self.assertEqual(fake.tables["T1"]["merged_with"], "T2")
        self.assertEqual(fake.tables["T2"]["merged_with"], "T1")
        self.assertEqual(fake.commits, 1)

    def test_merge_of_three_tables_gives_every_member_the_other_two(self):
        fake = _FakeTableDB(
            tables={
                name: {"restaurant_room": "Hall", "merged_with": None, "occupied": 0}
                for name in ("T1", "T2", "T3")
            }
        )
        self.assertTrue(self._run(fake, "T1", ["T2", "T3"]))
        self.assertEqual(fake.tables["T1"]["merged_with"], "T2,T3")
        self.assertEqual(fake.tables["T2"]["merged_with"], "T1,T3")
        self.assertEqual(fake.tables["T3"]["merged_with"], "T1,T2")

    def test_targets_accepted_as_a_json_string(self):
        """The whitelisted endpoint is called over HTTP, so `tables` arrives
        as a JSON string, not a list."""
        fake = self._two_free_tables()
        self.assertTrue(self._run(fake, "T1", json.dumps(["T2"])))
        self.assertEqual(fake.tables["T2"]["merged_with"], "T1")

    def test_merge_free_tables_delegates_to_the_batch_endpoint(self):
        with patch(f"{MODULE}.merge_tables_batch", return_value=True) as mock_batch:
            self.assertTrue(merge_free_tables("T1", "T2"))
        mock_batch.assert_called_once_with("T1", ["T2"])

    def test_duplicate_and_self_targets_are_dropped_before_the_empty_check(self):
        fake = self._two_free_tables()
        self.assertTrue(self._run(fake, "T1", ["T2", "T2", "T1"]))
        self.assertEqual(fake.tables["T1"]["merged_with"], "T2")

    def test_rejects_an_empty_target_list(self):
        fake = self._two_free_tables()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1", [])
        self.assertIn("at least one table", str(ctx.exception))

    def test_rejects_a_target_list_that_only_names_the_anchor(self):
        fake = self._two_free_tables()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1", ["T1"])
        self.assertIn("at least one table", str(ctx.exception))

    def test_rejects_an_unknown_anchor_table(self):
        fake = self._two_free_tables()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "NOPE", ["T2"])
        self.assertIn("Table not found", str(ctx.exception))

    def test_rejects_tables_in_different_rooms(self):
        """This is also the effective cross-branch guard: `merge_tables_batch`
        compares `restaurant_room`, never `branch`, so a table in another
        branch is rejected by virtue of being in another room. A table in a
        room shared across branches would NOT be caught here -- noted as a
        real (if currently unreachable) gap rather than asserted as correct."""
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
                "T2": {"restaurant_room": "Terrace", "merged_with": None, "occupied": 0},
            }
        )
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1", ["T2"])
        self.assertIn("different rooms", str(ctx.exception))
        self.assertIsNone(fake.tables["T1"]["merged_with"])

    def test_rejects_a_target_that_is_already_part_of_a_merge_cluster(self):
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
                "T2": {"restaurant_room": "Hall", "merged_with": "T3", "occupied": 0},
                "T3": {"restaurant_room": "Hall", "merged_with": "T2", "occupied": 0},
            }
        )
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1", ["T2"])
        self.assertIn("already merged", str(ctx.exception))

    def test_rejects_an_occupied_target(self):
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
                "T2": {"restaurant_room": "Hall", "merged_with": None, "occupied": 1},
            }
        )
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1", ["T2"])
        self.assertIn("Occupied tables", str(ctx.exception))

    def test_rejects_merging_two_tables_that_each_hold_a_separate_active_order(self):
        """Only the *anchor* may carry an active order: an occupied target is
        already rejected above, but an anchor+target pair that both have an
        unprinted draft invoice (possible when `occupied` has drifted) would
        silently lose one bill, so it is rejected too."""
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
                "T2": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
            },
            invoices=[
                {"name": "INV-1", "docstatus": 0, "restaurant_table": "T1", "invoice_printed": 0},
                {"name": "INV-2", "docstatus": 0, "restaurant_table": "T2", "invoice_printed": 0},
            ],
        )
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1", ["T2"])
        self.assertIn("separate active orders", str(ctx.exception))

    def test_allows_a_merge_when_only_the_anchor_holds_an_active_order(self):
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
                "T2": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0},
            },
            invoices=[
                {"name": "INV-1", "docstatus": 0, "restaurant_table": "T1", "invoice_printed": 0}
            ],
        )
        self.assertTrue(self._run(fake, "T1", ["T2"]))
        self.assertEqual(fake.tables["T2"]["merged_with"], "T1")

    def test_merge_syncs_the_open_order_and_its_invoice_onto_the_new_cluster(self):
        """The two follow-up steps are mocked out in the guard tests above;
        here they are asserted to actually be invoked with the anchor and the
        full sorted cluster respectively."""
        fake = self._two_free_tables()
        with ExitStack() as stack:
            _patch_db(stack, fake)
            mock_sync = stack.enter_context(
                patch(f"{MODULE}._sync_active_order_with_merge_cluster")
            )
            mock_reconcile = stack.enter_context(
                patch(f"{MODULE}._reconcile_open_invoices_for_tables")
            )
            merge_tables_batch("T1", ["T2"])
        mock_sync.assert_called_once_with("T1")
        mock_reconcile.assert_called_once_with(["T1", "T2"])


class TestUnmergeTables(FrappeTestCase):
    """`unmerge_tables`: the two guards plus the clearing write."""

    def _run(self, fake, table):
        with ExitStack() as stack:
            _patch_db(stack, fake)
            return unmerge_tables(table)

    def test_unmerges_every_member_of_the_cluster(self):
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": "T2", "occupied": 0},
                "T2": {"restaurant_room": "Hall", "merged_with": "T1", "occupied": 0},
            }
        )
        self.assertTrue(self._run(fake, "T1"))
        self.assertIsNone(fake.tables["T1"]["merged_with"])
        self.assertIsNone(fake.tables["T2"]["merged_with"])
        self.assertEqual(fake.commits, 1)

    def test_unmerging_reached_from_any_member_clears_the_whole_cluster(self):
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": "T2,T3", "occupied": 0},
                "T2": {"restaurant_room": "Hall", "merged_with": "T1,T3", "occupied": 0},
                "T3": {"restaurant_room": "Hall", "merged_with": "T1,T2", "occupied": 0},
            }
        )
        self.assertTrue(self._run(fake, "T3"))
        for name in ("T1", "T2", "T3"):
            self.assertIsNone(fake.tables[name]["merged_with"])

    def test_rejects_an_unmerged_table(self):
        fake = _FakeTableDB(
            tables={"T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 0}}
        )
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1")
        self.assertIn("not merged", str(ctx.exception))

    def test_rejects_unmerging_while_an_unprinted_bill_is_open_on_the_cluster(self):
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": "T2", "occupied": 1},
                "T2": {"restaurant_room": "Hall", "merged_with": "T1", "occupied": 1},
            },
            invoices=[
                {
                    "name": "INV-1",
                    "docstatus": 0,
                    "restaurant_table": "T1",
                    "custom_merged_tables": "T2",
                    "invoice_printed": 0,
                }
            ],
        )
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(fake, "T1")
        self.assertIn("Cannot unmerge active tables", str(ctx.exception))
        self.assertEqual(fake.tables["T1"]["merged_with"], "T2")

    def test_allows_unmerging_once_the_open_bill_has_been_printed(self):
        """`invoice_printed = 1` is the state `release_tables_after_print`
        acts on; a still-draft but printed invoice no longer blocks unmerge."""
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": "T2", "occupied": 1},
                "T2": {"restaurant_room": "Hall", "merged_with": "T1", "occupied": 1},
            },
            invoices=[
                {
                    "name": "INV-1",
                    "docstatus": 0,
                    "restaurant_table": "T1",
                    "custom_merged_tables": "T2",
                    "invoice_printed": 1,
                }
            ],
        )
        self.assertTrue(self._run(fake, "T1"))
        self.assertIsNone(fake.tables["T1"]["merged_with"])

    def test_a_bill_that_only_names_the_table_as_a_merged_partner_also_blocks(self):
        """`_has_open_pos_invoices_for_cluster` deliberately checks both
        `restaurant_table` and the `custom_merged_tables` CSV, so a secondary
        member of the cluster is protected by the primary's open bill."""
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": "T2", "occupied": 1},
                "T2": {"restaurant_room": "Hall", "merged_with": "T1", "occupied": 1},
            },
            invoices=[
                {
                    "name": "INV-1",
                    "docstatus": 0,
                    "restaurant_table": "T9",
                    "custom_merged_tables": "T2",
                    "invoice_printed": 0,
                }
            ],
        )
        with self.assertRaises(frappe.ValidationError):
            self._run(fake, "T2")


class TestReleaseTablesAfterPrint(FrappeTestCase):
    """`release_tables_after_print`: the write-permission gate and the set of
    tables it frees."""

    def _run(self, fake, invoice_doc, permitted=True):
        with ExitStack() as stack:
            _patch_db(stack, fake)
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=invoice_doc))
            stack.enter_context(
                patch(f"{MODULE}.frappe.has_permission", return_value=permitted)
            )
            return release_tables_after_print("INV-1")

    def test_frees_every_table_in_the_invoices_merge_cluster(self):
        fake = _FakeTableDB(
            tables={
                "T1": {
                    "restaurant_room": "Hall",
                    "merged_with": "T2",
                    "occupied": 1,
                    "latest_invoice_time": "2026-01-01 10:00:00",
                },
                "T2": {
                    "restaurant_room": "Hall",
                    "merged_with": "T1",
                    "occupied": 1,
                    "latest_invoice_time": "2026-01-01 10:00:00",
                },
            }
        )
        invoice = _FakeInvoice(name="INV-1", restaurant_table="T1", custom_merged_tables="T2")
        self.assertTrue(self._run(fake, invoice))
        for name in ("T1", "T2"):
            self.assertEqual(fake.tables[name]["occupied"], 0)
            self.assertIsNone(fake.tables[name]["latest_invoice_time"])

    def test_releasing_does_not_clear_the_merge_relationship(self):
        """A printed bill frees the tables for seating but deliberately leaves
        `merged_with` intact -- undoing a merge is `unmerge_tables`'s job, and
        a physically joined table stays joined across bills."""
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": "T2", "occupied": 1},
                "T2": {"restaurant_room": "Hall", "merged_with": "T1", "occupied": 1},
            }
        )
        invoice = _FakeInvoice(name="INV-1", restaurant_table="T1", custom_merged_tables="T2")
        self._run(fake, invoice)
        self.assertEqual(fake.tables["T1"]["merged_with"], "T2")

    def test_a_table_named_only_in_custom_merged_tables_is_still_released(self):
        """The invoice's own CSV is unioned with the live cluster, so a
        partner that has since been unmerged from the table still gets freed
        rather than being left stuck as occupied."""
        fake = _FakeTableDB(
            tables={
                "T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 1},
                "T5": {"restaurant_room": "Hall", "merged_with": None, "occupied": 1},
            }
        )
        invoice = _FakeInvoice(name="INV-1", restaurant_table="T1", custom_merged_tables="T5")
        self.assertTrue(self._run(fake, invoice))
        self.assertEqual(fake.tables["T5"]["occupied"], 0)

    def test_releasing_an_already_released_table_is_idempotent(self):
        """There is no "already released" guard by design: the endpoint is
        fired from the print flow, which can retry. Re-running must stay a
        no-op rather than throwing."""
        fake = _FakeTableDB(
            tables={
                "T1": {
                    "restaurant_room": "Hall",
                    "merged_with": None,
                    "occupied": 0,
                    "latest_invoice_time": None,
                }
            }
        )
        invoice = _FakeInvoice(name="INV-1", restaurant_table="T1", custom_merged_tables=None)
        self.assertTrue(self._run(fake, invoice))
        self.assertTrue(self._run(fake, invoice))
        self.assertEqual(fake.tables["T1"]["occupied"], 0)

    def test_denies_a_caller_without_write_permission_on_the_invoice(self):
        fake = _FakeTableDB(
            tables={"T1": {"restaurant_room": "Hall", "merged_with": None, "occupied": 1}}
        )
        invoice = _FakeInvoice(name="INV-1", restaurant_table="T1", custom_merged_tables=None)
        with self.assertRaises(frappe.PermissionError):
            self._run(fake, invoice, permitted=False)
        # The guard must fire before any table state is mutated.
        self.assertEqual(fake.tables["T1"]["occupied"], 1)


class TestPosOpeningCheck(FrappeTestCase):
    """`pos_opening_check`: the three shapes the POS shell branches on."""

    def test_administrator_short_circuits_without_touching_the_branch_lookup(self):
        with ExitStack() as stack:
            stack.enter_context(
                patch(f"{MODULE}.frappe.session", MagicMock(user="Administrator"))
            )
            mock_branch_room = stack.enter_context(patch(f"{MODULE}.getBranchRoom"))
            result = pos_opening_check()
        self.assertEqual(
            result, {"opening_exists": False, "cashier": None, "pos_profile": None}
        )
        mock_branch_room.assert_not_called()

    def _run_for_cashier(self, rows, opening_doc=None):
        with ExitStack() as stack:
            stack.enter_context(
                patch(f"{MODULE}.frappe.session", MagicMock(user="cashier@example.com"))
            )
            stack.enter_context(
                patch(
                    f"{MODULE}.getBranchRoom",
                    return_value=[{"name": "Hall", "branch": "Test Branch"}],
                )
            )
            mock_sql = stack.enter_context(
                patch(f"{MODULE}.frappe.db.sql", return_value=rows)
            )
            stack.enter_context(
                patch(f"{MODULE}.frappe.get_doc", return_value=opening_doc or MagicMock())
            )
            return pos_opening_check(), mock_sql

    def test_reports_no_opening_entry_when_the_lookup_is_empty(self):
        result, mock_sql = self._run_for_cashier([])
        self.assertEqual(
            result, {"opening_exists": False, "cashier": None, "pos_profile": None}
        )
        # The room/branch pair from getBranchRoom must be what is queried.
        self.assertEqual(mock_sql.call_args[0][1], ("Test Branch", "Hall"))

    def test_reports_the_cashier_and_profile_of_an_open_entry(self):
        opening = MagicMock()
        opening.user = "cashier@example.com"
        opening.pos_profile = "Test Profile"
        result, _mock_sql = self._run_for_cashier(
            [frappe._dict({"name": "POS-OPE-0001"})], opening_doc=opening
        )
        self.assertEqual(
            result,
            {
                "opening_exists": True,
                "cashier": "cashier@example.com",
                "pos_profile": "Test Profile",
            },
        )

    def test_an_entry_opened_by_another_cashier_is_still_reported_as_open(self):
        """The check is branch+room scoped, not user scoped: a second cashier
        arriving at the same room must see the existing session (and whose it
        is) rather than being offered a conflicting new opening entry."""
        opening = MagicMock()
        opening.user = "someone.else@example.com"
        opening.pos_profile = "Test Profile"
        result, _mock_sql = self._run_for_cashier(
            [frappe._dict({"name": "POS-OPE-0001"})], opening_doc=opening
        )
        self.assertTrue(result["opening_exists"])
        self.assertEqual(result["cashier"], "someone.else@example.com")

    def test_only_the_first_of_several_open_entries_is_reported(self):
        """Documents the current resolution of a conflicting-state DB: the
        query can return more than one open entry for the same branch+room
        (nothing enforces uniqueness), and the endpoint silently takes the
        first rather than throwing."""
        opening = MagicMock()
        opening.user = "first@example.com"
        opening.pos_profile = "Profile A"
        with ExitStack() as stack:
            stack.enter_context(
                patch(f"{MODULE}.frappe.session", MagicMock(user="cashier@example.com"))
            )
            stack.enter_context(
                patch(
                    f"{MODULE}.getBranchRoom",
                    return_value=[{"name": "Hall", "branch": "Test Branch"}],
                )
            )
            stack.enter_context(
                patch(
                    f"{MODULE}.frappe.db.sql",
                    return_value=[
                        frappe._dict({"name": "POS-OPE-0001"}),
                        frappe._dict({"name": "POS-OPE-0002"}),
                    ],
                )
            )
            mock_get_doc = stack.enter_context(
                patch(f"{MODULE}.frappe.get_doc", return_value=opening)
            )
            result = pos_opening_check()
        self.assertTrue(result["opening_exists"])
        self.assertEqual(result["cashier"], "first@example.com")
        mock_get_doc.assert_called_once_with("POS Opening Entry", "POS-OPE-0001")


class TestValidateAdditionalDiscount(unittest.TestCase):
    """`_validate_additional_discount` is `make_invoice`'s authoritative
    server-side discount gate; it runs before any invoice state is mutated."""

    def test_no_discount_values_normalize_to_zero(self):
        for value in (None, "", 0, "0", -5):
            with self.subTest(value=value):
                self.assertEqual(_validate_additional_discount(value, "Test Profile"), 0)

    def test_a_non_numeric_discount_falls_through_to_no_discount(self):
        """The function has an explicit `except (TypeError, ValueError)` ->
        throw branch for a garbage discount, but it is unreachable: `flt()`
        swallows the conversion error itself and returns 0.0, so "ten percent"
        lands on the `discount <= 0` early return instead of the throw.

        Asserting the real behaviour rather than the intended one, because the
        real behaviour is the *fail-safe* of the two -- an unparseable discount
        is dropped, never applied -- so tightening it to a throw would be a
        behaviour change for the POS client, not a bug fix, and belongs in its
        own change rather than being smuggled in with a test."""
        self.assertEqual(_validate_additional_discount("ten percent", "Test Profile"), 0)

    def test_a_none_pos_profile_is_never_loaded_for_a_zero_discount(self):
        """The profile lookup sits behind the `discount <= 0` early return, so
        the no-discount path must not hit the DB at all."""
        with patch(f"{MODULE}.frappe.get_doc") as mock_get_doc:
            self.assertEqual(_validate_additional_discount(0, None), 0)
        mock_get_doc.assert_not_called()

    def test_a_discount_is_rejected_when_the_profile_does_not_enable_discounts(self):
        profile = MagicMock()
        profile.custom_enable_discount = 0
        with patch(f"{MODULE}.frappe.get_doc", return_value=profile):
            with self.assertRaises(frappe.PermissionError):
                _validate_additional_discount(10, "Test Profile")

    def test_a_discount_above_the_ceiling_is_rejected(self):
        profile = MagicMock()
        profile.custom_enable_discount = 1
        with patch(f"{MODULE}.frappe.get_doc", return_value=profile):
            with self.assertRaises(frappe.ValidationError) as ctx:
                _validate_additional_discount(150, "Test Profile")
        self.assertIn("exceeds the maximum", str(ctx.exception))

    def test_a_discount_is_rejected_for_a_role_not_on_the_allow_list(self):
        profile = MagicMock()
        profile.custom_enable_discount = 1
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=profile))
            stack.enter_context(
                patch(f"{MODULE}.frappe.get_roles", return_value=["URY Waiter"])
            )
            with self.assertRaises(frappe.PermissionError):
                _validate_additional_discount(10, "Test Profile")

    def test_an_authorized_role_gets_the_sanitized_percentage_back(self):
        profile = MagicMock()
        profile.custom_enable_discount = 1
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=profile))
            stack.enter_context(
                patch(f"{MODULE}.frappe.get_roles", return_value=["URY Cashier"])
            )
            self.assertEqual(_validate_additional_discount("12.5", "Test Profile"), 12.5)


class TestMakeInvoice(FrappeTestCase):
    """`make_invoice`: payment application, submit, and table release."""

    def _invoice(self, **overrides):
        fields = dict(
            name="POS-INV-SRC",
            docstatus=0,
            branch="Test Branch",
            company="Test Company",
            restaurant=None,
            restaurant_table="T1",
            custom_merged_tables=None,
            custom_merged_pos_invoice=None,
            pos_profile="Test Profile",
            customer="Walk In",
            additional_discount_percentage=None,
            rounded_total=250,
            items=[],
            payments=[],
        )
        fields.update(overrides)
        invoice = _FakeInvoice(**fields)
        invoice.submit = MagicMock()
        invoice.save = MagicMock()
        # The merged-bill branch sets `.flags.ignore_payment_sync` on both
        # sides; a real Document always has a flags _dict.
        invoice.flags = frappe._dict()
        return invoice

    def _run(self, invoice, payments, stack, discount=None, table="T1", roles=None):
        stack.enter_context(patch(f"{MODULE}.get_order_invoice", return_value=invoice))
        stack.enter_context(
            patch(f"{MODULE}.frappe.get_value", return_value="Dine In")
        )
        stack.enter_context(
            patch(f"{MODULE}.get_restaurant_and_menu_name", return_value="Test Restaurant")
        )
        stack.enter_context(
            patch(f"{MODULE}.frappe.get_roles", return_value=roles or ["URY Cashier"])
        )
        stack.enter_context(
            patch(f"{MODULE}.frappe.session", MagicMock(user="cashier@example.com"))
        )
        return make_invoice(
            customer="Walk In",
            payments=payments,
            cashier="cashier@example.com",
            pos_profile="Test Profile",
            owner="cashier@example.com",
            additionalDiscount=discount,
            table=table,
        )

    def test_applies_the_payment_rows_and_submits_the_invoice(self):
        invoice = self._invoice()
        with ExitStack() as stack:
            mock_free = stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(invoice, [{"mode_of_payment": "Cash", "amount": 250}], stack)
        self.assertEqual(len(invoice.payments), 1)
        self.assertEqual(invoice.payments[0].mode_of_payment, "Cash")
        self.assertEqual(invoice.payments[0].amount, 250)
        invoice.save.assert_called_once()
        invoice.submit.assert_called_once()
        mock_free.assert_called_once_with("T1", None)

    def test_multiple_payment_modes_are_all_applied(self):
        invoice = self._invoice()
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(
                invoice,
                [
                    {"mode_of_payment": "Cash", "amount": 100},
                    {"mode_of_payment": "Card", "amount": 150},
                ],
                stack,
            )
        self.assertEqual(
            [(row.mode_of_payment, row.amount) for row in invoice.payments],
            [("Cash", 100), ("Card", 150)],
        )

    def test_any_pre_existing_payment_rows_are_discarded_before_settlement(self):
        """The invoice may already carry a provisional payment row written by
        `split_bill`/`sync_order`; settlement must replace, not append to, it."""
        invoice = self._invoice(payments=[_FakeRow(mode_of_payment="Cash", amount=999)])
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(invoice, [{"mode_of_payment": "Card", "amount": 250}], stack)
        self.assertEqual(len(invoice.payments), 1)
        self.assertEqual(invoice.payments[0].mode_of_payment, "Card")

    def test_a_discount_from_an_unauthorized_role_is_rejected_before_any_mutation(self):
        invoice = self._invoice()
        profile = MagicMock()
        profile.custom_enable_discount = 1
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=profile))
            stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            with self.assertRaises(frappe.PermissionError):
                self._run(
                    invoice,
                    [{"mode_of_payment": "Cash", "amount": 200}],
                    stack,
                    discount=20,
                    roles=["URY Waiter"],
                )
        invoice.save.assert_not_called()
        invoice.submit.assert_not_called()
        self.assertEqual(invoice.payments, [])

    def test_a_discount_on_a_profile_without_discounts_enabled_is_rejected(self):
        invoice = self._invoice()
        profile = MagicMock()
        profile.custom_enable_discount = 0
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=profile))
            with self.assertRaises(frappe.PermissionError):
                self._run(
                    invoice, [{"mode_of_payment": "Cash", "amount": 200}], stack, discount=20
                )
        invoice.submit.assert_not_called()

    def test_an_authorized_discount_is_written_onto_the_invoice(self):
        invoice = self._invoice()
        profile = MagicMock()
        profile.custom_enable_discount = 1
        profile.get.return_value = 1
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=profile))
            stack.enter_context(patch(f"{MODULE}.frappe.get_cached_doc", return_value=profile))
            stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(
                invoice, [{"mode_of_payment": "Cash", "amount": 200}], stack, discount=20
            )
        self.assertEqual(invoice.additional_discount_percentage, 20)
        invoice.submit.assert_called_once()

    def test_no_discount_explicitly_zeroes_the_field(self):
        """An invoice carrying a stale `additional_discount_percentage` must
        be reset rather than silently settling at the old discount."""
        invoice = self._invoice(additional_discount_percentage=30)
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(invoice, [{"mode_of_payment": "Cash", "amount": 250}], stack)
        self.assertEqual(invoice.additional_discount_percentage, 0)

    def test_a_failure_during_submit_is_surfaced_not_swallowed(self):
        invoice = self._invoice()
        invoice.submit = MagicMock(side_effect=Exception("timestamp mismatch"))
        with ExitStack() as stack:
            mock_free = stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            with self.assertRaises(frappe.ValidationError) as ctx:
                self._run(invoice, [{"mode_of_payment": "Cash", "amount": 250}], stack)
        self.assertIn("Error while settling order", str(ctx.exception))
        # Tables must not be freed for an order that never settled.
        mock_free.assert_not_called()

    def test_a_takeaway_invoice_with_no_table_frees_nothing(self):
        invoice = self._invoice(restaurant_table=None)
        with ExitStack() as stack:
            mock_free = stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(invoice, [{"mode_of_payment": "Cash", "amount": 250}], stack, table=None)
        invoice.submit.assert_called_once()
        mock_free.assert_not_called()

    def test_a_secondary_merged_bill_releases_the_primary_invoices_tables(self):
        """A merged secondary bill carries no `restaurant_table` of its own;
        the table release has to follow `custom_merged_pos_invoice` back to
        the primary, or the merged tables stay occupied forever."""
        primary = self._invoice(name="POS-INV-PRIMARY", restaurant_table="T1",
                                custom_merged_tables="T2")
        secondary = self._invoice(
            name="POS-INV-SECONDARY",
            restaurant_table=None,
            custom_merged_pos_invoice="POS-INV-PRIMARY",
        )
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=primary))
            mock_free = stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(
                secondary, [{"mode_of_payment": "Cash", "amount": 250}], stack, table=None
            )
        mock_free.assert_called_once_with("T1", "T2")
        # The tendered amount covers this bill only; the primary keeps its own
        # dues rather than being credited twice for the same cash.
        self.assertEqual([row.amount for row in secondary.payments], [250])
        self.assertEqual(primary.payments, [])

    def test_a_merged_pair_splits_one_tender_across_both_bills(self):
        """A single tendered amount larger than the secondary's own total
        spills over onto the primary, capped at each bill's rounded total --
        this is the whole point of the merged-bill branch."""
        primary = self._invoice(name="POS-INV-PRIMARY", restaurant_table="T1", rounded_total=100)
        secondary = self._invoice(
            name="POS-INV-SECONDARY",
            restaurant_table=None,
            custom_merged_pos_invoice="POS-INV-PRIMARY",
            rounded_total=250,
        )
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=primary))
            stack.enter_context(patch(f"{MODULE}._free_tables_if_no_open_invoices"))
            self._run(
                secondary, [{"mode_of_payment": "Cash", "amount": 400}], stack, table=None
            )
        self.assertEqual([row.amount for row in secondary.payments], [250])
        self.assertEqual([row.amount for row in primary.payments], [100])
        primary.save.assert_called_once()


class TestSplitBillGuards(FrappeTestCase):
    """`split_bill`'s guard clauses. `TestSplitBillReservations` in
    `test_ury_order.py` covers the happy-path reservation/KOT side; nothing
    covered the rejection paths."""

    def setUp(self):
        patcher = patch(
            f"{MODULE}.get_branch_stock_policy",
            return_value=StockPolicy(False, False, False),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def _source(self, **overrides):
        item_a = _FakeRow(
            name="ITEM-ROW-A",
            item_code="ITEM-A",
            item_name="Item A",
            qty=2,
            rate=100,
            price_list_rate=100,
            base_price_list_rate=100,
            cost_center="Cost Center",
            uom="Nos",
            conversion_factor=1,
            warehouse="WH-A",
        )
        item_b = _FakeRow(
            name="ITEM-ROW-B",
            item_code="ITEM-B",
            item_name="Item B",
            qty=1,
            rate=50,
            price_list_rate=50,
            base_price_list_rate=50,
            cost_center="Cost Center",
            uom="Nos",
            conversion_factor=1,
            warehouse="WH-B",
        )
        fields = dict(
            name="POS-INV-SRC",
            docstatus=0,
            branch="Test Branch",
            company="Test Company",
            pos_profile="Test Profile",
            customer="Walk In",
            customer_name="Walk In",
            selling_price_list="Standard Selling",
            currency="INR",
            conversion_rate=1,
            price_list_currency="INR",
            is_pos=1,
            update_stock=0,
            naming_series="POS-INV-.YYYY.-",
            custom_split_group=None,
            items=[item_a, item_b],
            rounded_total=250,
        )
        fields.update(overrides)
        return _FakeInvoice(**fields)

    def _run(self, source, items_to_move, permitted=True, user_branch="Test Branch"):
        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.frappe.has_permission", return_value=permitted))
            stack.enter_context(patch(f"{MODULE}.frappe.get_doc", return_value=source))
            stack.enter_context(
                patch(f"{MODULE}.frappe.new_doc", return_value=_FakeInvoice(items=[], payments=[]))
            )
            stack.enter_context(patch(f"{MODULE}.getBranch", return_value=user_branch))
            stack.enter_context(patch(f"{MODULE}._enforce_order_access"))
            stack.enter_context(patch(f"{MODULE}.reconcile_order_reservations"))
            stack.enter_context(patch(f"{MODULE}.frappe.db.set_value"))
            stack.enter_context(patch(f"{MODULE}.frappe.get_all", return_value=[]))
            stack.enter_context(
                patch(f"{MODULE}.frappe.generate_hash", return_value="SPLITGRP01")
            )
            return split_bill("POS-INV-SRC", items_to_move)

    def test_splits_a_partial_allocation_onto_a_new_sibling_invoice(self):
        source = self._source()
        result = self._run(source, [{"name": "ITEM-ROW-A", "qty": 1}])
        self.assertEqual(result["source_invoice"], "POS-INV-SRC")
        self.assertEqual(result["new_invoice"], "POS-INV-NEW")
        # One unit moved, one left behind on the same row.
        self.assertEqual(source.items[0].qty, 1)
        self.assertEqual(source.custom_split_group, "SPLITGRP01")

    def test_items_to_move_accepted_as_a_json_string(self):
        source = self._source()
        result = self._run(source, json.dumps([{"name": "ITEM-ROW-A", "qty": 1}]))
        self.assertEqual(result["new_invoice"], "POS-INV-NEW")

    def test_a_fully_moved_row_is_removed_from_the_source(self):
        source = self._source()
        self._run(source, [{"name": "ITEM-ROW-A", "qty": 2}])
        self.assertEqual([item.name for item in source.items], ["ITEM-ROW-B"])

    def test_denies_a_caller_without_write_permission(self):
        source = self._source()
        with self.assertRaises(frappe.PermissionError):
            self._run(source, [{"name": "ITEM-ROW-A", "qty": 1}], permitted=False)

    def test_denies_splitting_an_invoice_from_another_branch(self):
        source = self._source()
        with self.assertRaises(frappe.PermissionError) as ctx:
            self._run(source, [{"name": "ITEM-ROW-A", "qty": 1}], user_branch="Other Branch")
        self.assertIn("another branch", str(ctx.exception))

    def test_rejects_a_submitted_invoice(self):
        source = self._source(docstatus=1)
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(source, [{"name": "ITEM-ROW-A", "qty": 1}])
        self.assertIn("Only draft invoices", str(ctx.exception))

    def test_rejects_an_empty_allocation(self):
        source = self._source()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(source, [])
        self.assertIn("at least one item to move", str(ctx.exception))

    def test_rejects_an_allocation_of_only_zero_quantities(self):
        source = self._source()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(source, [{"name": "ITEM-ROW-A", "qty": 0}])
        self.assertIn("at least one item to move", str(ctx.exception))

    def test_rejects_moving_more_than_the_available_quantity(self):
        source = self._source()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(source, [{"name": "ITEM-ROW-A", "qty": 5}])
        self.assertIn("more than available quantity", str(ctx.exception))
        # Nothing may have been mutated on the way to the rejection.
        self.assertEqual(source.items[0].qty, 2)

    def test_rejects_an_allocation_naming_a_row_that_is_not_on_the_invoice(self):
        """An unknown row name contributes no quantity, so the allocation is
        empty as far as the source invoice is concerned and is rejected rather
        than producing an empty sibling bill."""
        source = self._source()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(source, [{"name": "ITEM-ROW-GHOST", "qty": 1}])
        self.assertIn("at least one item to move", str(ctx.exception))

    def test_rejects_moving_every_item_off_the_original_bill(self):
        source = self._source()
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._run(
                source,
                [{"name": "ITEM-ROW-A", "qty": 2}, {"name": "ITEM-ROW-B", "qty": 1}],
            )
        self.assertIn("At least one item must remain", str(ctx.exception))
