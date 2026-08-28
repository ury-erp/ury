# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_validation import (
    DIRECT_RETAIL,
    MADE_TO_ORDER,
    PRE_PRODUCED,
    validate_item_production_configuration,
)


class TestURYProductionValidation(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self.link_values = {
            ("Branch", "Test Branch"): "Test Company",
            ("URY Production Department", "Hot Kitchen"): frappe._dict(
                {"branch": "Test Branch", "company": "Test Company", "enabled": 1}
            ),
            ("URY Production Department", "Beverage"): frappe._dict(
                {"branch": "Test Branch", "company": "Test Company", "enabled": 1}
            ),
            ("URY Production Unit", "Main Kitchen"): frappe._dict(
                {"branch": "Test Branch", "company": "Test Company"}
            ),
            ("BOM", "BOM-Test-001"): frappe._dict(
                {"item": "Test Item", "company": "Test Company", "is_active": 1, "docstatus": 1}
            ),
            ("Warehouse", "Beverage WH"): "Test Company",
        }
        self.get_value_patch = patch(
            "ury.ury.api.ury_production_validation.frappe.db.get_value",
            side_effect=lambda doctype, name, fields=None, *args, **kwargs: self.link_values.get((doctype, name)),
        )
        self.has_permission_patch = patch(
            "ury.ury.api.ury_production_validation.frappe.has_permission",
            return_value=True,
        )
        self.get_value_patch.start()
        self.has_permission_patch.start()

    def tearDown(self):
        self.has_permission_patch.stop()
        self.get_value_patch.stop()
        super().tearDown()

    def _config(self, **overrides):
        config = frappe._dict(
            {
                "name": "UIPC-Test Item-Test Branch",
                "item": "Test Item",
                "branch": "Test Branch",
                "department": "Hot Kitchen",
                "production_unit": "Main Kitchen",
                "production_policy": "MADE_TO_ORDER",
                "bom": "BOM-Test-001",
                "direct_retail_warehouse": None,
            }
        )
        config.update(overrides)
        return config

    def _patch_configs(self, configs):
        return patch("ury.ury.api.ury_production_validation.frappe.get_all", return_value=configs)

    def test_made_to_order_accepts_required_mapping_and_bom(self):
        with self._patch_configs([self._config(production_policy="MADE_TO_ORDER")]):
            result = validate_item_production_configuration("Test Item", "Test Branch")

        self.assertEqual(result["production_policy"], MADE_TO_ORDER)
        self.assertEqual(result["department"], "Hot Kitchen")
        self.assertEqual(result["production_unit"], "Main Kitchen")
        self.assertEqual(result["bom"], "BOM-Test-001")
        self.assertIsNone(result["warehouse"])

    def test_permission_denial_fails_before_configuration_lookup(self):
        with patch(
            "ury.ury.api.ury_production_validation.frappe.has_permission",
            return_value=False,
        ):
            with self._patch_configs([self._config()]) as get_all:
                with self.assertRaises(frappe.PermissionError):
                    validate_item_production_configuration("Test Item", "Test Branch")

        get_all.assert_not_called()

    def test_make_to_order_label_is_accepted_for_existing_doctype_options(self):
        with self._patch_configs([self._config(production_policy="Make to Order")]):
            result = validate_item_production_configuration("Test Item", "Test Branch")

        self.assertEqual(result["production_policy"], MADE_TO_ORDER)

    def test_make_to_stock_label_maps_to_pre_produced(self):
        with self._patch_configs([self._config(production_policy="Make to Stock")]):
            result = validate_item_production_configuration("Test Item", "Test Branch")

        self.assertEqual(result["production_policy"], PRE_PRODUCED)

    def test_manufactured_item_rejects_missing_bom(self):
        with self._patch_configs([self._config(bom=None)]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_manufactured_item_rejects_missing_department(self):
        with self._patch_configs([self._config(department=None)]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_manufactured_item_rejects_missing_production_unit(self):
        with self._patch_configs([self._config(production_unit=None)]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_direct_retail_accepts_warehouse_without_manufacturing_route(self):
        with self._patch_configs(
            [
                self._config(
                    production_policy="DIRECT_RETAIL",
                    department="Beverage",
                    production_unit=None,
                    bom=None,
                    direct_retail_warehouse="Beverage WH",
                )
            ]
        ):
            result = validate_item_production_configuration("Test Item", "Test Branch")

        self.assertEqual(result["production_policy"], DIRECT_RETAIL)
        self.assertEqual(result["warehouse"], "Beverage WH")
        self.assertIsNone(result["production_unit"])
        self.assertIsNone(result["bom"])

    def test_direct_retail_rejects_missing_warehouse(self):
        with self._patch_configs(
            [
                self._config(
                    production_policy="DIRECT_RETAIL",
                    production_unit=None,
                    bom=None,
                    direct_retail_warehouse=None,
                )
            ]
        ):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_direct_retail_rejects_bom(self):
        with self._patch_configs(
            [
                self._config(
                    production_policy="DIRECT_RETAIL",
                    production_unit=None,
                    bom="BOM-Test-001",
                    direct_retail_warehouse="Beverage WH",
                )
            ]
        ):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_missing_active_configuration_fails_closed(self):
        with self._patch_configs([]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_multiple_active_configurations_fail_closed(self):
        with self._patch_configs([self._config(name="UIPC-1"), self._config(name="UIPC-2")]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_invalid_policy_fails_closed(self):
        with self._patch_configs([self._config(production_policy="HYBRID")]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_bom_item_mismatch_fails_closed(self):
        self.link_values[("BOM", "BOM-Test-001")] = frappe._dict(
            {"item": "Other Item", "company": "Test Company", "is_active": 1, "docstatus": 1}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_bom_company_mismatch_fails_closed(self):
        self.link_values[("BOM", "BOM-Test-001")] = frappe._dict(
            {"item": "Test Item", "company": "Other Company", "is_active": 1, "docstatus": 1}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_bom_must_be_active_and_submitted(self):
        self.link_values[("BOM", "BOM-Test-001")] = frappe._dict(
            {"item": "Test Item", "company": "Test Company", "is_active": 0, "docstatus": 1}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_department_branch_mismatch_fails_closed(self):
        self.link_values[("URY Production Department", "Hot Kitchen")] = frappe._dict(
            {"branch": "Other Branch", "company": "Test Company", "enabled": 1}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_department_company_mismatch_fails_closed(self):
        self.link_values[("URY Production Department", "Hot Kitchen")] = frappe._dict(
            {"branch": "Test Branch", "company": "Other Company", "enabled": 1}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_disabled_department_fails_closed(self):
        self.link_values[("URY Production Department", "Hot Kitchen")] = frappe._dict(
            {"branch": "Test Branch", "company": "Test Company", "enabled": 0}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_production_unit_branch_mismatch_fails_closed(self):
        self.link_values[("URY Production Unit", "Main Kitchen")] = frappe._dict(
            {"branch": "Other Branch", "company": "Test Company"}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_production_unit_company_mismatch_fails_closed(self):
        self.link_values[("URY Production Unit", "Main Kitchen")] = frappe._dict(
            {"branch": "Test Branch", "company": "Other Company"}
        )

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_direct_retail_warehouse_company_mismatch_fails_closed(self):
        self.link_values[("Warehouse", "Beverage WH")] = "Other Company"

        with self._patch_configs(
            [
                self._config(
                    production_policy="DIRECT_RETAIL",
                    department=None,
                    production_unit=None,
                    bom=None,
                    direct_retail_warehouse="Beverage WH",
                )
            ]
        ):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_branch_without_company_fails_closed(self):
        self.link_values[("Branch", "Test Branch")] = None

        with self._patch_configs([self._config()]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_configuration_item_mismatch_fails_closed(self):
        with self._patch_configs([self._config(item="Other Item")]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")

    def test_configuration_branch_mismatch_fails_closed(self):
        with self._patch_configs([self._config(branch="Other Branch")]):
            with self.assertRaises(frappe.ValidationError):
                validate_item_production_configuration("Test Item", "Test Branch")
