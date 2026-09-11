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

from contextlib import contextmanager

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
    _active_reservation_qty,
)


MODULE = "ury.ury.api.ury_reservation_service"
BOM_MODULE = "ury.ury.api.ury_bom_compiler"

RESERVATION_DOCTYPE = "URY Stock Reservation"


def patch_read_committed_reservation_rows(test_case):
    """Keep `create_reservation` tests hermetic after the oversell fix.

    `create_reservation`'s capacity check reads the active-reservation sum on
    a short-lived SECOND database connection
    (`_read_committed_reservation_rows`), so that it sees latest-committed
    data instead of its own transaction's stale REPEATABLE READ view -- see
    that function's docstring for why this is required and why a locking read
    or a commit could not be used instead.

    That real connection would bypass these tests' `frappe.get_all` mocks
    entirely and quietly hit the live database, so every test that calls
    `create_reservation` would silently stop controlling the
    reservation-sum input (it would just read an empty real table and appear
    to pass). This redirects the fresh-connection read back through the
    module's `frappe.get_all`, which each test already mocks, so the mocked
    reservation rows keep driving the capacity arithmetic exactly as before.

    Note this makes the unit tests exercise the *arithmetic*, not the
    isolation behaviour: no single-process test can prove cross-connection
    read consistency. That is proven only by the live multi-process bench run
    documented in the module docstring -- which is precisely why the original
    oversell bug survived a green unit suite.
    """

    def fake_reconciled(conn, item_code, warehouse, company):
        return frappe.get_all(
            RESERVATION_DOCTYPE,
            filters={
                "component_item": item_code,
                "warehouse": warehouse,
                "company": company,
                "status": ["in", [RESERVED]],
            },
            fields=["name", "qty", "reservation_group"],
        )

    @contextmanager
    def fake_connection():
        yield None

    for target, kwargs in (
        (f"{MODULE}._reconciled_active_rows", {"side_effect": fake_reconciled}),
        (f"{MODULE}.committed_read_connection", {"side_effect": fake_connection}),
    ):
        patcher = patch(target, **kwargs)
        patcher.start()
        test_case.addCleanup(patcher.stop)


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
        patch_read_committed_reservation_rows(self)
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
        patch_read_committed_reservation_rows(self)
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


