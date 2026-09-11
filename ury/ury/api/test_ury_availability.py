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

from ury.ury.api.ury_availability import _resolve_plan_remaining, get_item_availability


MODULE = "ury.ury.api.ury_availability"


def _config(**overrides):
    base = {
        "production_policy": "PRE_PRODUCED",
        "department": "Kitchen",
        "production_unit": "Central Kitchen",
        "warehouse": "Kitchen Warehouse - URY",
        "production_unit_disabled": 0,
        "department_disabled": 0,
        # These three mirror the doctype's real defaults (B-1/B-2 fix):
        # controlled_by_sales_plan defaults to 1 (mandatory plan gating,
        # fail-closed), allow_over_plan_sale defaults to 0, and
        # availability_mode defaults to "Plan Available" (no override).
        # Using the real defaults here -- instead of omitting the keys and
        # relying on the production code's `.get(..., default)` fallback --
        # is what B-5 requires: a test suite that would have caught the B-1
        # polarity bug instead of silently masking it.
        "controlled_by_sales_plan": 1,
        "allow_over_plan_sale": 0,
        "availability_mode": "Plan Available",
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
    def test_department_disabled(self, mock_config):
        mock_config.return_value = _config(department_disabled=1)

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "DEPARTMENT_DISABLED")
        self.assertFalse(result["sellable"])

    @patch(f"{MODULE}._resolve_production_config")
    def test_production_unit_disabled_pre_produced(self, mock_config):
        mock_config.return_value = _config(
            production_policy="PRE_PRODUCED",
            production_unit_disabled=1
        )

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "PRODUCTION_UNIT_DISABLED")
        self.assertFalse(result["sellable"])

    @patch(f"{MODULE}._resolve_production_config")
    def test_production_unit_disabled_made_to_order(self, mock_config):
        mock_config.return_value = _config(
            production_policy="MADE_TO_ORDER",
            production_unit_disabled=1
        )

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "PRODUCTION_UNIT_DISABLED")
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


class TestGetItemAvailabilityDirectRetail(FrappeTestCase):

    @patch(f"{MODULE}.get_allocatable_qty")
    @patch(f"{MODULE}._resolve_production_config")
    def test_direct_retail_zero_stock(self, mock_config, mock_alloc):
        mock_config.return_value = _config(production_policy="DIRECT_RETAIL")
        mock_alloc.return_value = {
            "allocatable_qty": 0,
        }

        result = get_item_availability("ITEM-RETAIL", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "FG_OUT_OF_STOCK")
        self.assertFalse(result["sellable"])
        self.assertEqual(result["available_qty"], 0)
        self.assertEqual(result["production_policy"], "DIRECT_RETAIL")


class TestAvailabilityProductionContextIntegration(FrappeTestCase):
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.frappe.db.get_value", return_value="Company A")
    @patch(f"{MODULE}.frappe.get_all")
    def test_uses_canonical_production_context_resolver(self, mock_get_all, mock_get_value, mock_plan, mock_fg):
        mock_get_all.return_value = [
            {
                "name": "UIPC-1",
                "item": "ITEM-CAKE",
                "branch": "Branch A",
                "department": "Hot Kitchen",
                "production_unit": "Main Kitchen",
                "production_policy": "Make to Stock",
                "bom": None,
                "direct_retail_warehouse": "FG Warehouse - URY",
                "controlled_by_sales_plan": 1,
                "allow_over_plan_sale": 0,
                "availability_mode": "Always",
            }
        ]
        mock_plan.return_value = {"plan_qty": 10, "plan_remaining": 10}
        mock_fg.return_value = {
            "allocatable_qty": 4,
            "bin_actual_qty": 12,
            "bin_projected_qty": 4,
        }

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertEqual(result["production_policy"], "PRE_PRODUCED")
        self.assertEqual(result["department"], "Hot Kitchen")
        self.assertEqual(result["warehouse"], "FG Warehouse - URY")
        self.assertEqual(result["available_qty"], 4)
        mock_get_all.assert_called_once()
        # get_value is now also called to derive production_unit_disabled/
        # department_disabled from the linked records' own `enabled` field
        # (N2 fix), not just the company lookup -- assert the company
        # lookup happened, not that it was the only call.
        self.assertIn(("Branch", "Branch A", "company"), [c.args for c in mock_get_value.call_args_list])


