from __future__ import annotations

from unittest import TestCase
from unittest.mock import patch

import frappe

from ury.ury.doctype.ury_kot.ury_kot import URYKOT
from ury.ury.services.production_unit_department_migration import (
    apply_production_department_migration,
    build_production_department_migration_plan,
    resolve_production_department_for_unit,
)


class TestProductionUnitDepartmentMigration(TestCase):
    def test_dry_run_is_stable_and_preserves_source_semantics(self):
        units = [
            {
                "name": "Biryani",
                "production": "Biryani",
                "pos_profile": "POS-001",
                "branch": "Kozhikode",
                "warehouse": "Main Store - K",
            },
            {
                "name": "Desserts",
                "production": "Desserts",
                "pos_profile": "POS-001",
                "branch": "Kozhikode",
                "warehouse": "Main Store - K",
            },
        ]

        plan_one = build_production_department_migration_plan(units)
        plan_two = build_production_department_migration_plan(units)

        self.assertTrue(plan_one["dry_run"])
        self.assertEqual(plan_one["idempotency_key"], plan_two["idempotency_key"])
        self.assertEqual(
            [
                {
                    "source_name": row["source_name"],
                    "target_department_name": row["target_department_name"],
                    "branch": row["branch"],
                    "warehouse": row["warehouse"],
                    "preserve_kot_routing": row["preserve_kot_routing"],
                    "preserve_warehouse": row["preserve_warehouse"],
                }
                for row in plan_one["rows"]
            ],
            [
                {
                    "source_name": "Biryani",
                    "target_department_name": "Biryani",
                    "branch": "Kozhikode",
                    "warehouse": "Main Store - K",
                    "preserve_kot_routing": True,
                    "preserve_warehouse": True,
                },
                {
                    "source_name": "Desserts",
                    "target_department_name": "Desserts",
                    "branch": "Kozhikode",
                    "warehouse": "Main Store - K",
                    "preserve_kot_routing": True,
                    "preserve_warehouse": True,
                },
            ],
        )

    @patch("ury.ury.services.production_unit_department_migration.frappe.get_doc")
    @patch("ury.ury.services.production_unit_department_migration.frappe.get_all")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.exists")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.set_value")
    def test_apply_idempotency_key_changes_with_effective_payload(
        self, mock_set_value, mock_exists, mock_get_all, mock_get_doc
    ):
        mock_get_all.side_effect = [
            [
                {
                    "name": "Biryani",
                    "production": "Biryani",
                    "pos_profile": "POS-001",
                    "branch": "Kozhikode",
                    "warehouse": "Main Store - K",
                    "department": None,
                }
            ],
            ["Main Kitchen - CC"],
            [
                {
                    "name": "Biryani",
                    "production": "Biryani",
                    "pos_profile": "POS-001",
                    "branch": "Kozhikode",
                    "warehouse": "Main Store - K",
                    "department": None,
                }
            ],
            ["Other Kitchen - CC"],
        ]

        def exists_side_effect(doctype, filters=None):
            if doctype == "DocType":
                return True
            if doctype == "URY Production Department":
                return False
            if doctype in {"Warehouse", "Branch", "POS Profile"}:
                return True
            return False

        mock_exists.side_effect = exists_side_effect

        def get_value_side_effect(doctype, filters, fieldname, **kwargs):
            if doctype in {"Warehouse", "Branch", "POS Profile"} and fieldname == "company":
                return "Tridz Technologies Pvt. Ltd."
            return None

        mock_get_doc.side_effect = [
            type(
                "_DocA",
                (),
                {"name": "URY Production Department-0001", "insert": lambda self, ignore_permissions=False: self},
            )(),
            type(
                "_DocB",
                (),
                {"name": "URY Production Department-0002", "insert": lambda self, ignore_permissions=False: self},
            )(),
        ]

        with patch(
            "ury.ury.services.production_unit_department_migration.frappe.db.get_value",
            side_effect=get_value_side_effect,
        ):
            first_plan = apply_production_department_migration(dry_run=False)
            second_plan = apply_production_department_migration(dry_run=False)

        self.assertNotEqual(first_plan["idempotency_key"], second_plan["idempotency_key"])
        self.assertEqual(first_plan["created"], ["URY Production Department-0001"])
        self.assertEqual(second_plan["created"], ["URY Production Department-0002"])
        mock_set_value.assert_called()

    @patch("ury.ury.services.production_unit_department_migration.frappe.get_all")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.exists")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.get_value")
    def test_resolution_stays_empty_until_target_departments_exist(
        self, mock_get_value, mock_exists, mock_get_all
    ):
        mock_exists.return_value = False
        mock_get_all.return_value = [
            {
                "name": "Biryani",
                "production": "Biryani",
                "pos_profile": "POS-001",
                "branch": "Kozhikode",
                "warehouse": "Main Store - K",
            }
        ]

        self.assertIsNone(resolve_production_department_for_unit("Biryani"))

    @patch("ury.ury.services.production_unit_department_migration.frappe.get_doc")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.exists")
    def test_apply_is_noop_when_target_doctype_is_missing(self, mock_exists, mock_get_doc):
        mock_exists.return_value = False

        plan = apply_production_department_migration(dry_run=False)

        self.assertFalse(plan["applied"])
        self.assertEqual(plan["skipped_reason"], "target_doctype_missing")
        mock_get_doc.assert_not_called()

    @patch("ury.ury.services.production_unit_department_migration.frappe.get_doc")
    @patch("ury.ury.services.production_unit_department_migration.frappe.get_all")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.exists")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.get_value")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.set_value")
    def test_apply_creates_accepted_department_fields_and_is_idempotent(
        self, mock_set_value, mock_get_value, mock_exists, mock_get_all, mock_get_doc
    ):
        mock_get_all.return_value = [
            {
                "name": "Biryani",
                "production": "Biryani",
                "pos_profile": "POS-001",
                "branch": "Kozhikode",
                "warehouse": "Main Store - K",
                "department": None,
            }
        ]

        def exists_side_effect(doctype, filters=None):
            if doctype == "DocType":
                return True
            if doctype in {"Warehouse", "Branch", "POS Profile"}:
                return True
            if doctype == "URY Production Department" and filters == {"department_name": "Biryani"}:
                return False
            return False

        mock_exists.side_effect = exists_side_effect
        def get_value_side_effect(doctype, filters, fieldname, **kwargs):
            if doctype == "Warehouse" and filters == "Main Store - K" and fieldname == "company":
                return "Tridz Technologies Pvt. Ltd."
            if doctype == "Branch" and filters == "Kozhikode" and fieldname == "company":
                return "Tridz Technologies Pvt. Ltd."
            if doctype == "POS Profile" and filters == "POS-001" and fieldname == "company":
                return "Tridz Technologies Pvt. Ltd."
            if doctype == "URY Production Unit" and filters == "Biryani" and fieldname == "department":
                return None
            if doctype == "URY Production Department" and filters == {"department_name": "Biryani"} and fieldname == "name":
                return "URY Production Department-0001"
            return None

        mock_get_value.side_effect = get_value_side_effect

        def get_all_side_effect(doctype, filters=None, pluck=None, limit=None, order_by=None, **kwargs):
            if doctype == "URY Production Unit":
                return [
                    {
                        "name": "Biryani",
                        "production": "Biryani",
                        "pos_profile": "POS-001",
                        "branch": "Kozhikode",
                        "warehouse": "Main Store - K",
                        "department": None,
                    }
                ]
            if doctype == "Cost Center":
                return ["Main Kitchen - CC"]
            return []

        mock_get_all.side_effect = get_all_side_effect
        inserted_docs = []

        class _InsertedDoc:
            name = "URY Production Department-0001"

            def insert(self, ignore_permissions=False):
                return self

        def get_doc_side_effect(*args):
            if len(args) == 1 and isinstance(args[0], dict):
                payload = args[0]
                inserted_docs.append(payload)
                return _InsertedDoc()
            raise AssertionError(f"Unexpected payload: {args!r}")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_set_value.side_effect = lambda *args, **kwargs: None

        plan = apply_production_department_migration(dry_run=False)

        self.assertTrue(plan["applied"])
        self.assertEqual(plan["created"], ["URY Production Department-0001"])
        self.assertEqual(plan["skipped"], [])
        self.assertEqual(
            [call.args[2] for call in mock_set_value.call_args_list],
            ["department"],
        )
        mock_set_value.assert_called_once_with(
            "URY Production Unit",
            "Biryani",
            "department",
            "URY Production Department-0001",
            update_modified=False,
        )
        self.assertEqual(inserted_docs, [
            {
                "doctype": "URY Production Department",
                "department_name": "Biryani",
                "enabled": 1,
                "company": "Tridz Technologies Pvt. Ltd.",
                "branch": "Kozhikode",
                "department_warehouse": "Main Store - K",
                "cost_center": "Main Kitchen - CC",
                "issue_policy": "Plan Controlled",
            }
        ])
        mock_get_doc.reset_mock()
        mock_set_value.reset_mock()
        mock_exists.side_effect = lambda doctype, filters=None: True
        mock_get_value.side_effect = lambda doctype, filters, fieldname, **kwargs: (
            "URY Production Department-0001"
            if doctype == "URY Production Unit" and filters == "Biryani" and fieldname == "department"
            else "URY Production Department-0001"
            if doctype == "URY Production Department" and filters == {"department_name": "Biryani"} and fieldname == "name"
            else "Tridz Technologies Pvt. Ltd."
            if doctype in {"Warehouse", "Branch", "POS Profile"} and fieldname == "company"
            else None
        )

        second_plan = apply_production_department_migration(dry_run=False)

        self.assertTrue(second_plan["applied"])
        self.assertEqual(second_plan["created"], ["URY Production Department-0001"])
        self.assertEqual(second_plan["skipped"], [])
        mock_set_value.assert_not_called()

    @patch("ury.ury.services.production_unit_department_migration.frappe.get_doc")
    @patch("ury.ury.services.production_unit_department_migration.frappe.get_all")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.exists")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.set_value")
    def test_apply_skips_when_company_is_missing_or_ambiguous(
        self, mock_set_value, mock_exists, mock_get_all, mock_get_doc
    ):
        def exists_side_effect(doctype, filters=None):
            if doctype == "DocType":
                return True
            if doctype == "URY Production Department":
                return False
            return True

        mock_exists.side_effect = exists_side_effect
        mock_get_all.return_value = [
            {
                "name": "Biryani",
                "production": "Biryani",
                "pos_profile": "POS-001",
                "branch": "Kozhikode",
                "warehouse": "Main Store - K",
                "department": None,
            }
        ]

        def get_value_side_effect(doctype, filters, fieldname, **kwargs):
            if doctype == "Warehouse" and filters == "Main Store - K":
                return None
            if doctype == "Branch" and filters == "Kozhikode":
                return None
            if doctype == "POS Profile" and filters == "POS-001":
                return None
            return None

        mock_get_doc.side_effect = AssertionError("No department should be created")
        with patch(
            "ury.ury.services.production_unit_department_migration.frappe.db.get_value",
            side_effect=get_value_side_effect,
        ):
            plan = apply_production_department_migration(dry_run=False)

        self.assertTrue(plan["applied"])
        self.assertEqual(plan["created"], [])
        self.assertEqual(plan["skipped"], ["Biryani"])
        mock_get_doc.assert_not_called()
        mock_set_value.assert_not_called()

    def test_kot_routing_still_reads_printers_from_production_unit(self):
        # frappe.model.document.Document.__init__ requires a doctype dict (or
        # a doctype/name pair to load from the DB) -- a bare call isn't a
        # valid constructor signature. Pass a minimal in-memory dict so no DB
        # lookup happens for this unit test.
        kot = URYKOT({"doctype": "URY KOT"})
        kot.name = "KOT-0001"
        kot.pos_profile = "POS-001"
        kot.production = "Biryani"
        kot.restaurant_table = None
        kot.table_takeaway = 0

        production_unit_printer_rows = [
            frappe._dict(
                {"printer": "Kitchen Printer", "custom_kot_print_format": "KOT", "custom_kot_print": 1}
            )
        ]

        def get_all_side_effect(doctype, filters=None, **kwargs):
            # multi_print_kot's frappe.db.get_all(...) call for the POS
            # Profile printers is implemented as a thin wrapper around this
            # same frappe.get_all, so patching it unconditionally would also
            # feed the mocked rows into that unrelated lookup and double the
            # print. Only return rows for the "URY Production Unit" lookup
            # this test is actually about.
            if filters and filters.get("parenttype") == "URY Production Unit":
                return production_unit_printer_rows
            return []

        with patch(
            "ury.ury.doctype.ury_kot.ury_kot.frappe.get_all",
            # multi_print_kot accesses attributes like
            # printer.custom_block_takeaway_kot on each row, matching how a
            # real frappe.get_all(...) call returns frappe._dict rows -- a
            # plain dict here would raise AttributeError.
            side_effect=get_all_side_effect,
        ) as mock_get_all, patch(
            "ury.ury.doctype.ury_kot.ury_kot.print_by_server"
        ) as mock_print_by_server:
            kot.multi_print_kot()

        mock_get_all.assert_any_call(
            "URY Printer Settings",
            fields=["printer", "custom_kot_print_format", "custom_kot_print", "custom_block_takeaway_kot"],
            filters={"parent": "Biryani", "custom_kot_print": 1, "parenttype": "URY Production Unit"},
            order_by="idx",
        )
        mock_print_by_server.assert_called_once_with("URY KOT", "KOT-0001", "Kitchen Printer", "KOT")

    @patch("ury.ury.services.production_unit_department_migration.frappe.get_doc")
    @patch("ury.ury.services.production_unit_department_migration.frappe.get_all")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.exists")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.get_value")
    @patch("ury.ury.services.production_unit_department_migration.frappe.db.set_value")
    def test_apply_skips_when_cost_center_is_missing_or_ambiguous(
        self, mock_set_value, mock_get_value, mock_exists, mock_get_all, mock_get_doc
    ):
        def exists_side_effect(doctype, filters=None):
            if doctype == "DocType":
                return True
            if doctype == "URY Production Department":
                return False
            return True

        mock_exists.side_effect = exists_side_effect
        mock_get_all.side_effect = [
            [
                {
                    "name": "Biryani",
                    "production": "Biryani",
                    "pos_profile": "POS-001",
                    "branch": "Kozhikode",
                    "warehouse": "Main Store - K",
                    "department": None,
                }
            ],
            ["CC-1", "CC-2"],
        ]
        mock_get_value.side_effect = lambda doctype, filters, fieldname, **kwargs: (
            "Tridz Technologies Pvt. Ltd." if doctype in {"Warehouse", "Branch", "POS Profile"} else None
        )

        plan = apply_production_department_migration(dry_run=False)

        self.assertTrue(plan["applied"])
        self.assertEqual(plan["created"], [])
        self.assertEqual(plan["skipped"], ["Biryani"])
        mock_get_doc.assert_not_called()
        mock_set_value.assert_not_called()