class TestCreateReservationProductionPolicy(FrappeTestCase):
    """Regression coverage: `production_policy` (not "has an active BOM")
    must decide whether create_reservation checks FG stock directly or
    explodes the BOM into raw components -- see `_resolve_components`.
    """

    def setUp(self):
        patch_read_committed_reservation_rows(self)
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_pre_produced_item_with_active_bom_reserves_own_fg_stock_not_components(self):
        """PRNPM-style item: PRE_PRODUCED, has an active default BOM (documents
        the recipe), but must reserve/check its OWN finished-goods stock, not
        explode into raw ingredients. If this regresses to the has-BOM
        heuristic, the reservation would instead check MZRCHSE/ORGNO-style
        raw component Bin rows and raise a raw-ingredient shortfall error.
        """
        get_doc_side_effect, created = _new_doc_recorder()

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if doctype == "BOM":
                # A real active default BOM exists for this item -- proving
                # its mere presence must NOT trigger component explosion
                # once production_policy is PRE_PRODUCED.
                if isinstance(filters, dict) and "item" in filters:
                    return "BOM-PRNPM"
            return None

        def sql_side_effect(query, params, **kwargs):
            self.assertEqual(params["item_code"], "PRNPM")
            return [{"name": "BIN-PRNPM", "actual_qty": 20, "projected_qty": 20}]

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
        ), patch(
            f"{MODULE}.frappe.db.get_value", side_effect=get_value_side_effect
        ), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ), patch(
            f"{MODULE}.frappe.generate_hash", return_value="GRP-PRNPM"
        ), patch(
            f"{MODULE}.compile_bom_vector"
        ) as mock_compile:
            result = create_reservation(
                item_code="PRNPM",
                qty=5,
                warehouse="WH-FG",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-PRNPM",
                policy="PRE_PRODUCED",
            )

        mock_compile.assert_not_called()
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["component_item"], "PRNPM")
        self.assertEqual(created[0]["qty"], 5)
        self.assertEqual(result["reservation_group"], "GRP-PRNPM")

    def test_direct_retail_item_with_active_bom_reserves_own_fg_stock(self):
        """Same guard as PRE_PRODUCED, for DIRECT_RETAIL."""
        get_doc_side_effect, created = _new_doc_recorder()

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if doctype == "BOM" and isinstance(filters, dict) and "item" in filters:
                return "BOM-RETAIL-ITEM"
            return None

        def sql_side_effect(query, params, **kwargs):
            return [{"name": "BIN-1", "actual_qty": 20, "projected_qty": 20}]

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
        ), patch(
            f"{MODULE}.frappe.db.get_value", side_effect=get_value_side_effect
        ), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ), patch(
            f"{MODULE}.frappe.generate_hash", return_value="GRP-RETAIL"
        ), patch(
            f"{MODULE}.compile_bom_vector"
        ) as mock_compile:
            result = create_reservation(
                item_code="RETAIL-ITEM",
                qty=2,
                warehouse="WH-FG",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-RETAIL",
                policy="DIRECT_RETAIL",
            )

        mock_compile.assert_not_called()
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["component_item"], "RETAIL-ITEM")
        self.assertEqual(result["reservation_group"], "GRP-RETAIL")

    def test_made_to_order_item_still_reserves_bom_components(self):
        """Regression guard: MADE_TO_ORDER items keep exploding into BOM
        components exactly as before, when production_policy is passed
        explicitly."""
        get_doc_side_effect, created = _new_doc_recorder()

        def sql_side_effect(query, params, **kwargs):
            item_code = params["item_code"]
            bin_qty = {"FLOUR": 10, "SUGAR": 10}[item_code]
            return [{"name": f"BIN-{item_code}", "actual_qty": bin_qty, "projected_qty": bin_qty}]

        def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
            return []

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
        ), patch(
            f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ), patch(
            f"{MODULE}.frappe.generate_hash", return_value="GRP-MTO"
        ), patch(
            f"{MODULE}.compile_bom_vector",
            return_value={
                "item_code": "MENU-A",
                "components": [
                    {"component_item": "FLOUR", "qty": 6, "qty_per_unit": 2},
                    {"component_item": "SUGAR", "qty": 3, "qty_per_unit": 1},
                ],
            },
        ) as mock_compile:
            result = create_reservation(
                item_code="MENU-A",
                qty=3,
                warehouse="WH-1",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-MTO",
                policy="MADE_TO_ORDER",
            )

        mock_compile.assert_called_once()
        self.assertEqual(len(created), 2)
        by_item = {row["component_item"]: row["qty"] for row in created}
        self.assertEqual(by_item["FLOUR"], 6)
        self.assertEqual(by_item["SUGAR"], 3)
        self.assertEqual(result["reservation_group"], "GRP-MTO")

    def test_no_production_policy_falls_back_to_legacy_has_bom_heuristic(self):
        """Backward compatibility: a caller that supplies no production_policy
        (e.g. not yet updated, or item genuinely unconfigured) keeps the
        pre-existing has-active-BOM => composite-reservation behaviour."""
        get_doc_side_effect, created = _new_doc_recorder()

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if doctype == "BOM" and isinstance(filters, dict) and "item" in filters:
                return "BOM-MENU-A"
            return None

        def sql_side_effect(query, params, **kwargs):
            item_code = params["item_code"]
            bin_qty = {"FLOUR": 10, "SUGAR": 10}[item_code]
            return [{"name": f"BIN-{item_code}", "actual_qty": bin_qty, "projected_qty": bin_qty}]

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
        ), patch(
            f"{MODULE}.frappe.db.get_value", side_effect=get_value_side_effect
        ), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
        ), patch(
            f"{MODULE}.frappe.generate_hash", return_value="GRP-LEGACY"
        ), patch(
            f"{MODULE}.compile_bom_vector",
            return_value={
                "item_code": "MENU-A",
                "components": [
                    {"component_item": "FLOUR", "qty": 6, "qty_per_unit": 2},
                    {"component_item": "SUGAR", "qty": 3, "qty_per_unit": 1},
                ],
            },
        ) as mock_compile:
            result = create_reservation(
                item_code="MENU-A",
                qty=3,
                warehouse="WH-1",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-LEGACY",
            )

        mock_compile.assert_called_once()
        self.assertEqual(len(created), 2)
        self.assertEqual(result["reservation_group"], "GRP-LEGACY")


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
            frappe._dict({"name": "RES-1", "status": status, "reservation_group": "GRP9", "audit_log": None}),
        ]

    def _sql_side_effect(self, rows):
        """Mock for `_resolve_group_rows`'s two locking `frappe.db.sql` reads.

        `_resolve_group_rows` now does a `SELECT ... FOR UPDATE` for the
        single-docname -> reservation_group lookup, then another for the
        full group's rows, instead of `frappe.db.get_value`/`frappe.get_all`.
        This mirrors `rows` (as `self._rows(...)` would supply) back through
        both shapes so the existing get_all-based fixtures still apply.
        """
        def _sql(query, values=None, as_dict=False, **kwargs):
            if values and "name" in values:
                for row in rows:
                    if row.get("name") == values["name"]:
                        return [frappe._dict({"reservation_group": row.get("reservation_group")})]
                return []
            if values and "group" in values:
                return [
                    frappe._dict(dict(row))
                    for row in rows
                    if row.get("reservation_group") == values["group"]
                ]
            return []
        return _sql

    def test_fulfilled_rows_are_not_counted_as_reserved_capacity(self):
        with patch(f"{MODULE}.frappe.get_all", return_value=[]) as get_all:
            result = _active_reservation_qty("ITEM-1", "WH-1", "Company")
        self.assertEqual(result, 0)
        self.assertEqual(get_all.call_args.kwargs["filters"]["status"], ["in", [RESERVED]])

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

        rows = self._rows(RESERVED)
        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ), patch(f"{MODULE}.frappe.db.sql", side_effect=self._sql_side_effect(rows)), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(
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

        rows = self._rows(RESERVED)
        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ), patch(f"{MODULE}.frappe.db.sql", side_effect=self._sql_side_effect(rows)), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session:
            mock_session.user = "tester@example.com"
            cancel_reservation("RES-1", reason="customer cancelled")

        self.assertEqual(loaded_doc.status, CANCELLED)

    def test_cancel_on_fulfilled_is_rejected(self):
        rows = self._rows(FULFILLED)
        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ), patch(f"{MODULE}.frappe.db.sql", side_effect=self._sql_side_effect(rows)):
            with self.assertRaises(frappe.ValidationError):
                cancel_reservation("RES-1", reason="attempted post-production cancel")

    def test_fulfil_reserved_succeeds(self):
        loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
        loaded_doc.save = MagicMock()

        def get_doc_dispatch(*args, **kwargs):
            return loaded_doc

        rows = self._rows(RESERVED)
        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ), patch(f"{MODULE}.frappe.db.sql", side_effect=self._sql_side_effect(rows)), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session:
            mock_session.user = "tester@example.com"
            fulfil_reservation("RES-1")

        self.assertEqual(loaded_doc.status, FULFILLED)


