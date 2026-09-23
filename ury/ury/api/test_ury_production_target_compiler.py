"""Unit tests for the production target compiler (Agent 2).

No live bench/Frappe site is available in this worktree, so `walk_bom_tree`,
`resolve_production_context` and the handful of `frappe.get_all` /
`frappe.db.get_value` calls this module makes are all faked from small,
explicit in-test catalogs -- following the same mocking convention as
`test_ury_bom_tree.py`. `frappe` itself is imported for real (it provides
`frappe.ValidationError`, `frappe._dict` and `frappe.throw` without a live
site, exactly as `test_ury_bom_tree.py` already relies on).
"""

import json
import unittest
from unittest import mock

import frappe

from ury.ury.api.ury_production_target_compiler import compile_production_targets


MOD = "ury.ury.api.ury_production_target_compiler"
CONFIG_DOCTYPE = "URY Item Production Configuration"
DEPARTMENT_DOCTYPE = "URY Production Department"


def _config(item, branch="Branch A", department="Main Kitchen", production_unit="Main Kitchen Unit",
            production_policy="PRE_PRODUCED", bom=None, warehouse=None, sourcing_mode="IN_HOUSE",
            ambiguous=False):
    return {
        "item": item,
        "branch": branch,
        "department": department,
        "production_unit": production_unit,
        "production_policy": production_policy,
        "bom": bom,
        "warehouse": warehouse,
        "sourcing_mode": sourcing_mode,
        "ambiguous": ambiguous,
    }


def _bom_row(item_code, qty, uom="Kg", bom_no=None):
    return {"item_code": item_code, "qty": qty, "uom": uom, "bom_no": bom_no}


def _row(item_code, qty, department=None, production_unit=None, production_policy="PRE_PRODUCED",
         bom=None, stock_uom="Kg", bom_revision=1):
    return {
        "item_code": item_code,
        "qty": qty,
        "stock_uom": stock_uom,
        "department": department,
        "production_unit": production_unit,
        "production_policy": production_policy,
        "bom": bom,
        "bom_revision": bom_revision,
    }


def _snapshot(items, branch="Branch A", company="Co"):
    return {"branch": branch, "company": company, "items": items}


class _Fixture:
    """Fakes `walk_bom_tree`, `resolve_production_context` and the module's
    own `frappe.get_all`/`frappe.db.get_value` calls from plain-python
    catalogs, and runs `compile_production_targets` under `mock.patch` for
    the duration of `compile(...)`.
    """

    def __init__(self, configs=None, bom_catalog=None, root_items=None, department_warehouses=None):
        self.configs = configs or {}
        self.bom_catalog = bom_catalog or {}
        self.root_items = root_items or {}
        self.department_warehouses = department_warehouses or {}

    # -- fake walk_bom_tree ---------------------------------------------

    def _fake_walk_bom_tree(self, bom_no, required_qty, company=None):
        if bom_no not in self.bom_catalog:
            frappe.throw(f"BOM {bom_no} does not exist", frappe.ValidationError)
        root_item = self.root_items.get(bom_no, bom_no)
        return self._expand(bom_no, required_qty, root_item, 1, [root_item], {bom_no})

    def _expand(self, bom_no, qty, parent_item, level, path, visited):
        nodes = []
        for row in self.bom_catalog.get(bom_no, []):
            row_qty = row["qty"] * qty
            child_path = path + [row["item_code"]]
            nodes.append(
                {
                    "item_code": row["item_code"],
                    "bom_no": row.get("bom_no"),
                    "required_qty": row_qty,
                    "stock_uom": row.get("uom", "Kg"),
                    "parent_item": parent_item,
                    "level": level,
                    "path": child_path,
                    "has_bom": bool(row.get("bom_no")),
                }
            )
            child_bom = row.get("bom_no")
            if child_bom:
                if child_bom in visited:
                    frappe.throw(
                        f"Circular BOM reference detected at {child_bom} "
                        f"(path: {' -> '.join(child_path)})",
                        frappe.ValidationError,
                    )
                nodes.extend(
                    self._expand(
                        child_bom, row_qty, row["item_code"], level + 1, child_path, visited | {child_bom}
                    )
                )
        return nodes

    # -- fake resolve_production_context / frappe calls ------------------

    def _fake_resolve_production_context(self, item, branch, company=None, department=None):
        config = self.configs.get(item)
        if not config or config["branch"] != branch:
            return None
        if config.get("ambiguous"):
            # The real resolve_production_context can't distinguish "no
            # configuration" from "more than one active configuration" --
            # both return None. _resolve_context's own frappe.get_all probe
            # (faked below) is what surfaces the ambiguity.
            return None
        return frappe._dict({k: v for k, v in config.items() if k not in ("sourcing_mode", "ambiguous")})

    def _fake_get_all(self, doctype, filters=None, fields=None, limit=None, **kw):
        if doctype == CONFIG_DOCTYPE:
            item = (filters or {}).get("item")
            branch = (filters or {}).get("branch")
            config = self.configs.get(item)
            if not config or config["branch"] != branch:
                return []
            if config.get("ambiguous"):
                return [
                    {"name": f"CFG-{item}-1", "sourcing_mode": config.get("sourcing_mode", "IN_HOUSE")},
                    {"name": f"CFG-{item}-2", "sourcing_mode": config.get("sourcing_mode", "IN_HOUSE")},
                ][: limit or 3]
            return [{"name": f"CFG-{item}", "sourcing_mode": config.get("sourcing_mode", "IN_HOUSE")}]
        return []

    def _fake_get_value(self, doctype, name, fieldname):
        if doctype == DEPARTMENT_DOCTYPE:
            return self.department_warehouses.get(name)
        return None

    def compile(self, snapshot, branch="Branch A", company="Co"):
        with mock.patch(f"{MOD}.walk_bom_tree", side_effect=self._fake_walk_bom_tree), mock.patch(
            f"{MOD}.resolve_production_context", side_effect=self._fake_resolve_production_context
        ), mock.patch(f"{MOD}.frappe.get_all", side_effect=self._fake_get_all), mock.patch(
            f"{MOD}.frappe.db.get_value", side_effect=self._fake_get_value
        ):
            return compile_production_targets(snapshot, branch, company)


