"""Tests for ury_availability.get_item_availability.

Static-review note: none of these tests have been executed against a live
bench/site/DB in this environment -- there is only a detached checkout of
the app source, no bench/Docker available. They are written and hand-traced
against `ury_availability.py`'s logic, following the same mocking pattern as
`test_ury_reservation_service.py`: each test patches this module's own
composed dependencies (`_resolve_production_config`, `_resolve_plan_remaining`,
`compile_bom_vector`, `project_fg_allocatable`, `project_component_allocatable`,
`get_allocatable_qty`) directly by name, rather than reaching through them to
mock `frappe.db` -- those lower modules (`ury_bom_compiler`,
`ury_inventory_projection`, `ury_reservation_service`) are already covered by
their own accepted test suites (V3-41/V3-42/V3-43); this suite is only
responsible for `ury_availability`'s own branch/reason-code selection logic
and its branch-isolation guarantee.
"""

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_availability import get_item_availability


MODULE = "ury.ury.api.ury_availability"


def _config(**overrides):
    base = {
        "production_policy": "PRE_PRODUCED",
        "department": "Kitchen",
        "production_unit": "Central Kitchen",
        "warehouse": "Kitchen Warehouse - URY",
        "production_unit_disabled": 0,
        "department_disabled": 0,
    }
    base.update(overrides)
    return base


class TestGetItemAvailabilityPreProduced(FrappeTestCase):

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_available_happy_path(self, mock_config, mock_fg, mock_plan):
        mock_config.return_value = _config()
        mock_fg.return_value = {
            "allocatable_qty": 20,
            "bin_actual_qty": 60,
            "bin_projected_qty": 20,
        }
        mock_plan.return_value = {"plan_qty": 80, "plan_remaining": 40}

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertTrue(result["sellable"])
        self.assertEqual(result["available_qty"], 20)  # min(plan_remaining=40, fg=20)
        self.assertEqual(result["fg_available"], 20)
        self.assertEqual(result["plan_qty"], 80)
        self.assertEqual(result["plan_remaining"], 40)
        self.assertEqual(result["production_policy"], "PRE_PRODUCED")
        self.assertIsNone(result["blocking_component"])

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_not_produced(self, mock_config, mock_fg, mock_plan):
        mock_config.return_value = _config()
        mock_fg.return_value = {
            "allocatable_qty": 0,
            "bin_actual_qty": 0,
            "bin_projected_qty": 0,
        }
        mock_plan.return_value = {"plan_qty": 80, "plan_remaining": 80}

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "NOT_PRODUCED")
        self.assertFalse(result["sellable"])
        self.assertEqual(result["available_qty"], 0)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_plan_exhausted(self, mock_config, mock_fg, mock_plan):
        mock_config.return_value = _config()
        # Produced stock remains (bin_actual_qty > 0, fg_available > 0) but the
        # approved plan entitlement is fully consumed.
        mock_fg.return_value = {
            "allocatable_qty": 15,
            "bin_actual_qty": 60,
            "bin_projected_qty": 15,
        }
        mock_plan.return_value = {"plan_qty": 80, "plan_remaining": 0}

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "PLAN_EXHAUSTED")
        self.assertFalse(result["sellable"])
        self.assertEqual(result["available_qty"], 0)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_fg_out_of_stock(self, mock_config, mock_fg, mock_plan):
        mock_config.return_value = _config()
        # Was produced at some point (bin_actual_qty > 0) but currently zero
        # allocatable, while plan entitlement remains open.
        mock_fg.return_value = {
            "allocatable_qty": 0,
            "bin_actual_qty": 60,
            "bin_projected_qty": 0,
        }
        mock_plan.return_value = {"plan_qty": 80, "plan_remaining": 20}

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "FG_OUT_OF_STOCK")
        self.assertFalse(result["sellable"])
        self.assertEqual(result["available_qty"], 0)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_no_active_plan(self, mock_config, mock_fg, mock_plan):
        mock_config.return_value = _config()
        mock_fg.return_value = {
            "allocatable_qty": 20,
            "bin_actual_qty": 60,
            "bin_projected_qty": 20,
        }
        mock_plan.return_value = None

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "NO_ACTIVE_PLAN")
        self.assertFalse(result["sellable"])


