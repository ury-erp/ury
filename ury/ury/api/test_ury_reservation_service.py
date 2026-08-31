"""Tests for ury_reservation_service.

Static-review note: none of these tests have been executed in this
environment -- there is no live bench/site/DB available, only a detached
checkout of the app source. They are written and hand-traced to the same
mocking pattern used by `ury/ury/api/test_ury_stock_service.py` (patching
`frappe.db.sql`, `frappe.db.get_value`, `frappe.get_all`, and
`frappe.get_doc` so the module under test never touches a real database),
and reviewed by hand line-by-line against the service module's logic.
`test_two_terminal_concurrent_reservation` is additionally marked
NOT EXECUTED / unexecutable by design -- see its docstring.
"""

import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_reservation_service import (
    CANCELLED,
    FULFILLED,
    RELEASED,
    RESERVED,
    cancel_reservation,
    create_reservation,
    fulfil_reservation,
    release_reservation,
)


MODULE = "ury.ury.api.ury_reservation_service"


def _new_doc_recorder():
    """Return a frappe.get_doc side_effect that records constructed/loaded docs."""
    created = []

    def _get_doc(*args, **kwargs):
        arg = args[0] if args else kwargs.get("arg1")
        if isinstance(arg, dict):
            doc = frappe._dict(dict(arg))
            doc.insert = MagicMock()
            doc.save = MagicMock()
            created.append(doc)
            return doc
        raise AssertionError("doc lookups by name should be dispatched separately in each test")

    return _get_doc, created


class TestCreateReservationSimpleItem(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_reservation_within_capacity_succeeds(self):
        """Plain stock item (no BOM) with enough Bin capacity reserves successfully."""
        get_doc_side_effect, created = _new_doc_recorder()

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql",
            return_value=[{"name": "BIN-1", "actual_qty": 10, "projected_qty": 10}],
        ), patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ), patch(
            f"{MODULE}.frappe.generate_hash", return_value="GRP1"
        ):
            result = create_reservation(
                item_code="ITEM-SIMPLE",
                qty=4,
                warehouse="WH-1",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-1",
            )

        self.assertEqual(result["reservation_group"], "GRP1")
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["component_item"], "ITEM-SIMPLE")
        self.assertEqual(created[0]["qty"], 4)
        self.assertEqual(created[0]["status"], RESERVED)
        audit = json.loads(created[0]["audit_log"])
        self.assertEqual(audit[0]["event"], "create")

    def test_reservation_exceeding_capacity_is_rejected(self):
        """Requesting more than Bin.projected_qty minus active reservations raises and inserts nothing."""
        get_doc_side_effect, created = _new_doc_recorder()

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql",
            return_value=[{"name": "BIN-1", "actual_qty": 3, "projected_qty": 3}],
        ), patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ):
            with self.assertRaises(frappe.ValidationError):
                create_reservation(
                    item_code="ITEM-SIMPLE",
                    qty=5,
                    warehouse="WH-1",
                    branch="Branch A",
                    company="Company A",
                    order_ref="ORDER-2",
                )

        self.assertEqual(created, [])


