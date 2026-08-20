from unittest.mock import MagicMock, patch
import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_order.ury_order import split_bill


class TestURYOrder(FrappeTestCase):
    def test_split_bill_by_item_code_or_item_name(self):
        """Test split_bill successfully matches items when frontend passes item_code or item_name instead of child row name."""
        mock_invoice = MagicMock()
        mock_invoice.name = "AC-2026-00100"
        mock_invoice.docstatus = 0
        mock_invoice.company = "Test Restaurant"
        mock_invoice.currency = "INR"
        mock_invoice.conversion_rate = 1.0
        mock_invoice.get.side_effect = lambda k, default=None: "SPLIT-GRP-001" if k in ["custom_split_group", "name"] else default

        item1 = MagicMock()
        item1.name = "row_id_111"
        item1.item_code = "ALEPPEY FISH MOLLY"
        item1.item_name = "ALEPPEY FISH MOLLY"
        item1.qty = 1
        item1.rate = 380
        item1.amount = 380

        item2 = MagicMock()
        item2.name = "row_id_222"
        item2.item_code = "AMERICAN CHOPSOEY"
        item2.item_name = "AMERICAN CHOPSOEY"
        item2.qty = 1
        item2.rate = 378
        item2.amount = 378

        mock_invoice.items = [item1, item2]

        def fake_get_doc(dt, name=None):
            if dt == "POS Invoice":
                if name == "AC-2026-00101":
                    return new_doc_mock
                return mock_invoice
            return MagicMock()

        items_list = []
        new_doc_mock = frappe._dict(
            name="AC-2026-00101",
            items=items_list,
            docstatus=0,
            company="Test Restaurant",
            currency="INR",
            conversion_rate=1.0,
            set=lambda k, v: None,
            insert=lambda: None,
            save=lambda: None,
            set_missing_values=lambda: None,
            run_method=lambda *a, **kw: None,
            reload=lambda *a, **kw: None,
            calculate_taxes_and_totals=lambda: None,
            append=lambda k, v: items_list.append(v),
        )

        with patch("frappe.get_doc", side_effect=fake_get_doc), \
             patch("frappe.new_doc", return_value=new_doc_mock), \
             patch("frappe.db.set_value"), \
             patch("frappe.publish_realtime"):
            # Test split by item_name / item_code
            items_to_move = [{"name": "ALEPPEY FISH MOLLY", "qty": 1}]
            res = split_bill(
                source_invoice="AC-2026-00100",
                items_to_move=items_to_move,
            )

            # Assert new invoice created and item appended
            self.assertEqual(res["source_invoice"], "AC-2026-00100")
            self.assertEqual(res["new_invoice"], "AC-2026-00101")
            self.assertEqual(len(items_list), 1)

    def test_split_bill_by_row_name(self):
        """Test split_bill successfully matches items when frontend passes child table row name."""
        mock_invoice = MagicMock()
        mock_invoice.name = "AC-2026-00100"
        mock_invoice.docstatus = 0
        mock_invoice.company = "Test Restaurant"
        mock_invoice.currency = "INR"
        mock_invoice.conversion_rate = 1.0
        mock_invoice.get.side_effect = lambda k, default=None: "SPLIT-GRP-001" if k in ["custom_split_group", "name"] else default

        item1 = MagicMock()
        item1.name = "row_id_111"
        item1.item_code = "ALEPPEY FISH MOLLY"
        item1.item_name = "ALEPPEY FISH MOLLY"
        item1.qty = 1
        item1.rate = 380

        item2 = MagicMock()
        item2.name = "row_id_222"
        item2.item_code = "AMERICAN CHOPSOEY"
        item2.item_name = "AMERICAN CHOPSOEY"
        item2.qty = 1
        item2.rate = 378

        mock_invoice.items = [item1, item2]

        items_list = []
        new_doc_mock = frappe._dict(
            name="AC-2026-00101",
            items=items_list,
            docstatus=0,
            company="Test Restaurant",
            currency="INR",
            conversion_rate=1.0,
            set=lambda k, v: None,
            insert=lambda: None,
            save=lambda: None,
            set_missing_values=lambda: None,
            run_method=lambda *a, **kw: None,
            reload=lambda *a, **kw: None,
            calculate_taxes_and_totals=lambda: None,
            append=lambda k, v: items_list.append(v),
        )

        def fake_get_doc(dt, name=None):
            if dt == "POS Invoice":
                if name == "AC-2026-00101":
                    return new_doc_mock
                return mock_invoice
            return MagicMock()

        with patch("frappe.get_doc", side_effect=fake_get_doc), \
             patch("frappe.new_doc", return_value=new_doc_mock), \
             patch("frappe.db.set_value"), \
             patch("frappe.publish_realtime"):
            # Test split by exact row name
            items_to_move = [{"name": "row_id_111", "qty": 1}]
            res = split_bill(
                source_invoice="AC-2026-00100",
                items_to_move=items_to_move,
            )

            self.assertEqual(res["source_invoice"], "AC-2026-00100")
            self.assertEqual(res["new_invoice"], "AC-2026-00101")
            self.assertGreaterEqual(len(items_list), 1)
