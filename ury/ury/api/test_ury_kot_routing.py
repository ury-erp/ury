from unittest.mock import patch

import frappe as real_frappe
from frappe.tests.utils import FrappeTestCase

frappe_dict = real_frappe._dict

from ury.ury.api.ury_kot_routing import (
    DEPARTMENT_DISABLED,
    PRODUCTION_UNIT_DISABLED,
    ROUTING_AMBIGUOUS,
    ROUTING_NOT_CONFIGURED,
    RoutingError,
    resolve_production_units,
)

MODULE = "ury.ury.api.ury_kot_routing"


class TestResolveProductionUnits(FrappeTestCase):
    """Static, mock-based tests for the additive V3-51 routing module.

    These do not require a running bench/site — all `frappe.db` / `frappe.get_all`
    / `frappe.get_meta` calls are mocked. Validated by hand-tracing the mocked
    call sequences against `resolve_production_units()`'s logic (no bench
    available in this environment to execute pytest).
    """

    def _no_item_production_config_fields(self, doctype):
        # helper: default doctype-fieldnames stub used by most tests
        if doctype == "URY Item Production Configuration":
            return {"item", "branch", "department", "production_unit", "production_policy", "active"}
        if doctype == "URY Production Department":
            return {"name"}
        if doctype == "URY Production Unit":
            return {"name", "branch", "item_groups"}
        return {"name"}

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_exact_item_mapping_routes_correctly(self, mock_frappe, mock_fieldnames):
        mock_frappe.db.exists.side_effect = lambda *a, **k: True
        mock_fieldnames.side_effect = self._no_item_production_config_fields
        mock_frappe.get_all.return_value = [
            {"name": "CFG-1", "production_unit": "Grill Unit", "department": None}
        ]

        result = resolve_production_units(
            item_code="ITEM-1", company="URY Co", branch="Main Branch"
        )

        self.assertEqual(result, ["Grill Unit"])

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_item_group_fallback_mirrors_legacy_and_returns_multiple_units(
        self, mock_frappe, mock_fieldnames
    ):
        # No exact mapping doctype present -> exact-match path returns [].
        def exists_side_effect(*args, **kwargs):
            if args and args[0] == "DocType" and args[1] == "URY Item Production Configuration":
                return False
            return True

        mock_frappe.db.exists.side_effect = exists_side_effect
        mock_fieldnames.side_effect = self._no_item_production_config_fields
        mock_frappe.db.get_value.return_value = "Grills"

        # _legacy_item_group_fallback() looks up Production Units via
        # frappe.db.get_all(...) but Production Item Groups rows via
        # frappe.get_all(...) -- mock each on the attribute the real code
        # actually calls it on.
        def db_get_all_side_effect(doctype, filters=None, fields=None, order_by=None):
            if doctype == "URY Production Unit":
                return [frappe_dict({"name": "Unit A"}), frappe_dict({"name": "Unit B"})]
            return []

        def get_all_side_effect(doctype, filters=None, fields=None, order_by=None):
            if doctype == "URY Production Item Groups":
                if filters.get("parent") == "Unit A":
                    return [frappe_dict({"item_group": "Grills"})]
                if filters.get("parent") == "Unit B":
                    return [frappe_dict({"item_group": "Grills"}), frappe_dict({"item_group": "Drinks"})]
                return []
            return []

        mock_frappe.db.get_all.side_effect = db_get_all_side_effect
        mock_frappe.get_all.side_effect = get_all_side_effect

        result = resolve_production_units(
            item_code="ITEM-1", company="URY Co", branch="Main Branch"
        )

        # Same "one unit per Item Group match" shape as the legacy loop in
        # ury_kot_generate.py's process_items_for_kot(): both units match.
        self.assertEqual(result, ["Unit A", "Unit B"])

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_missing_mapping_for_controlled_item_fails_closed(self, mock_frappe, mock_fieldnames):
        def exists_side_effect(*args, **kwargs):
            if args and args[0] == "DocType" and args[1] == "URY Item Production Configuration":
                return False
            return True

        mock_frappe.db.exists.side_effect = exists_side_effect
        mock_fieldnames.side_effect = self._no_item_production_config_fields
        mock_frappe.db.get_value.return_value = "Unmapped Group"

        def get_all_side_effect(doctype, filters=None, fields=None, order_by=None):
            if doctype == "URY Production Unit":
                return [{"name": "Unit A"}]
            if doctype == "URY Production Item Groups":
                return []
            return []

        mock_frappe.get_all.side_effect = get_all_side_effect

        with self.assertRaises(RoutingError) as ctx:
            resolve_production_units(item_code="ITEM-1", company="URY Co", branch="Main Branch")

        self.assertEqual(ctx.exception.reason_code, ROUTING_NOT_CONFIGURED)

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_ambiguous_exact_mappings_fail_closed_no_partial_result(
        self, mock_frappe, mock_fieldnames
    ):
        mock_frappe.db.exists.side_effect = lambda *a, **k: True
        mock_fieldnames.side_effect = self._no_item_production_config_fields
        mock_frappe.get_all.return_value = [
            {"name": "CFG-1", "production_unit": "Unit A", "department": None},
            {"name": "CFG-2", "production_unit": "Unit B", "department": None},
        ]

        with self.assertRaises(RoutingError) as ctx:
            resolve_production_units(item_code="ITEM-1", company="URY Co", branch="Main Branch")

        self.assertEqual(ctx.exception.reason_code, ROUTING_AMBIGUOUS)

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_disabled_department_blocks_routing(self, mock_frappe, mock_fieldnames):
        mock_frappe.db.exists.side_effect = lambda *a, **k: True

        def fieldnames_side_effect(doctype):
            if doctype == "URY Production Department":
                return {"name", "enabled"}
            return self._no_item_production_config_fields(doctype)

        mock_fieldnames.side_effect = fieldnames_side_effect
        mock_frappe.get_all.return_value = [
            {"name": "CFG-1", "production_unit": "Unit A", "department": "Hot Kitchen"}
        ]
        mock_frappe.db.get_value.return_value = 0  # department.enabled == 0

        with self.assertRaises(RoutingError) as ctx:
            resolve_production_units(item_code="ITEM-1", company="URY Co", branch="Main Branch")

        self.assertEqual(ctx.exception.reason_code, DEPARTMENT_DISABLED)

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_disabled_production_unit_blocks_routing(self, mock_frappe, mock_fieldnames):
        mock_frappe.db.exists.side_effect = lambda *a, **k: True

        def fieldnames_side_effect(doctype):
            if doctype == "URY Production Unit":
                return {"name", "enabled"}
            return self._no_item_production_config_fields(doctype)

        mock_fieldnames.side_effect = fieldnames_side_effect
        mock_frappe.get_all.return_value = [
            {"name": "CFG-1", "production_unit": "Unit A", "department": None}
        ]
        mock_frappe.db.get_value.return_value = 0  # production_unit.enabled == 0

        with self.assertRaises(RoutingError) as ctx:
            resolve_production_units(item_code="ITEM-1", company="URY Co", branch="Main Branch")

        self.assertEqual(ctx.exception.reason_code, PRODUCTION_UNIT_DISABLED)

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_direct_retail_item_returns_empty_without_explicit_config(
        self, mock_frappe, mock_fieldnames
    ):
        def exists_side_effect(*args, **kwargs):
            if args and args[0] == "DocType" and args[1] == "URY Item Production Configuration":
                return False
            return True

        mock_frappe.db.exists.side_effect = exists_side_effect
        mock_fieldnames.side_effect = self._no_item_production_config_fields

        result = resolve_production_units(
            item_code="ITEM-1",
            company="URY Co",
            branch="Main Branch",
            production_policy="DIRECT_RETAIL",
        )

        self.assertEqual(result, [])
        # Must never touch the legacy Item Group fallback for an unmapped
        # direct-retail item.
        mock_frappe.get_all.assert_not_called()

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_direct_retail_item_routes_when_explicitly_configured(
        self, mock_frappe, mock_fieldnames
    ):
        mock_frappe.db.exists.side_effect = lambda *a, **k: True
        mock_fieldnames.side_effect = self._no_item_production_config_fields
        mock_frappe.get_all.return_value = [
            {"name": "CFG-1", "production_unit": "Retail Prep Unit", "department": None}
        ]

        result = resolve_production_units(
            item_code="ITEM-1",
            company="URY Co",
            branch="Main Branch",
            production_policy="DIRECT_RETAIL",
        )

        self.assertEqual(result, ["Retail Prep Unit"])

    @patch(f"{MODULE}.frappe")
    def test_missing_branch_or_company_fails_closed(self, mock_frappe):
        with self.assertRaises(RoutingError) as ctx:
            resolve_production_units(item_code="ITEM-1", company=None, branch="Main Branch")
        self.assertEqual(ctx.exception.reason_code, ROUTING_NOT_CONFIGURED)

        with self.assertRaises(RoutingError) as ctx2:
            resolve_production_units(item_code="ITEM-1", company="URY Co", branch=None)
        self.assertEqual(ctx2.exception.reason_code, ROUTING_NOT_CONFIGURED)