class TestCreateReservationCompositeItem(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_all_or_nothing_rejected_when_one_shared_component_short(self):
        """Composite item with two components; one has enough capacity, the other does not.

        Hand-traced trace (also reported to the caller): item MENU-A has an
        active default BOM exploding to component_item=FLOUR (qty_per_unit=2)
        and component_item=SUGAR (qty_per_unit=1), for order qty=3, so
        required qty is FLOUR=6, SUGAR=3. Bin.projected_qty for FLOUR is 10
        (plenty), Bin.projected_qty for SUGAR is 2 (short by 1). Expected:
        the whole call raises frappe.ValidationError and NO reservation row
        is created for FLOUR either, even though FLOUR alone had capacity --
        this is the all-or-nothing behaviour under test.
        """
        get_doc_side_effect, created = _new_doc_recorder()

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if doctype == "BOM":
                if isinstance(filters, dict) and "item" in filters:
                    return "BOM-MENU-A"
                if isinstance(filters, str) and field == "quantity":
                    return 1
            return None

        def sql_side_effect(query, params, **kwargs):
            item_code = params["item_code"]
            bin_qty = {"FLOUR": 10, "SUGAR": 2}[item_code]
            return [{"name": f"BIN-{item_code}", "actual_qty": bin_qty, "projected_qty": bin_qty}]

        def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
            if doctype == "BOM Item":
                return [
                    frappe._dict(item_code="FLOUR", stock_qty=2, stock_uom="Kg", is_sub_assembly_item=0, bom_no=None),
                    frappe._dict(item_code="SUGAR", stock_qty=1, stock_uom="Kg", is_sub_assembly_item=0, bom_no=None),
                ]
            return []  # no pre-existing active reservations

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
        ), patch(
            f"{MODULE}.frappe.db.get_value", side_effect=get_value_side_effect
        ), patch(
            f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ):
            with self.assertRaises(frappe.ValidationError):
                create_reservation(
                    item_code="MENU-A",
                    qty=3,
                    warehouse="WH-1",
                    branch="Branch A",
                    company="Company A",
                    order_ref="ORDER-3",
                )

        # All-or-nothing: no reservation row created for FLOUR (which alone
        # had capacity) or SUGAR (which did not).
        self.assertEqual(created, [])

    def test_composite_reservation_succeeds_when_all_components_have_capacity(self):
        get_doc_side_effect, created = _new_doc_recorder()

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if doctype == "BOM":
                if isinstance(filters, dict) and "item" in filters:
                    return "BOM-MENU-A"
                if isinstance(filters, str) and field == "quantity":
                    return 1
            return None

        def sql_side_effect(query, params, **kwargs):
            item_code = params["item_code"]
            bin_qty = {"FLOUR": 10, "SUGAR": 10}[item_code]
            return [{"name": f"BIN-{item_code}", "actual_qty": bin_qty, "projected_qty": bin_qty}]

        def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
            if doctype == "BOM Item":
                return [
                    frappe._dict(item_code="FLOUR", stock_qty=2, stock_uom="Kg", is_sub_assembly_item=0, bom_no=None),
                    frappe._dict(item_code="SUGAR", stock_qty=1, stock_uom="Kg", is_sub_assembly_item=0, bom_no=None),
                ]
            return []

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
        ), patch(
            f"{MODULE}.frappe.db.get_value", side_effect=get_value_side_effect
        ), patch(
            f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ), patch(
            f"{MODULE}.frappe.generate_hash", return_value="GRP2"
        ):
            result = create_reservation(
                item_code="MENU-A",
                qty=3,
                warehouse="WH-1",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-4",
            )

        self.assertEqual(len(created), 2)
        by_item = {row["component_item"]: row["qty"] for row in created}
        self.assertEqual(by_item["FLOUR"], 6)
        self.assertEqual(by_item["SUGAR"], 3)
        self.assertEqual(result["reservation_group"], "GRP2")

    def test_nested_sub_assembly_resolves_to_leaf_components_not_the_sub_assembly(self):
        """Composite item whose BOM contains a nested sub-assembly.

        Hand-traced trace: BURGER's BOM (BOM-BURGER-001) has two lines: BUN
        (a plain/raw component, qty_per_unit=1) and SUB_PATTY (flagged
        `is_sub_assembly_item`, qty_per_unit=1, pointing at its own BOM
        BOM-PATTY-001). No `BOM Explosion Item` rows are populated for either
        BOM, so `compile_bom_vector` (from the reused V3-41
        `ury_bom_compiler`) falls back to manual recursive `BOM Item`
        traversal: it recurses into BOM-PATTY-001, which has two raw lines,
        MEAT (qty_per_unit=0.1) and BREADING (qty_per_unit=0.02), and flattens
        them into the top-level vector instead of stopping at SUB_PATTY.

        For order qty=2, expected resolved components are:
          BUN      = 2 * 1    = 2
          MEAT     = 2 * 0.1  = 0.2
          BREADING = 2 * 0.02 = 0.04
        and SUB_PATTY must NOT appear anywhere in the resolved component set
        -- i.e. reserving BURGER must attempt to lock/check MEAT and BREADING
        (the leaf components), never the intermediate sub-assembly.
        """
        get_doc_side_effect, created = _new_doc_recorder()

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if doctype == "BOM":
                # Top-level composite-check lookup in _resolve_components,
                # and compile_bom_vector's own active-BOM resolution, both
                # query by a dict filter containing "item".
                if isinstance(filters, dict) and filters.get("item") == "BURGER":
                    return "BOM-BURGER-001"
                # BOM.quantity lookups (frappe.db.get_value(doctype, name, field))
                # use a positional string filter for both BOM-BURGER-001 and
                # BOM-PATTY-001 (the sub-assembly's own BOM).
                if isinstance(filters, str):
                    return 1
            return None

        def sql_side_effect(query, params, **kwargs):
            item_code = params["item_code"]
            bin_qty = {"BUN": 100, "MEAT": 100, "BREADING": 100}[item_code]
            return [{"name": f"BIN-{item_code}", "actual_qty": bin_qty, "projected_qty": bin_qty}]

        def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
            if doctype == "BOM Explosion Item":
                # No explosion rows populated -> forces manual recursion,
                # which is the path that must resolve nested sub-assemblies.
                return []
            if doctype == "BOM Item":
                parent = filters["parent"]
                if parent == "BOM-BURGER-001":
                    return [
                        frappe._dict(
                            item_code="BUN",
                            stock_qty=1,
                            stock_uom="Nos",
                            is_sub_assembly_item=0,
                            bom_no=None,
                        ),
                        frappe._dict(
                            item_code="SUB_PATTY",
                            stock_qty=1,
                            stock_uom="Nos",
                            is_sub_assembly_item=1,
                            bom_no="BOM-PATTY-001",
                        ),
                    ]
                if parent == "BOM-PATTY-001":
                    return [
                        frappe._dict(
                            item_code="MEAT",
                            stock_qty=0.1,
                            stock_uom="Kg",
                            is_sub_assembly_item=0,
                            bom_no=None,
                        ),
                        frappe._dict(
                            item_code="BREADING",
                            stock_qty=0.02,
                            stock_uom="Kg",
                            is_sub_assembly_item=0,
                            bom_no=None,
                        ),
                    ]
                return []
            return []  # no pre-existing active reservations

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
        ), patch(
            f"{MODULE}.frappe.db.get_value", side_effect=get_value_side_effect
        ), patch(
            f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ), patch(
            f"{MODULE}.frappe.generate_hash", return_value="GRP3"
        ):
            result = create_reservation(
                item_code="BURGER",
                qty=2,
                warehouse="WH-1",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-5",
            )

        self.assertEqual(len(created), 3)
        by_item = {row["component_item"]: row["qty"] for row in created}
        self.assertNotIn("SUB_PATTY", by_item)
        self.assertEqual(by_item["BUN"], 2)
        self.assertAlmostEqual(by_item["MEAT"], 0.2)
        self.assertAlmostEqual(by_item["BREADING"], 0.04)
        self.assertEqual(result["reservation_group"], "GRP3")


