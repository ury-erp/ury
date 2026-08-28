# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and Contributors
# See license.txt

from collections.abc import Hashable
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase


DOCTYPE = "URY Item Production Configuration"


class TestURYItemProductionConfiguration(FrappeTestCase):
    def _make_doc(self, **kwargs):
        base = {
            "doctype": DOCTYPE,
            "item": "Test Item",
            "branch": "Test Branch",
        }
        base.update(kwargs)
        return frappe.get_doc(base)

    def _patch_link_checks(self):
        def fake_exists(doctype, name=None, cache=False, *args, **kwargs):
            return True

        return patch("frappe.db.exists", side_effect=fake_exists)

    def _patch_get_value(self, values):
        real_get_value = frappe.db.get_value

        def fake_get_value(doctype, *args, **kwargs):
            name = kwargs.get("filters", args[0] if args else None)
            fieldname = kwargs.get("fieldname", args[1] if len(args) > 1 else "name")
            cache = kwargs.get("cache", args[6] if len(args) > 6 else False)

            # Frappe's own link-integrity check (Document._validate_links) calls
            # get_value(doctype, name, "name", cache=True) purely to confirm the
            # linked document exists. _patch_link_checks already stubs that
            # existence check via frappe.db.exists, so mirror the same "link is
            # always present" behaviour here instead of falling through to the
            # values dict (which is keyed for business-logic lookups, not
            # existence probes) or to a real, empty test database. Matched
            # narrowly on the exact (fieldname="name", cache=True) shape so
            # unrelated get_value calls that merely ask for a "name" field
            # (e.g. workflow lookups) are unaffected.
            if fieldname == "name" and cache and isinstance(name, str):
                return name

            if isinstance(name, Hashable):
                key = (doctype, name)
                if key in values:
                    return values[key]
            if doctype in values:
                return values[doctype]
            # Pass through anything the test doesn't care about (e.g. Frappe's
            # internal import_controller lookup for the doctype's module, or a
            # workflow lookup keyed by a dict filter) so we don't accidentally
            # break unrelated framework machinery.
            return real_get_value(doctype, *args, **kwargs)

        return patch("frappe.db.get_value", side_effect=fake_get_value)

    def test_insert_rejects_bom_item_mismatch(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Different Item", "Branch Co"),
                }
            ):
                doc = self._make_doc(bom="BOM-Test-001")

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_missing_bom_link(self):
        with self._patch_link_checks():
            with self._patch_get_value({"Branch": "Branch Co", ("BOM", "BOM-Test-001"): None}):
                doc = self._make_doc(bom="BOM-Test-001")

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_missing_linked_records_without_typeerror(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): None,
                    ("URY Production Department", "Dept-001"): None,
                    ("URY Production Unit", "Unit-001"): None,
                }
            ):
                cases = [
                    {"bom": "BOM-Test-001"},
                    {"department": "Dept-001"},
                    {"production_unit": "Unit-001"},
                ]

                for case in cases:
                    with self.subTest(case=case):
                        doc = self._make_doc(**case)
                        with self.assertRaises(frappe.ValidationError):
                            doc.insert(ignore_permissions=True)

    def test_insert_rejects_bom_missing_company_when_branch_has_company(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", None),
                }
            ):
                doc = self._make_doc(bom="BOM-Test-001")

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_bom_company_mismatch(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Other Co"),
                }
            ):
                doc = self._make_doc(bom="BOM-Test-001")

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_direct_retail_warehouse_missing_company(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("Warehouse", "Retail WH"): None,
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    direct_retail_warehouse="Retail WH",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_missing_direct_retail_warehouse_link(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("Warehouse", "Retail WH"): None,
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    direct_retail_warehouse="Retail WH",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.save(ignore_permissions=True)

    def test_insert_rejects_direct_retail_warehouse_company_mismatch(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("Warehouse", "Retail WH"): "Other Co",
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    direct_retail_warehouse="Retail WH",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_department_missing_company_when_branch_has_company(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("URY Production Department", "Dept-001"): ("Test Branch", None),
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    department="Dept-001",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_missing_department_link(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("URY Production Department", "Dept-001"): None,
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    department="Dept-001",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.save(ignore_permissions=True)

    def test_insert_rejects_department_company_mismatch(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("URY Production Department", "Dept-001"): ("Test Branch", "Other Co"),
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    department="Dept-001",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_production_unit_missing_company_when_branch_has_company(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("URY Production Department", "Dept-001"): ("Test Branch", "Branch Co"),
                    ("URY Production Unit", "Unit-001"): ("Test Branch", None),
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    department="Dept-001",
                    production_unit="Unit-001",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_missing_production_unit_link(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("URY Production Department", "Dept-001"): ("Test Branch", "Branch Co"),
                    ("URY Production Unit", "Unit-001"): None,
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    department="Dept-001",
                    production_unit="Unit-001",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.save(ignore_permissions=True)

    def test_insert_rejects_production_unit_company_mismatch(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("URY Production Department", "Dept-001"): ("Test Branch", "Branch Co"),
                    ("URY Production Unit", "Unit-001"): ("Test Branch", "Other Co"),
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    department="Dept-001",
                    production_unit="Unit-001",
                )

                with self.assertRaises(frappe.ValidationError):
                    doc.insert(ignore_permissions=True)

    def test_insert_rejects_populated_links_when_branch_has_no_company(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": None,
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("Warehouse", "Retail WH"): "Branch Co",
                    ("URY Production Department", "Dept-001"): ("Test Branch", "Branch Co"),
                    ("URY Production Unit", "Unit-001"): ("Test Branch", "Branch Co"),
                }
            ):
                cases = [
                    {"bom": "BOM-Test-001"},
                    {"direct_retail_warehouse": "Retail WH"},
                    {"department": "Dept-001"},
                    {"production_unit": "Unit-001"},
                ]

                for case in cases:
                    with self.subTest(case=case):
                        doc = self._make_doc(**case)
                        with self.assertRaises(frappe.ValidationError):
                            doc.insert(ignore_permissions=True)

    def test_insert_and_save_accept_matching_ownership(self):
        with self._patch_link_checks():
            with self._patch_get_value(
                {
                    "Branch": "Branch Co",
                    ("BOM", "BOM-Test-001"): ("Test Item", "Branch Co"),
                    ("Warehouse", "Retail WH"): "Branch Co",
                    ("URY Production Department", "Dept-001"): ("Test Branch", "Branch Co"),
                    ("URY Production Unit", "Unit-001"): ("Test Branch", "Branch Co"),
                }
            ):
                doc = self._make_doc(
                    bom="BOM-Test-001",
                    direct_retail_warehouse="Retail WH",
                    department="Dept-001",
                    production_unit="Unit-001",
                )

                inserted = doc.insert(ignore_permissions=True)
                inserted.allow_over_plan_sale = 1
                inserted.save(ignore_permissions=True)

    def test_save_revalidates_after_linked_ownership_changes(self):
        values = {
            "Branch": "Branch Co",
            ("BOM", "BOM-Test-001"): ("Test Item Revalidate", "Branch Co"),
            ("Warehouse", "Retail WH"): "Branch Co",
            ("URY Production Department", "Dept-001"): ("Test Branch", "Branch Co"),
            ("URY Production Unit", "Unit-001"): ("Test Branch", "Branch Co"),
        }

        real_get_value = frappe.db.get_value

        def fake_get_value(doctype, *args, **kwargs):
            name = kwargs.get("filters", args[0] if args else None)
            fieldname = kwargs.get("fieldname", args[1] if len(args) > 1 else "name")
            cache = kwargs.get("cache", args[6] if len(args) > 6 else False)

            # Same rationale as _patch_get_value: Frappe's link-integrity check
            # only wants to know the linked doc exists (it asks for "name" with
            # cache=True), which _patch_link_checks already guarantees via
            # frappe.db.exists. Matched narrowly so unrelated get_value calls
            # that merely ask for a "name" field (e.g. workflow lookups) are
            # unaffected.
            if fieldname == "name" and cache and isinstance(name, str):
                return name

            if isinstance(name, Hashable):
                value = values.get((doctype, name))
                if value is not None:
                    return value
            if doctype in values:
                return values.get(doctype)
            return real_get_value(doctype, *args, **kwargs)

        with self._patch_link_checks():
            with patch("frappe.db.get_value", side_effect=fake_get_value):
                # FrappeTestCase only rolls back once per class, not per test
                # method, so this doc needs an item distinct from the one used
                # in test_insert_and_save_accept_matching_ownership to avoid an
                # autoname collision on "UIPC-<item>-<branch>". Branch stays
                # "Test Branch" to match the "Test Branch" the mocked
                # Department/Production Unit ownership values expect.
                doc = self._make_doc(
                    item="Test Item Revalidate",
                    bom="BOM-Test-001",
                    direct_retail_warehouse="Retail WH",
                    department="Dept-001",
                    production_unit="Unit-001",
                )

                inserted = doc.insert(ignore_permissions=True)
                values[("URY Production Unit", "Unit-001")] = ("Test Branch", "Other Co")

                with self.assertRaises(frappe.ValidationError):
                    inserted.save(ignore_permissions=True)