def _all_item_codes(departments, key="targets"):
    codes = set()
    for bucket in departments.values():
        codes.update(t["item_code"] for t in bucket[key])
    return codes


class MtoAssemblyTests(unittest.TestCase):
    def test_mto_row_is_its_own_target_and_pre_produced_assembly_is_a_separate_one(self):
        # CHICKEN-BIRYANI (MTO) is now a real target too -- skip_work_order
        # True, a real po_items row, its own (empty here) raw_material_vector
        # -- alongside BIRYANI-BASE, discovered and scaled exactly as before.
        fixture = _Fixture(
            configs={
                "BIRYANI-BASE": _config(
                    "BIRYANI-BASE", department="Main Kitchen", bom="BOM-BIRYANI-BASE",
                    warehouse="Main Kitchen - WH",
                ),
            },
            bom_catalog={
                "BOM-CHICKEN-BIRYANI": [_bom_row("BIRYANI-BASE", 0.2, bom_no="BOM-BIRYANI-BASE")],
                "BOM-BIRYANI-BASE": [_bom_row("Rice", 0.05), _bom_row("Masala", 0.01)],
            },
            root_items={"BOM-CHICKEN-BIRYANI": "CHICKEN-BIRYANI", "BOM-BIRYANI-BASE": "BIRYANI-BASE"},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot(
            [
                _row(
                    "CHICKEN-BIRYANI", 100, department="Main Kitchen", production_policy="MADE_TO_ORDER",
                    bom="BOM-CHICKEN-BIRYANI", stock_uom="Nos",
                )
            ]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        main = departments["Main Kitchen"]
        self.assertEqual(main["warehouse"], "Main Kitchen - WH")
        self.assertEqual(len(main["targets"]), 2)
        by_item = {t["item_code"]: t for t in main["targets"]}

        mto = by_item["CHICKEN-BIRYANI"]
        self.assertTrue(mto["skip_work_order"])
        self.assertEqual(mto["required_qty"], 100)
        # BIRYANI-BASE is a PRE_PRODUCED node in CHICKEN-BIRYANI's own BOM:
        # present in component_vector (D1, for a Work Order this row will
        # never get), excluded from raw_material_vector (it is its own
        # separate target, not something to purchase or transfer).
        self.assertEqual(
            {row["item_code"] for row in mto["component_vector"]}, {"BIRYANI-BASE"}
        )
        self.assertEqual(mto["raw_material_vector"], [])

        base = by_item["BIRYANI-BASE"]
        self.assertFalse(base["skip_work_order"])
        self.assertEqual(base["bom_no"], "BOM-BIRYANI-BASE")
        self.assertEqual(base["required_qty"], 20)
        cv = {row["item_code"]: row["required_qty"] for row in base["component_vector"]}
        self.assertEqual(cv["Rice"], 1.0)
        self.assertEqual(cv["Masala"], 0.2)
        # BIRYANI-BASE's own ingredients are true raw materials -- its
        # raw_material_vector matches its component_vector exactly.
        self.assertEqual(base["component_vector"], base["raw_material_vector"])

    def test_shared_assembly_demand_aggregated_once_within_department(self):
        fixture = _Fixture(
            configs={
                "BIRYANI-BASE": _config(
                    "BIRYANI-BASE", department="Main Kitchen", bom="BOM-BIRYANI-BASE",
                    warehouse="Main Kitchen - WH",
                ),
            },
            bom_catalog={
                "BOM-CHICKEN-BIRYANI": [_bom_row("BIRYANI-BASE", 0.2, bom_no="BOM-BIRYANI-BASE")],
                "BOM-VEG-BIRYANI": [_bom_row("BIRYANI-BASE", 0.1, bom_no="BOM-BIRYANI-BASE")],
                "BOM-BIRYANI-BASE": [_bom_row("Rice", 0.05)],
            },
            root_items={
                "BOM-CHICKEN-BIRYANI": "CHICKEN-BIRYANI",
                "BOM-VEG-BIRYANI": "VEG-BIRYANI",
                "BOM-BIRYANI-BASE": "BIRYANI-BASE",
            },
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot(
            [
                _row("CHICKEN-BIRYANI", 100, department="Main Kitchen", production_policy="MADE_TO_ORDER",
                     bom="BOM-CHICKEN-BIRYANI"),
                _row("VEG-BIRYANI", 50, department="Main Kitchen", production_policy="MADE_TO_ORDER",
                     bom="BOM-VEG-BIRYANI"),
            ]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        main = departments["Main Kitchen"]
        # CHICKEN-BIRYANI, VEG-BIRYANI (each skip_work_order) and the one
        # shared BIRYANI-BASE target its two MTO rows aggregate into.
        self.assertEqual(len(main["targets"]), 3)
        base = next(t for t in main["targets"] if t["item_code"] == "BIRYANI-BASE")
        self.assertEqual(base["required_qty"], 25)  # 100*0.2 + 50*0.1
        self.assertEqual(len(base["sources"]), 2)

    def test_other_branch_configuration_does_not_stop_traversal(self):
        # SEMI has an active configuration, but for a different branch -- it
        # must be treated as an unstocked intermediate (pass through), not
        # as a stop point, so DEEP-PP underneath it is still discovered.
        fixture = _Fixture(
            configs={
                "SEMI": _config("SEMI", branch="Branch B", department="Main Kitchen", bom="BOM-SEMI"),
                "DEEP-PP": _config(
                    "DEEP-PP", branch="Branch A", department="Main Kitchen", bom="BOM-DEEP-PP",
                    warehouse="Main Kitchen - WH",
                ),
            },
            bom_catalog={
                "BOM-ROOT": [_bom_row("SEMI", 1, bom_no="BOM-SEMI")],
                "BOM-SEMI": [_bom_row("DEEP-PP", 1, bom_no="BOM-DEEP-PP")],
                "BOM-DEEP-PP": [_bom_row("Flour", 0.5)],
            },
            root_items={"BOM-ROOT": "ROOT-MTO", "BOM-SEMI": "SEMI", "BOM-DEEP-PP": "DEEP-PP"},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot(
            [_row("ROOT-MTO", 10, department="Main Kitchen", production_policy="MADE_TO_ORDER", bom="BOM-ROOT")]
        )

        departments, blockers = fixture.compile(snapshot, branch="Branch A")

        self.assertEqual(blockers, [])
        self.assertNotIn("SEMI", _all_item_codes(departments))
        main = departments["Main Kitchen"]
        self.assertEqual({t["item_code"] for t in main["targets"]}, {"ROOT-MTO", "DEEP-PP"})
        target = next(t for t in main["targets"] if t["item_code"] == "DEEP-PP")
        self.assertEqual(target["required_qty"], 10)
        cv = {row["item_code"]: row["required_qty"] for row in target["component_vector"]}
        self.assertEqual(cv["Flour"], 5.0)

    def test_mto_item_with_no_pre_produced_stop_point_is_its_own_target(self):
        # ORANGE-JUICE is MADE_TO_ORDER and its BOM is pure raw materials --
        # no PRE_PRODUCED assembly anywhere. It is still a real target
        # (skip_work_order=True): a real po_items row so ERPNext's own
        # mandatory po_items constraint is satisfied, and its raw materials
        # reach readiness through raw_material_vector, not a separate
        # mechanism.
        fixture = _Fixture(
            configs={},
            bom_catalog={
                "BOM-ORANGE-JUICE": [_bom_row("Orange", 0.3), _bom_row("Sugar", 0.05)],
            },
            root_items={"BOM-ORANGE-JUICE": "ORANGE-JUICE"},
            department_warehouses={"Beverage": "Beverage - WH"},
        )
        snapshot = _snapshot(
            [
                _row(
                    "ORANGE-JUICE", 20, department="Beverage", production_policy="MADE_TO_ORDER",
                    bom="BOM-ORANGE-JUICE",
                )
            ]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        beverage = departments["Beverage"]
        self.assertEqual(len(beverage["targets"]), 1)
        self.assertEqual(beverage["external_receipt_targets"], [])
        self.assertEqual(beverage["warehouse"], "Beverage - WH")

        target = beverage["targets"][0]
        self.assertEqual(target["item_code"], "ORANGE-JUICE")
        self.assertTrue(target["skip_work_order"])
        self.assertEqual(target["required_qty"], 20)
        demand = {row["item_code"]: row["required_qty"] for row in target["raw_material_vector"]}
        self.assertEqual(demand["Orange"], 6.0)  # 20 * 0.3
        self.assertEqual(demand["Sugar"], 1.0)  # 20 * 0.05
        # No PRE_PRODUCED node touched this BOM, so nothing is filtered out.
        self.assertEqual(target["component_vector"], target["raw_material_vector"])

    def test_two_mto_rows_each_get_their_own_target_and_raw_material_vector(self):
        # ORANGE-JUICE and LEMONADE are both MADE_TO_ORDER, both in Beverage,
        # and both use Sugar. Each is its own target with its own
        # raw_material_vector -- the compiler does not merge demand across
        # different top-level rows; that summing is the READINESS engine's
        # job (see test_ury_production_readiness), one level up.
        fixture = _Fixture(
            configs={},
            bom_catalog={
                "BOM-ORANGE-JUICE": [_bom_row("Orange", 0.3), _bom_row("Sugar", 0.05)],
                "BOM-LEMONADE": [_bom_row("Lemon", 0.2), _bom_row("Sugar", 0.04)],
            },
            root_items={"BOM-ORANGE-JUICE": "ORANGE-JUICE", "BOM-LEMONADE": "LEMONADE"},
            department_warehouses={"Beverage": "Beverage - WH"},
        )
        snapshot = _snapshot(
            [
                _row("ORANGE-JUICE", 20, department="Beverage", production_policy="MADE_TO_ORDER",
                     bom="BOM-ORANGE-JUICE"),
                _row("LEMONADE", 10, department="Beverage", production_policy="MADE_TO_ORDER",
                     bom="BOM-LEMONADE"),
            ]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        by_item = {t["item_code"]: t for t in departments["Beverage"]["targets"]}
        self.assertEqual(set(by_item), {"ORANGE-JUICE", "LEMONADE"})

        oj_demand = {r["item_code"]: r["required_qty"] for r in by_item["ORANGE-JUICE"]["raw_material_vector"]}
        self.assertEqual(oj_demand, {"Orange": 6.0, "Sugar": 1.0})

        lem_demand = {r["item_code"]: r["required_qty"] for r in by_item["LEMONADE"]["raw_material_vector"]}
        self.assertEqual(lem_demand, {"Lemon": 2.0, "Sugar": 0.4})

    def test_mto_own_direct_retail_component_is_in_the_raw_material_vector(self):
        # A bottled, bought-in component of an MTO dish (e.g. a sauce) is
        # DIRECT_RETAIL, not a raw material leaf, but it must still surface
        # in raw_material_vector: it is bought, not manufactured, and is not
        # a PRE_PRODUCED node, so nothing filters it out.
        fixture = _Fixture(
            configs={
                "BOTTLED-SAUCE": _config(
                    "BOTTLED-SAUCE", department="Main Kitchen", production_policy="DIRECT_RETAIL",
                    warehouse="Retail - WH",
                ),
            },
            bom_catalog={"BOM-WRAP": [_bom_row("BOTTLED-SAUCE", 1), _bom_row("Tortilla", 1)]},
            root_items={"BOM-WRAP": "WRAP"},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot(
            [_row("WRAP", 5, department="Main Kitchen", production_policy="MADE_TO_ORDER", bom="BOM-WRAP")]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        target = departments["Main Kitchen"]["targets"][0]
        self.assertEqual(target["item_code"], "WRAP")
        demand = {row["item_code"]: row["required_qty"] for row in target["raw_material_vector"]}
        self.assertEqual(demand["BOTTLED-SAUCE"], 5.0)
        self.assertEqual(demand["Tortilla"], 5.0)

    def test_mto_own_nested_pre_produced_item_never_in_its_own_raw_material_vector(self):
        # BIRYANI-BASE is a real nested target here (D1) -- it must appear
        # in main["targets"] as its own entry, and it must NOT appear in
        # CHICKEN-BIRYANI's raw_material_vector, or the readiness engine
        # would ask Store/the department to hold it as if it were a plain
        # purchasable ingredient, on top of it correctly being produced
        # through its own Work Order.
        fixture = _Fixture(
            configs={
                "BIRYANI-BASE": _config(
                    "BIRYANI-BASE", department="Main Kitchen", bom="BOM-BIRYANI-BASE",
                    warehouse="Main Kitchen - WH",
                ),
            },
            bom_catalog={
                "BOM-CHICKEN-BIRYANI": [
                    _bom_row("BIRYANI-BASE", 0.2, bom_no="BOM-BIRYANI-BASE"),
                    _bom_row("Salt", 0.01),
                ],
                "BOM-BIRYANI-BASE": [_bom_row("Rice", 0.05)],
            },
            root_items={"BOM-CHICKEN-BIRYANI": "CHICKEN-BIRYANI", "BOM-BIRYANI-BASE": "BIRYANI-BASE"},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot(
            [_row("CHICKEN-BIRYANI", 100, department="Main Kitchen", production_policy="MADE_TO_ORDER",
                  bom="BOM-CHICKEN-BIRYANI")]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        main = departments["Main Kitchen"]
        self.assertEqual({t["item_code"] for t in main["targets"]}, {"CHICKEN-BIRYANI", "BIRYANI-BASE"})
        mto = next(t for t in main["targets"] if t["item_code"] == "CHICKEN-BIRYANI")
        self.assertTrue(mto["skip_work_order"])
        raw_material_items = {row["item_code"] for row in mto["raw_material_vector"]}
        self.assertNotIn("BIRYANI-BASE", raw_material_items)
        self.assertIn("Salt", raw_material_items)
        # But it IS in the unfiltered component_vector -- D1, for a Work
        # Order this row will never actually get, since skip_work_order.
        self.assertIn("BIRYANI-BASE", {row["item_code"] for row in mto["component_vector"]})


class DirectPreProducedTests(unittest.TestCase):
    def test_direct_pre_produced_row_becomes_a_target_with_its_own_component_vector(self):
        fixture = _Fixture(
            configs={"BIRYANI-BASE": _config("BIRYANI-BASE", department="Main Kitchen")},
            bom_catalog={"BOM-BIRYANI-BASE": [_bom_row("Rice", 0.05), _bom_row("Masala", 0.01)]},
            root_items={"BOM-BIRYANI-BASE": "BIRYANI-BASE"},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot(
            [_row("BIRYANI-BASE", 20, department="Main Kitchen", production_unit="Main Kitchen Unit",
                  bom="BOM-BIRYANI-BASE")]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        target = departments["Main Kitchen"]["targets"][0]
        self.assertEqual(target["required_qty"], 20)
        cv = {row["item_code"]: row["required_qty"] for row in target["component_vector"]}
        self.assertEqual(cv["Rice"], 1.0)
        self.assertEqual(cv["Masala"], 0.2)
        self.assertEqual(target["sources"], [
            {"parent_item": None, "required_qty": 20, "source_type": "direct_plan_row"}
        ])

    def test_same_item_in_two_departments_stays_separate(self):
        fixture = _Fixture(
            bom_catalog={"BOM-SAUCE": []},
            department_warehouses={"Kitchen": "Kitchen - WH", "Bakery": "Bakery - WH"},
        )
        snapshot = _snapshot(
            [
                _row("SAUCE", 10, department="Kitchen", bom="BOM-SAUCE"),
                _row("SAUCE", 4, department="Bakery", bom="BOM-SAUCE"),
            ]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        self.assertEqual(len(departments), 2)
        self.assertEqual(departments["Kitchen"]["targets"][0]["required_qty"], 10)
        self.assertEqual(departments["Bakery"]["targets"][0]["required_qty"], 4)

    def test_missing_pinned_bom_on_a_pre_produced_row_fails_loudly(self):
        fixture = _Fixture()
        snapshot = _snapshot([_row("NOBOM", 1, department="Main Kitchen", bom=None)])

        with self.assertRaises(frappe.ValidationError):
            fixture.compile(snapshot)

    def test_missing_pinned_bom_on_a_made_to_order_row_fails_loudly(self):
        fixture = _Fixture()
        snapshot = _snapshot(
            [_row("MTO-NOBOM", 1, department="Main Kitchen", production_policy="MADE_TO_ORDER", bom=None)]
        )

        with self.assertRaises(frappe.ValidationError):
            fixture.compile(snapshot)

    def test_non_sales_pre_produced_assembly_is_included(self):
        # This module has no concept of Item.is_sales_item at all -- a
        # kitchen base with no menu presence must still become a target.
        fixture = _Fixture(
            bom_catalog={"BOM-BASE": []},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot([_row("KITCHEN-BASE", 3, department="Main Kitchen", bom="BOM-BASE")])

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        self.assertIn("KITCHEN-BASE", _all_item_codes(departments))

    def test_module_never_references_is_sales_item(self):
        import ury.ury.api.ury_production_target_compiler as module
        import inspect

        self.assertNotIn("is_sales_item", inspect.getsource(module))


class RawMaterialAndDirectRetailTests(unittest.TestCase):
    def test_raw_materials_never_become_targets(self):
        fixture = _Fixture(
            configs={"BIRYANI-BASE": _config("BIRYANI-BASE", department="Main Kitchen", bom="BOM-BIRYANI-BASE")},
            bom_catalog={
                "BOM-CHICKEN-BIRYANI": [_bom_row("BIRYANI-BASE", 0.2, bom_no="BOM-BIRYANI-BASE")],
                "BOM-BIRYANI-BASE": [_bom_row("Rice", 0.05)],
            },
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot(
            [_row("CHICKEN-BIRYANI", 100, department="Main Kitchen", production_policy="MADE_TO_ORDER",
                  bom="BOM-CHICKEN-BIRYANI")]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertNotIn("Rice", _all_item_codes(departments))

    def test_direct_retail_row_never_becomes_a_target(self):
        fixture = _Fixture()
        snapshot = _snapshot([_row("SODA", 5, department=None, production_policy="DIRECT_RETAIL", bom=None)])

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(departments, {})
        self.assertEqual(blockers, [])

    def test_direct_retail_component_appears_in_vector_but_never_as_a_target(self):
        fixture = _Fixture(
            configs={"KETCHUP": _config("KETCHUP", department="Main Kitchen", production_policy="DIRECT_RETAIL")},
            bom_catalog={"BOM-BURGER": [_bom_row("KETCHUP", 1)]},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot([_row("BURGER", 4, department="Main Kitchen", bom="BOM-BURGER")])

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        target = departments["Main Kitchen"]["targets"][0]
        cv = {row["item_code"]: row["required_qty"] for row in target["component_vector"]}
        self.assertEqual(cv["KETCHUP"], 4)
        self.assertNotIn("KETCHUP", _all_item_codes(departments))


class CrossDepartmentBlockerTests(unittest.TestCase):
    def test_cross_department_pre_produced_dependency_yields_blocker_not_target(self):
        fixture = _Fixture(
            configs={"BREAD": _config("BREAD", department="Bakery", bom="BOM-BREAD", warehouse="Bakery - WH")},
            bom_catalog={
                "BOM-SANDWICH": [_bom_row("BREAD", 2, "Nos", bom_no="BOM-BREAD")],
                "BOM-BREAD": [_bom_row("Flour", 0.3)],
            },
            root_items={"BOM-SANDWICH": "SANDWICH", "BOM-BREAD": "BREAD"},
            department_warehouses={"Bakery": "Bakery - WH"},
        )
        snapshot = _snapshot(
            [_row("SANDWICH", 5, department="Main Kitchen", production_policy="MADE_TO_ORDER",
                  bom="BOM-SANDWICH")]
        )

        departments, blockers = fixture.compile(snapshot)

        # SANDWICH is still a real target (skip_work_order=True): an MTO
        # item's own po_items row exists regardless of a blocked dependency
        # underneath it -- it never gets a Work Order either way, and the
        # blocker is what actually tells the manager BREAD is misconfigured.
        main = departments["Main Kitchen"]
        self.assertEqual({t["item_code"] for t in main["targets"]}, {"SANDWICH"})
        sandwich = main["targets"][0]
        self.assertTrue(sandwich["skip_work_order"])
        self.assertNotIn("BREAD", {row["item_code"] for row in sandwich["raw_material_vector"]})

        self.assertEqual(len(blockers), 1)
        blocker = blockers[0]
        self.assertEqual(blocker["type"], "cross_department_dependency")
        self.assertEqual(blocker["item_code"], "BREAD")
        self.assertEqual(blocker["configured_department"], "Bakery")
        self.assertEqual(blocker["consuming_department"], "Main Kitchen")
        self.assertEqual(blocker["consuming_item"], "SANDWICH")
        self.assertIn("BREAD", blocker["message"])
        self.assertIn("Bakery", blocker["message"])
        self.assertIn("SANDWICH", blocker["message"])
        self.assertIn("Main Kitchen", blocker["message"])


class ExternalReceiptRoutingTests(unittest.TestCase):
    def test_external_receipt_target_routed_separately_and_builds_no_work_order_material(self):
        fixture = _Fixture(
            configs={"CENTRAL-CURRY": _config("CENTRAL-CURRY", sourcing_mode="EXTERNAL_RECEIPT")},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
            # Deliberately no BOM catalog entry for CENTRAL-CURRY's bom_no --
            # an EXTERNAL_RECEIPT target must never have its own BOM walked.
        )
        snapshot = _snapshot(
            [_row("CENTRAL-CURRY", 8, department="Main Kitchen", bom="BOM-CENTRAL-CURRY")]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        bucket = departments["Main Kitchen"]
        self.assertEqual(bucket["targets"], [])
        self.assertEqual(len(bucket["external_receipt_targets"]), 1)
        target = bucket["external_receipt_targets"][0]
        self.assertEqual(target["item_code"], "CENTRAL-CURRY")
        self.assertEqual(target["required_qty"], 8)
        self.assertEqual(target["component_vector"], [])
        self.assertEqual(target["depends_on"], [])


class AmbiguousConfigurationTests(unittest.TestCase):
    def test_ambiguous_configuration_yields_a_blocker_and_stops_that_branch(self):
        fixture = _Fixture(
            configs={"CONFUSED": _config("CONFUSED", ambiguous=True)},
            bom_catalog={
                "BOM-ROOT2": [_bom_row("CONFUSED", 1, bom_no="BOM-CONFUSED")],
                "BOM-CONFUSED": [_bom_row("Whatever", 1)],
            },
            root_items={"BOM-ROOT2": "ROOT2"},
        )
        snapshot = _snapshot(
            [_row("ROOT2", 1, department="Main Kitchen", production_policy="MADE_TO_ORDER", bom="BOM-ROOT2")]
        )

        departments, blockers = fixture.compile(snapshot)

        # ROOT2 is still a real target (skip_work_order=True) even though its
        # own BOM has a blocked node underneath it -- same reasoning as the
        # cross-department case: the MTO item's own po_items row is harmless
        # to have, and the blocker is what surfaces the real problem.
        main = departments["Main Kitchen"]
        self.assertEqual({t["item_code"] for t in main["targets"]}, {"ROOT2"})
        self.assertTrue(main["targets"][0]["skip_work_order"])

        self.assertEqual(len(blockers), 1)
        self.assertEqual(blockers[0]["type"], "ambiguous_configuration")
        self.assertEqual(blockers[0]["item_code"], "CONFUSED")


class BomCycleTests(unittest.TestCase):
    def test_bom_cycle_surfaces_as_a_blocker_without_crashing_other_departments(self):
        fixture = _Fixture(
            bom_catalog={
                "BOM-CYCLE-A": [_bom_row("X", 1, bom_no="BOM-CYCLE-B")],
                "BOM-CYCLE-B": [_bom_row("Y", 1, bom_no="BOM-CYCLE-A")],
                "BOM-SAFE": [_bom_row("Flour", 1)],
            },
            root_items={"BOM-CYCLE-A": "CYCLIC-ITEM"},
            department_warehouses={"Bakery": "Bakery - WH"},
        )
        snapshot = _snapshot(
            [
                _row("CYCLIC-ITEM", 1, department="Main Kitchen", production_policy="MADE_TO_ORDER",
                     bom="BOM-CYCLE-A"),
                _row("SAFE-ITEM", 3, department="Bakery", bom="BOM-SAFE"),
            ]
        )

        departments, blockers = fixture.compile(snapshot)

        cycle_blockers = [b for b in blockers if b["type"] == "bom_cycle"]
        self.assertEqual(len(cycle_blockers), 1)
        self.assertEqual(cycle_blockers[0]["item_code"], "CYCLIC-ITEM")

        # The unrelated Bakery department must still compile cleanly.
        self.assertIn("Bakery", departments)
        target = departments["Bakery"]["targets"][0]
        self.assertEqual(target["item_code"], "SAFE-ITEM")
        self.assertEqual(target["required_qty"], 3)
        cv = {row["item_code"]: row["required_qty"] for row in target["component_vector"]}
        self.assertEqual(cv["Flour"], 3)


class DependencyOrderingTests(unittest.TestCase):
    def test_nested_pre_produced_dependency_is_ordered_before_its_consumer(self):
        fixture = _Fixture(
            configs={"DOUGH": _config("DOUGH", department="Bakery", bom="BOM-DOUGH", warehouse="Bakery - WH")},
            bom_catalog={
                "BOM-STUFFED-BREAD": [_bom_row("DOUGH", 1, bom_no="BOM-DOUGH"), _bom_row("Filling", 0.5)],
                "BOM-DOUGH": [_bom_row("Flour", 1)],
            },
            department_warehouses={"Bakery": "Bakery - WH"},
        )
        snapshot = _snapshot(
            [_row("STUFFED-BREAD", 6, department="Bakery", bom="BOM-STUFFED-BREAD")]
        )

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        targets = departments["Bakery"]["targets"]
        self.assertEqual([t["item_code"] for t in targets], ["DOUGH", "STUFFED-BREAD"])

        stuffed_bread = targets[1]
        self.assertEqual(stuffed_bread["depends_on"], ["DOUGH"])
        cv = {row["item_code"]: row["required_qty"] for row in stuffed_bread["component_vector"]}
        self.assertEqual(cv["DOUGH"], 6)
        self.assertEqual(cv["Filling"], 3)

        dough = targets[0]
        self.assertEqual(dough["required_qty"], 6)
        dough_cv = {row["item_code"]: row["required_qty"] for row in dough["component_vector"]}
        self.assertEqual(dough_cv["Flour"], 6)


class UnstockedIntermediatePassThroughTests(unittest.TestCase):
    def test_unstocked_intermediate_excluded_but_its_raw_materials_and_nested_target_included(self):
        fixture = _Fixture(
            configs={
                "SPECIAL-SAUCE": _config(
                    "SPECIAL-SAUCE", department="Main Kitchen", bom="BOM-SAUCE2", warehouse="Main Kitchen - WH"
                ),
            },
            bom_catalog={
                "BOM-BURGER-SET": [
                    _bom_row("MIX", 1, bom_no="BOM-MIX"),
                    _bom_row("SPECIAL-SAUCE", 0.5, bom_no="BOM-SAUCE2"),
                ],
                "BOM-MIX": [_bom_row("Salt", 0.1)],
                "BOM-SAUCE2": [_bom_row("Vinegar", 0.2)],
            },
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot([_row("BURGER-SET", 4, department="Main Kitchen", bom="BOM-BURGER-SET")])

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(blockers, [])
        targets = {t["item_code"]: t for t in departments["Main Kitchen"]["targets"]}
        self.assertIn("SPECIAL-SAUCE", targets)
        self.assertNotIn("MIX", targets)

        burger_set = targets["BURGER-SET"]
        cv = {row["item_code"]: row["required_qty"] for row in burger_set["component_vector"]}
        self.assertNotIn("MIX", cv)
        self.assertEqual(cv["Salt"], 0.4)
        self.assertEqual(cv["SPECIAL-SAUCE"], 2.0)
        self.assertEqual(burger_set["depends_on"], ["SPECIAL-SAUCE"])

        sauce = targets["SPECIAL-SAUCE"]
        self.assertEqual(sauce["required_qty"], 2.0)
        sauce_cv = {row["item_code"]: row["required_qty"] for row in sauce["component_vector"]}
        self.assertEqual(sauce_cv["Vinegar"], 0.4)


class BranchIsMandatoryTests(unittest.TestCase):
    def test_branch_is_required(self):
        with self.assertRaises(frappe.ValidationError):
            compile_production_targets(_snapshot([]), branch=None, company="Co")

    def test_branch_is_a_positional_argument_with_no_default(self):
        import inspect

        params = inspect.signature(compile_production_targets).parameters
        self.assertIn("branch", params)
        self.assertEqual(params["branch"].default, inspect.Parameter.empty)


class SnapshotDecodingTests(unittest.TestCase):
    def test_accepts_json_string_snapshot_not_only_a_dict(self):
        fixture = _Fixture(
            bom_catalog={"BOM-BASE": []},
            department_warehouses={"Main Kitchen": "Main Kitchen - WH"},
        )
        snapshot = _snapshot([_row("KITCHEN-BASE", 3, department="Main Kitchen", bom="BOM-BASE")])
        encoded = json.dumps(snapshot)

        departments, blockers = fixture.compile(encoded)

        self.assertEqual(blockers, [])
        self.assertIn("KITCHEN-BASE", _all_item_codes(departments))

    def test_zero_qty_rows_are_ignored(self):
        fixture = _Fixture()
        snapshot = _snapshot([_row("UNTOUCHED", 0, department="Main Kitchen", bom="BOM-UNUSED")])

        departments, blockers = fixture.compile(snapshot)

        self.assertEqual(departments, {})
        self.assertEqual(blockers, [])


if __name__ == "__main__":
    unittest.main()