class TestControlledBySalesPlanPolarity(FrappeTestCase):
    """Regression coverage for B-1: `controlled_by_sales_plan` doctype default
    must be 1 (mandatory plan gating), and the code must keep failing closed
    for existing/default rows when no plan is active."""

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_controlled_by_sales_plan_default_still_fails_closed_pre_produced(
        self, mock_config, mock_fg, mock_plan
    ):
        # controlled_by_sales_plan=1 is the doctype default -- this must
        # still produce NO_ACTIVE_PLAN with no active plan, not silently
        # fall through to stock-based availability (the B-1 bug).
        mock_config.return_value = _config(controlled_by_sales_plan=1)
        mock_fg.return_value = {"allocatable_qty": 20, "bin_actual_qty": 60, "bin_projected_qty": 20}
        mock_plan.return_value = None

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "NO_ACTIVE_PLAN")
        self.assertFalse(result["sellable"])
        self.assertEqual(result["available_qty"], 0)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_controlled_by_sales_plan_explicit_opt_out_skips_gate_pre_produced(
        self, mock_config, mock_fg, mock_plan
    ):
        # controlled_by_sales_plan=0 is an explicit operator opt-out -- with
        # no active plan, the item should fall through to stock-based
        # availability instead of failing closed.
        mock_config.return_value = _config(controlled_by_sales_plan=0)
        mock_fg.return_value = {"allocatable_qty": 20, "bin_actual_qty": 60, "bin_projected_qty": 20}
        mock_plan.return_value = None

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertTrue(result["sellable"])
        self.assertEqual(result["available_qty"], 20)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_component_allocatable")
    @patch(f"{MODULE}.compile_bom_vector")
    @patch(f"{MODULE}._resolve_production_config")
    def test_controlled_by_sales_plan_default_still_fails_closed_made_to_order(
        self, mock_config, mock_compile, mock_alloc, mock_plan
    ):
        mock_config.return_value = _config(production_policy="MADE_TO_ORDER", controlled_by_sales_plan=1)
        mock_compile.return_value = {
            "item_code": "ITEM-BURGER",
            "components": [{"component_item": "BUN", "qty": 1, "qty_per_unit": 1, "stock_uom": "Nos"}],
        }
        mock_alloc.return_value = {"BUN": {"allocatable_qty": 50}}
        mock_plan.return_value = None

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "NO_ACTIVE_PLAN")
        self.assertFalse(result["sellable"])

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_component_allocatable")
    @patch(f"{MODULE}.compile_bom_vector")
    @patch(f"{MODULE}._resolve_production_config")
    def test_controlled_by_sales_plan_explicit_opt_out_skips_gate_made_to_order(
        self, mock_config, mock_compile, mock_alloc, mock_plan
    ):
        mock_config.return_value = _config(production_policy="MADE_TO_ORDER", controlled_by_sales_plan=0)
        mock_compile.return_value = {
            "item_code": "ITEM-BURGER",
            "components": [{"component_item": "BUN", "qty": 1, "qty_per_unit": 1, "stock_uom": "Nos"}],
        }
        mock_alloc.return_value = {"BUN": {"allocatable_qty": 50}}
        mock_plan.return_value = None

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertTrue(result["sellable"])

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_controlled_by_sales_plan_opt_out_ignores_exhausted_plan_pre_produced(
        self, mock_config, mock_fg, mock_plan
    ):
        # Regression for the "plan exists but is exhausted" no-op bug:
        # controlled_by_sales_plan=0 must ignore the Sales Plan entirely, not
        # just when no plan row exists -- an exhausted plan (plan_remaining=0)
        # must NOT hard-block a sale that stock would otherwise allow.
        mock_config.return_value = _config(controlled_by_sales_plan=0)
        mock_fg.return_value = {"allocatable_qty": 20, "bin_actual_qty": 60, "bin_projected_qty": 20}
        mock_plan.return_value = {"plan_qty": 10, "plan_remaining": 0}

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertTrue(result["sellable"])
        self.assertEqual(result["available_qty"], 20)

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_component_allocatable")
    @patch(f"{MODULE}.compile_bom_vector")
    @patch(f"{MODULE}._resolve_production_config")
    def test_controlled_by_sales_plan_opt_out_ignores_exhausted_plan_made_to_order(
        self, mock_config, mock_compile, mock_alloc, mock_plan
    ):
        mock_config.return_value = _config(production_policy="MADE_TO_ORDER", controlled_by_sales_plan=0)
        mock_compile.return_value = {
            "item_code": "ITEM-BURGER",
            "components": [{"component_item": "BUN", "qty": 1, "qty_per_unit": 1, "stock_uom": "Nos"}],
        }
        mock_alloc.return_value = {"BUN": {"allocatable_qty": 50}}
        mock_plan.return_value = {"plan_qty": 10, "plan_remaining": 0}

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertTrue(result["sellable"])
        self.assertEqual(result["available_qty"], 50)