class TestReleaseFulfilCancel(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _rows(self, status):
        return [
            frappe._dict({"name": "RES-1", "status": status, "reservation_group": "GRP9"}),
        ]

    def test_release_restores_capacity_for_subsequent_reservation(self):
        """Releasing a Reserved row transitions it to Released.

        Capacity restoration is verified indirectly: after release, a
        subsequent `_active_reservation_qty` sum (used by
        `get_available_capacity`) would only include rows with status in
        (Reserved, Fulfilled) -- a Released row is excluded by construction
        of that filter, so no separate Bin mutation is needed or performed.
        """
        loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
        loaded_doc.save = MagicMock()

        def get_doc_dispatch(*args, **kwargs):
            return loaded_doc

        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=self._rows(RESERVED)
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session:
            mock_session.user = "tester@example.com"
            release_reservation("RES-1", reason="order cancelled before production")

        self.assertEqual(loaded_doc.status, RELEASED)
        loaded_doc.save.assert_called_once()

    def test_cancel_on_reserved_succeeds(self):
        loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
        loaded_doc.save = MagicMock()

        def get_doc_dispatch(*args, **kwargs):
            return loaded_doc

        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=self._rows(RESERVED)
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session:
            mock_session.user = "tester@example.com"
            cancel_reservation("RES-1", reason="customer cancelled")

        self.assertEqual(loaded_doc.status, CANCELLED)

    def test_cancel_on_fulfilled_is_rejected(self):
        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=self._rows(FULFILLED)
        ):
            with self.assertRaises(frappe.ValidationError):
                cancel_reservation("RES-1", reason="attempted post-production cancel")

    def test_fulfil_reserved_succeeds(self):
        loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
        loaded_doc.save = MagicMock()

        def get_doc_dispatch(*args, **kwargs):
            return loaded_doc

        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=self._rows(RESERVED)
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session:
            mock_session.user = "tester@example.com"
            fulfil_reservation("RES-1")

        self.assertEqual(loaded_doc.status, FULFILLED)


class TestConcurrency(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_two_terminal_concurrent_reservation(self):
        """Two concurrent callers race to reserve the last unit; exactly one must succeed.

        NOT EXECUTED -- requires a live Frappe test site/DB. This test is
        written to demonstrate the shape of a real concurrency proof (two
        threads, each with its own DB connection/transaction, both calling
        `create_reservation` for the same item/warehouse where only one
        unit of capacity exists) and is skipped in this environment because
        no bench/DB is available. Do not remove the skip without running
        this against a real Frappe test site with `bench run-tests` (or
        equivalent), since a mocked `frappe.db.sql`/`FOR UPDATE` cannot
        demonstrate real row-lock serialization -- mocks execute
        sequentially in a single thread/process and would trivially "pass"
        regardless of whether the locking strategy actually serializes
        concurrent transactions at the DB level.
        """
        self.skipTest(
            "NOT EXECUTED: requires a live Frappe test site/DB to prove real "
            "FOR UPDATE row-lock serialization across two threads/connections; "
            "not available in this environment. See docstring for the intended "
            "shape of this test."
        )

        # Intended shape (for the future bench-backed run):
        #
        # import threading
        # results = []
        # def attempt():
        #     try:
        #         results.append(("ok", create_reservation(
        #             item_code="ITEM-LAST-UNIT", qty=1, warehouse="WH-1",
        #             branch="Branch A", company="Company A",
        #             order_ref=f"ORDER-{threading.get_ident()}",
        #         )))
        #     except frappe.ValidationError as exc:
        #         results.append(("rejected", str(exc)))
        #
        # threads = [threading.Thread(target=attempt) for _ in range(2)]
        # for t in threads:
        #     t.start()
        # for t in threads:
        #     t.join()
        #
        # succeeded = [r for r in results if r[0] == "ok"]
        # rejected = [r for r in results if r[0] == "rejected"]
        # self.assertEqual(len(succeeded), 1)
        # self.assertEqual(len(rejected), 1)