class TestSalesPlanCommitWiring(FrappeTestCase):
    """Sales Plan committed_qty/fulfilled_qty maintenance wired into
    create_reservation (increment) and _transition_group (decrement on
    release/cancel/expire, decrement+increment-fulfilled on fulfil)."""

    def setUp(self):
        patch_read_committed_reservation_rows(self)
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_create_reservation_increments_committed_qty_for_matched_plan_item(self):
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
        ), patch(
            f"{MODULE}.apply_commit_delta",
            return_value={"name": "PLI-1", "committed_qty": 4, "fulfilled_qty": 0},
        ) as mock_apply:
            create_reservation(
                item_code="ITEM-SIMPLE",
                qty=4,
                warehouse="WH-1",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-1",
                frozen_context={"department": "Hot Line"},
            )

        mock_apply.assert_called_once_with(
            "ITEM-SIMPLE", "Branch A", "Company A", department="Hot Line", committed_delta=4
        )
        # The applied commit is recorded on the created row's audit_log so
        # release/fulfil can symmetrically reverse it later.
        audit = json.loads(created[0]["audit_log"])
        commit_info = audit[0]["frozen_context"]["sales_plan_commit"]
        self.assertTrue(commit_info["applied"])
        self.assertEqual(commit_info["qty"], 4)
        self.assertEqual(commit_info["plan_item"], "PLI-1")

    def test_create_reservation_with_no_plan_match_records_not_applied(self):
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
        ), patch(
            f"{MODULE}.apply_commit_delta", return_value=None
        ):
            create_reservation(
                item_code="ITEM-SIMPLE",
                qty=4,
                warehouse="WH-1",
                branch="Branch A",
                company="Company A",
                order_ref="ORDER-1",
            )

        audit = json.loads(created[0]["audit_log"])
        commit_info = audit[0]["frozen_context"]["sales_plan_commit"]
        self.assertFalse(commit_info["applied"])
        self.assertIsNone(commit_info["plan_item"])

    def _rows_with_commit(self, status, qty=4):
        audit_log = json.dumps(
            [
                {
                    "event": "create",
                    "frozen_context": {
                        "sales_plan_commit": {
                            "applied": True,
                            "item_code": "ITEM-SIMPLE",
                            "branch": "Branch A",
                            "company": "Company A",
                            "department": "Hot Line",
                            "qty": qty,
                            "plan_item": "PLI-1",
                        }
                    },
                }
            ]
        )
        return [
            frappe._dict(
                {"name": "RES-1", "status": status, "reservation_group": "GRP9", "audit_log": audit_log}
            )
        ]

    def _sql_side_effect(self, rows):
        def _sql(query, values=None, as_dict=False, **kwargs):
            if values and "name" in values:
                for row in rows:
                    if row.get("name") == values["name"]:
                        return [frappe._dict({"reservation_group": row.get("reservation_group")})]
                return []
            if values and "group" in values:
                return [frappe._dict(dict(row)) for row in rows if row.get("reservation_group") == values["group"]]
            return []

        return _sql

    def test_release_decrements_committed_qty_by_recorded_amount(self):
        loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
        loaded_doc.save = MagicMock()
        rows = self._rows_with_commit(RESERVED, qty=4)

        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ), patch(f"{MODULE}.frappe.db.sql", side_effect=self._sql_side_effect(rows)), patch(
            f"{MODULE}.frappe.get_doc", side_effect=lambda *a, **k: loaded_doc
        ), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session, patch(
            f"{MODULE}.apply_commit_delta"
        ) as mock_apply:
            mock_session.user = "tester@example.com"
            release_reservation("RES-1", reason="order cancelled before production")

        mock_apply.assert_called_once_with(
            "ITEM-SIMPLE",
            "Branch A",
            "Company A",
            department="Hot Line",
            committed_delta=-4,
            fulfilled_delta=0,
        )

    def test_fulfil_moves_qty_from_committed_to_fulfilled_in_one_call(self):
        loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
        loaded_doc.save = MagicMock()
        rows = self._rows_with_commit(RESERVED, qty=6)

        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ), patch(f"{MODULE}.frappe.db.sql", side_effect=self._sql_side_effect(rows)), patch(
            f"{MODULE}.frappe.get_doc", side_effect=lambda *a, **k: loaded_doc
        ), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session, patch(
            f"{MODULE}.apply_commit_delta"
        ) as mock_apply:
            mock_session.user = "tester@example.com"
            fulfil_reservation("RES-1")

        mock_apply.assert_called_once_with(
            "ITEM-SIMPLE",
            "Branch A",
            "Company A",
            department="Hot Line",
            committed_delta=-6,
            fulfilled_delta=6,
        )

    def test_no_commit_recorded_means_no_counter_call(self):
        """A group whose create predates this feature (no sales_plan_commit in
        its audit_log) must not touch the counter helper at all."""
        loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
        loaded_doc.save = MagicMock()
        rows = [
            frappe._dict({"name": "RES-1", "status": RESERVED, "reservation_group": "GRP9", "audit_log": None})
        ]

        with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ), patch(f"{MODULE}.frappe.db.sql", side_effect=self._sql_side_effect(rows)), patch(
            f"{MODULE}.frappe.get_doc", side_effect=lambda *a, **k: loaded_doc
        ), patch(
            f"{MODULE}.frappe.session"
        ) as mock_session, patch(
            f"{MODULE}.apply_commit_delta"
        ) as mock_apply:
            mock_session.user = "tester@example.com"
            release_reservation("RES-1")

        mock_apply.assert_not_called()