class TestAvailabilityModeOverride(FrappeTestCase):
    """Regression coverage for B-2: the 'Always Available' override must
    never force sellable over a structural/config error, but must be able to
    override a purely commercial not-sellable reason (e.g. FG_OUT_OF_STOCK)."""

    @patch(f"{MODULE}.compile_bom_vector")
    @patch(f"{MODULE}._resolve_production_config")
    def test_always_available_does_not_override_missing_bom(self, mock_config, mock_compile):
        import frappe

        mock_config.return_value = _config(
            production_policy="MADE_TO_ORDER", availability_mode="Always Available"
        )
        mock_compile.side_effect = frappe.ValidationError("no active BOM")

        result = get_item_availability("ITEM-BURGER", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "MISSING_BOM")
        self.assertFalse(result["sellable"])

    @patch(f"{MODULE}._resolve_plan_remaining")
    @patch(f"{MODULE}.project_fg_allocatable")
    @patch(f"{MODULE}._resolve_production_config")
    def test_always_available_overrides_fg_out_of_stock(self, mock_config, mock_fg, mock_plan):
        mock_config.return_value = _config(
            controlled_by_sales_plan=0, availability_mode="Always Available"
        )
        mock_fg.return_value = {"allocatable_qty": 0, "bin_actual_qty": 60, "bin_projected_qty": 0}
        mock_plan.return_value = None

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "AVAILABLE")
        self.assertTrue(result["sellable"])

    @patch(f"{MODULE}._resolve_production_config")
    def test_always_available_does_not_override_department_disabled(self, mock_config):
        mock_config.return_value = _config(department_disabled=1, availability_mode="Always Available")

        result = get_item_availability("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["reason_code"], "DEPARTMENT_DISABLED")
        self.assertFalse(result["sellable"])


class TestResolvePlanRemainingReflectsCounters(FrappeTestCase):
    """`_resolve_plan_remaining` must read the real committed_qty/fulfilled_qty
    counters instead of the old hardcoded committed=fulfilled=0 (which made
    plan_remaining always equal the full plan_qty, regardless of how many
    orders had actually been placed against the plan)."""

    @patch(f"{MODULE}.resolve_plan_item_rows")
    def test_full_plan_qty_when_nothing_committed_yet(self, mock_rows):
        mock_rows.return_value = [
            {"name": "PLI-1", "parent": "PLAN-1", "qty": 50, "committed_qty": 0, "fulfilled_qty": 0}
        ]

        result = _resolve_plan_remaining("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result, {"plan_qty": 50, "plan_remaining": 50})

    @patch(f"{MODULE}.resolve_plan_item_rows")
    def test_plan_remaining_shrinks_as_committed_and_fulfilled_grow(self, mock_rows):
        mock_rows.return_value = [
            {"name": "PLI-1", "parent": "PLAN-1", "qty": 50, "committed_qty": 20, "fulfilled_qty": 15}
        ]

        result = _resolve_plan_remaining("ITEM-CAKE", "Branch A", "Company A")

        # No longer always equal to plan_qty -- this is exactly the bug fix.
        self.assertEqual(result, {"plan_qty": 50, "plan_remaining": 15})

    @patch(f"{MODULE}.resolve_plan_item_rows")
    def test_plan_remaining_can_go_to_zero_when_fully_committed(self, mock_rows):
        mock_rows.return_value = [
            {"name": "PLI-1", "parent": "PLAN-1", "qty": 10, "committed_qty": 10, "fulfilled_qty": 0}
        ]

        result = _resolve_plan_remaining("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["plan_remaining"], 0)

    @patch(f"{MODULE}.resolve_plan_item_rows")
    def test_sums_committed_and_fulfilled_across_matching_rows(self, mock_rows):
        mock_rows.return_value = [
            {"name": "PLI-1", "parent": "PLAN-1", "qty": 30, "committed_qty": 5, "fulfilled_qty": 0},
            {"name": "PLI-2", "parent": "PLAN-2", "qty": 20, "committed_qty": 3, "fulfilled_qty": 2},
        ]

        result = _resolve_plan_remaining("ITEM-CAKE", "Branch A", "Company A")

        self.assertEqual(result["plan_qty"], 50)
        self.assertEqual(result["plan_remaining"], 40)  # 50 - (5+3) - (0+2)

    @patch(f"{MODULE}.resolve_plan_item_rows")
    def test_no_matching_rows_is_no_active_plan(self, mock_rows):
        mock_rows.return_value = []

        result = _resolve_plan_remaining("ITEM-CAKE", "Branch A", "Company A")

        self.assertIsNone(result)