class TestGetItemAvailabilityMadeToOrder(FrappeTestCase):

    @patch(f"{MODULE}.compile_bom_vector")
    @patch(f"{MODULE}._resolve_production_config")
    def test_missing_bom(self, mock_config, mock_compile):
        import frappe

        mock_config.return_value = _config(production_policy="MADE_TO_ORDER")
        mock_compile.side_effect = frappe.ValidationError("no active BOM")

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "MISSING_BOM")
        self.assertFalse(result["sellable"])
        self.assertEqual(result["available_qty"], 0)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_component_allocatable")
    @patch(f"{MODULE}.compile_bom_vector")
    @patch(f"{MODULE}._resolve_production_config")
    def test_blocking_component(self, mock_config, mock_compile, mock_alloc, mock_plan):
        mock_config.return_value = _config(production_policy="MADE_TO_ORDER")
        mock_compile.return_value = {
            "item_code": "ITEM-BURGER",
            "components": [
                {"component_item": "BUN", "qty": 1, "qty_per_unit": 1, "stock_uom": "Nos"},
                {"component_item": "PATTY", "qty": 1, "qty_per_unit": 1, "stock_uom": "Nos"},
            ],
        }
        # BUN has plenty of stock; PATTY (a shared component) is the binding
        # constraint at zero allocatable.
        mock_alloc.return_value = {
            "BUN": {"allocatable_qty": 50},
            "PATTY": {"allocatable_qty": 0},
        }
        mock_plan.return_value = {"plan_qty": 30, "plan_remaining": 30}

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "BLOCKING_COMPONENT")
        self.assertFalse(result["sellable"])
        self.assertEqual(result["available_qty"], 0)
        self.assertEqual(result["blocking_component"], "PATTY")
        self.assertEqual(result["max_producible"], 0)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_component_allocatable")
    @patch(f"{MODULE}.compile_bom_vector")
    @patch(f"{MODULE}._resolve_production_config")
    def test_mto_available_capped_by_recipe_capacity(
        self, mock_config, mock_compile, mock_alloc, mock_plan
    ):
        mock_config.return_value = _config(production_policy="MADE_TO_ORDER")
        mock_compile.return_value = {
            "item_code": "ITEM-BURGER",
            "components": [
                {"component_item": "BUN", "qty": 1, "qty_per_unit": 1, "stock_uom": "Nos"},
                {"component_item": "PATTY", "qty": 1, "qty_per_unit": 1, "stock_uom": "Nos"},
            ],
        }
        mock_alloc.return_value = {
            "BUN": {"allocatable_qty": 50},
            "PATTY": {"allocatable_qty": 10},
        }
        mock_plan.return_value = {"plan_qty": 30, "plan_remaining": 30}

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertTrue(result["sellable"])
        self.assertEqual(result["available_qty"], 10)  # min(plan_remaining=30, recipe_capacity=10)
        self.assertEqual(result["blocking_component"], "PATTY")


class TestGetItemAvailabilityFailClosed(FrappeTestCase):

    @patch(f"{MODULE}._resolve_production_config")
    def test_missing_department(self, mock_config):
        mock_config.return_value = _config(department=None)

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "MISSING_DEPARTMENT")
        self.assertFalse(result["sellable"])

    @patch(f"{MODULE}._resolve_production_config")
    def test_configuration_error_when_config_unresolvable(self, mock_config):
        mock_config.return_value = None

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "CONFIGURATION_ERROR")
        self.assertFalse(result["sellable"])

    def test_missing_branch_fails_closed(self):
        import frappe

        with self.assertRaises(frappe.ValidationError):
            get_item_availability("ITEM-CAKE", "", "Company A")

    def test_missing_company_fails_closed(self):
        import frappe

        with self.assertRaises(frappe.ValidationError):
            get_item_availability("ITEM-CAKE", "Branch A", "")


class TestGetItemAvailabilityBranchIsolation(FrappeTestCase):

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_branch_scope_is_passed_through_to_every_lookup(
        self, mock_config, mock_fg, mock_plan
    ):
        """Same item_code queried for branch A and branch B must never mix data.

        `_resolve_production_config`, `project_fg_allocatable`, and
        `_resolve_plan_remaining` are the only places this module reads
        department/warehouse-scoped state; asserting each received the
        caller's own branch (and the warehouse/department config resolved
        for THAT branch, not some other branch) is the whole isolation
        guarantee -- there is no code path in `get_item_availability` that
        aggregates across branches or falls back to a different branch's
        data.
        """
        configs = {
            "Branch A": _config(warehouse="Kitchen Warehouse A - URY"),
            "Branch B": _config(warehouse="Kitchen Warehouse B - URY"),
        }
        fg_by_branch = {
            "Branch A": {"allocatable_qty": 20, "bin_actual_qty": 60, "bin_projected_qty": 20},
            "Branch B": {"allocatable_qty": 0, "bin_actual_qty": 0, "bin_projected_qty": 0},
        }
        plan_by_branch = {
            "Branch A": {"plan_qty": 80, "plan_remaining": 40},
            "Branch B": {"plan_qty": 80, "plan_remaining": 40},
        }

        mock_config.side_effect = lambda item_code, branch, company, department=None: configs[branch]
        mock_fg.side_effect = lambda item_code, warehouse, company: (
            fg_by_branch["Branch A"]
            if warehouse == "Kitchen Warehouse A - URY"
            else fg_by_branch["Branch B"]
        )
        mock_plan.side_effect = (
            lambda item_code, branch, company, department=None: plan_by_branch[branch]
        )

        result_a = get_item_availability("ITEM-CAKE", "Branch A", "Company A")
        result_b = get_item_availability("ITEM-CAKE", "Branch B", "Company A")

        self.assertEqual(result_a["reason_code"], "AVAILABLE")
        self.assertEqual(result_a["available_qty"], 20)
        self.assertEqual(result_a["warehouse"], "Kitchen Warehouse A - URY")

        # Branch B has zero FG stock -- must independently report
        # NOT_PRODUCED, not inherit branch A's AVAILABLE/20.
        self.assertEqual(result_b["reason_code"], "NOT_PRODUCED")
        self.assertEqual(result_b["available_qty"], 0)
        self.assertEqual(result_b["warehouse"], "Kitchen Warehouse B - URY")

        # Every call into the branch-scoped helpers carried that call's own
        # branch -- confirms no shared/cached state leaked branch A's
        # warehouse into branch B's lookups or vice versa.
        fg_calls = [call.args for call in mock_fg.call_args_list]
        self.assertIn(("ITEM-CAKE", "Kitchen Warehouse A - URY", "Company A"), fg_calls)
        self.assertIn(("ITEM-CAKE", "Kitchen Warehouse B - URY", "Company A"), fg_calls)