class TestRealtimeEventEmission(FrappeTestCase):
	"""Tests for realtime event emissions on reservation create/release."""

	def setUp(self):
		patch_read_committed_reservation_rows(self)
		# append_audit() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_create_reservation_emits_realtime_event_per_component(self):
		"""create_reservation() emits one ury_component_stock_changed event per component_item."""
		get_doc_side_effect, created = _new_doc_recorder()

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
			f"{MODULE}.frappe.db.get_value", return_value=None
		), patch(
			f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.generate_hash", return_value="GRP-REALTIME"
		), patch(
			f"{MODULE}.frappe.publish_realtime"
		) as mock_publish:
			create_reservation(
				item_code="MENU-A",
				qty=3,
				warehouse="WH-1",
				branch="Branch A",
				company="Company A",
				order_ref="ORDER-REALTIME",
			)

		# Should emit one event per component (FLOUR, SUGAR)
		self.assertEqual(mock_publish.call_count, 2)

		# Verify the events have the expected channel and payload
		calls = mock_publish.call_args_list
		channels = [call[0][0] for call in calls]
		self.assertEqual(channels, ["ury_component_stock_changed", "ury_component_stock_changed"])

		payloads = [call[0][1] for call in calls]
		# Components are sorted by item_code, so FLOUR before SUGAR
		self.assertEqual(payloads[0]["component_item"], "FLOUR")
		self.assertEqual(payloads[0]["warehouse"], "WH-1")
		self.assertEqual(payloads[0]["company"], "Company A")

		self.assertEqual(payloads[1]["component_item"], "SUGAR")
		self.assertEqual(payloads[1]["warehouse"], "WH-1")
		self.assertEqual(payloads[1]["company"], "Company A")

	def test_create_reservation_emits_single_event_for_simple_item(self):
		"""create_reservation() emits one event for a simple (non-composite) item."""
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
			f"{MODULE}.frappe.db.sql",
			return_value=[{"name": "BIN-1", "actual_qty": 10, "projected_qty": 10}],
		), patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.generate_hash", return_value="GRP-SIMPLE"
		), patch(
			f"{MODULE}.frappe.publish_realtime"
		) as mock_publish:
			create_reservation(
				item_code="ITEM-SIMPLE",
				qty=4,
				warehouse="WH-1",
				branch="Branch A",
				company="Company A",
				order_ref="ORDER-SIMPLE",
			)

		# Should emit one event for the item itself
		mock_publish.assert_called_once()
		call_args = mock_publish.call_args
		self.assertEqual(call_args[0][0], "ury_component_stock_changed")
		self.assertEqual(call_args[0][1]["component_item"], "ITEM-SIMPLE")
		self.assertEqual(call_args[0][1]["warehouse"], "WH-1")
		self.assertEqual(call_args[0][1]["company"], "Company A")

	def test_release_reservation_emits_realtime_events(self):
		"""release_reservation() emits one ury_component_stock_changed event per component_item."""
		loaded_doc = frappe._dict({"name": "RES-1", "status": RESERVED, "audit_log": None})
		loaded_doc.save = MagicMock()

		def get_doc_dispatch(*args, **kwargs):
			return loaded_doc

		def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
			if doctype == "URY Stock Reservation" and "status" in filters and filters["status"] == RELEASED:
				# Return rows that were just transitioned to RELEASED
				return []
			elif doctype == "URY Stock Reservation" and "name" in filters:
				# Return the row data for the released reservation
				return [
					frappe._dict({
						"name": "RES-1",
						"component_item": "COMPONENT-A",
						"warehouse": "WH-1",
						"company": "Company A",
					}),
				]
			elif doctype == "URY Stock Reservation" and "reservation_group" in filters:
				# Initial group lookup
				return [frappe._dict({"name": "RES-1", "status": RESERVED, "reservation_group": "GRP-RELEASE"})]
			return []

		def sql_side_effect(query, values=None, as_dict=False, **kwargs):
			if values and "name" in values:
				return [frappe._dict({"reservation_group": "GRP-RELEASE"})]
			if values and "group" in values:
				return [frappe._dict({"name": "RES-1", "status": RESERVED, "reservation_group": "GRP-RELEASE", "audit_log": None})]
			return []

		with patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
			f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect
		), patch(
			f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session, patch(
			f"{MODULE}.frappe.publish_realtime"
		) as mock_publish:
			mock_session.user = "tester@example.com"
			release_reservation("RES-1", reason="order cancelled")

		# Should emit one event for the released component
		mock_publish.assert_called_once()
		call_args = mock_publish.call_args
		self.assertEqual(call_args[0][0], "ury_component_stock_changed")
		self.assertEqual(call_args[0][1]["component_item"], "COMPONENT-A")
		self.assertEqual(call_args[0][1]["warehouse"], "WH-1")
		self.assertEqual(call_args[0][1]["company"], "Company A")

	def test_publish_realtime_failure_does_not_abort_reservation(self):
		"""If frappe.publish_realtime raises, the reservation is still created and not rolled back."""
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
			f"{MODULE}.frappe.db.sql",
			return_value=[{"name": "BIN-1", "actual_qty": 10, "projected_qty": 10}],
		), patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.generate_hash", return_value="GRP-FAIL"
		), patch(
			f"{MODULE}.frappe.publish_realtime", side_effect=Exception("socketio down")
		):
			# Should not raise, even though publish_realtime failed
			result = create_reservation(
				item_code="ITEM-TEST",
				qty=1,
				warehouse="WH-1",
				branch="Branch A",
				company="Company A",
				order_ref="ORDER-FAIL",
			)

		# Reservation should still be created
		self.assertEqual(result["reservation_group"], "GRP-FAIL")
		self.assertEqual(len(created), 1)

	def test_create_reservation_emits_rich_fanout_event_with_affected_items(self):
		"""H1: create_reservation() for a MADE_TO_ORDER item with a shared
		component also publishes a richer `menu_availability_update_{branch}`
		event per component, carrying the items resolved by
		`get_items_affected_by_component` (mocked here to a known list),
		alongside the unchanged cheap `ury_component_stock_changed` event."""
		get_doc_side_effect, created = _new_doc_recorder()

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

		affected_by_component = {
			"FLOUR": [{"top_level_item": "MENU-A", "qty_per_unit": 2, "stock_uom": "Kg"}],
			"SUGAR": [{"top_level_item": "MENU-A", "qty_per_unit": 1, "stock_uom": "Kg"}],
		}

		def get_items_affected_side_effect(component_item, branch, company):
			return affected_by_component.get(component_item, [])

		with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
			f"{MODULE}.frappe.db.sql", side_effect=sql_side_effect
		), patch(
			f"{MODULE}.frappe.db.get_value", return_value=None
		), patch(
			f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.generate_hash", return_value="GRP-FANOUT"
		), patch(
			f"{BOM_MODULE}.get_items_affected_by_component", side_effect=get_items_affected_side_effect
		), patch(
			f"{MODULE}.frappe.publish_realtime"
		) as mock_publish:
			create_reservation(
				item_code="MENU-A",
				qty=3,
				warehouse="WH-1",
				branch="Branch A",
				company="Company A",
				order_ref="ORDER-FANOUT",
			)

		calls = mock_publish.call_args_list
		# Two components -> two cheap events + two rich fan-out events.
		self.assertEqual(len(calls), 4)

		cheap_calls = [c for c in calls if c[0][0] == "ury_component_stock_changed"]
		rich_calls = [c for c in calls if c[0][0] == "menu_availability_update_Branch A"]
		self.assertEqual(len(cheap_calls), 2)
		self.assertEqual(len(rich_calls), 2)

		rich_payloads = {c[0][1]["component_item"]: c[0][1] for c in rich_calls}
		self.assertEqual(rich_payloads["FLOUR"]["affected_items"], ["MENU-A"])
		self.assertEqual(rich_payloads["FLOUR"]["branch"], "Branch A")
		self.assertEqual(rich_payloads["SUGAR"]["affected_items"], ["MENU-A"])

	def test_create_reservation_fanout_lookup_failure_does_not_abort_or_raise(self):
		"""H1 defensive requirement: if `get_items_affected_by_component`
		raises, create_reservation() still completes normally (the reservation
		is created, no exception propagates), and the cheap
		`ury_component_stock_changed` event still fires independently -- a
		fan-out failure must never be a single point of failure."""
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
			f"{MODULE}.frappe.db.sql",
			return_value=[{"name": "BIN-1", "actual_qty": 10, "projected_qty": 10}],
		), patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.generate_hash", return_value="GRP-FANOUT-FAIL"
		), patch(
			f"{BOM_MODULE}.get_items_affected_by_component", side_effect=Exception("bom index unavailable")
		), patch(
			f"{MODULE}.frappe.publish_realtime"
		) as mock_publish:
			# Should not raise, even though the fan-out lookup failed.
			result = create_reservation(
				item_code="ITEM-TEST",
				qty=1,
				warehouse="WH-1",
				branch="Branch A",
				company="Company A",
				order_ref="ORDER-FANOUT-FAIL",
			)

		# Reservation should still be created despite the fan-out failure.
		self.assertEqual(result["reservation_group"], "GRP-FANOUT-FAIL")
		self.assertEqual(len(created), 1)

		# The cheap event still fired independently of the failed fan-out.
		mock_publish.assert_called_once()
		self.assertEqual(mock_publish.call_args[0][0], "ury_component_stock_changed")


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


class TestReconciledActiveRows(FrappeTestCase):
	"""Unit coverage for the two-view reconciliation behind `read_committed=True`.

	These are the cases the four prior review gates had no test for, and are
	exactly where the F1 (own uncommitted INSERT invisible => oversell) and F2
	(own uncommitted RELEASE invisible => spurious rejection) regressions lived.
	A single-process test cannot prove cross-connection isolation -- that is
	what the live bench run proves -- but it can pin the reconciliation rule
	itself, which is the part that is easy to "simplify" back into a bug.
	"""

	def _run(self, own_active, committed_active, exists_committed, exists_own):
		from ury.ury.api.ury_reservation_service import (
			_RESERVATION_EXISTS_SQL,
			_reconciled_active_rows,
		)

		conn = MagicMock()

		def conn_sql(query, params, **kwargs):
			if query is _RESERVATION_EXISTS_SQL:
				return [{"name": n} for n in params["names"] if n in exists_committed]
			return committed_active

		conn.sql.side_effect = conn_sql

		def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
			if fields == ["name"]:
				names = filters["name"][1]
				return [{"name": n} for n in names if n in exists_own]
			return own_active

		with patch(f"{MODULE}.frappe.get_all", side_effect=get_all_side_effect):
			rows = _reconciled_active_rows(conn, "FLOUR", "WH-1", "Company A")
		return sorted(row["name"] for row in rows), sum(row["qty"] for row in rows)

	def test_active_in_both_views_is_counted(self):
		row = {"name": "R1", "qty": 3, "reservation_group": "G1"}
		names, total = self._run([row], [row], {"R1"}, {"R1"})
		self.assertEqual((names, total), (["R1"], 3))

	def test_own_uncommitted_insert_is_counted(self):
		"""F1: the row exists only in our transaction, so the fresh connection
		cannot see it -- but it is real and must count against capacity."""
		row = {"name": "R2", "qty": 5, "reservation_group": "G2"}
		names, total = self._run([row], [], exists_committed=set(), exists_own={"R2"})
		self.assertEqual((names, total), (["R2"], 5))

	def test_release_committed_by_someone_else_is_not_counted(self):
		"""Same shape as the case above (active for us, not in the committed
		active set) but the row DOES exist on the other connection, i.e. it was
		released and committed after our snapshot was pinned. Must not count."""
		row = {"name": "R3", "qty": 7, "reservation_group": "G3"}
		names, total = self._run([row], [], exists_committed={"R3"}, exists_own={"R3"})
		self.assertEqual((names, total), ([], 0))

	def test_insert_committed_by_someone_else_is_counted(self):
		"""The concurrent-oversell case c5e73d299 fixed: committed after our
		snapshot, so absent from our view entirely. Must still count."""
		row = {"name": "R4", "qty": 2, "reservation_group": "G4"}
		names, total = self._run([], [row], exists_committed={"R4"}, exists_own=set())
		self.assertEqual((names, total), (["R4"], 2))

	def test_own_uncommitted_release_is_not_counted(self):
		"""F2: we released it in this transaction, so it still reads as
		Reserved on the fresh connection. It must not be counted against its
		own replacement."""
		row = {"name": "R5", "qty": 49.8, "reservation_group": "G5"}
		names, total = self._run([], [row], exists_committed={"R5"}, exists_own={"R5"})
		self.assertEqual((names, total), ([], 0))

	def test_all_five_cases_together(self):
		own = [
			{"name": "R1", "qty": 3, "reservation_group": "G1"},
			{"name": "R2", "qty": 5, "reservation_group": "G2"},
			{"name": "R3", "qty": 7, "reservation_group": "G3"},
		]
		committed = [
			{"name": "R1", "qty": 3, "reservation_group": "G1"},
			{"name": "R4", "qty": 2, "reservation_group": "G4"},
			{"name": "R5", "qty": 49.8, "reservation_group": "G5"},
		]
		names, total = self._run(
			own, committed, exists_committed={"R1", "R3", "R4", "R5"}, exists_own={"R1", "R2", "R3", "R5"}
		)
		self.assertEqual(names, ["R1", "R2", "R4"])
		self.assertEqual(total, 10)
