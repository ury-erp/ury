"""Tests for waste recording.

The recurring theme is that the *record* must survive things the stock ledger
will not tolerate. A restaurant throws away prepared dishes that were never
stock items, and it closes accounting periods — and in both cases the loss
still happened and still needs a number against it.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch

from ury.ury.doctype.ury_waste_log.ury_waste_log import URYWasteLog, _item_value

MOD = "ury.ury.doctype.ury_waste_log.ury_waste_log"


class TestWasteValuation(FrappeTestCase):

    @patch(f"{MOD}._default_warehouse", return_value="Stores - SC")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_the_bin_valuation_is_preferred(self, mock_get_value, mock_warehouse):
        """What the stock is actually carried at beats any price on the item
        master, which may be a purchase intention rather than a cost."""
        mock_get_value.return_value = 1250

        self.assertEqual(_item_value("Chicken", "Branch A"), 1250)

    @patch(f"{MOD}._default_warehouse", return_value=None)
    @patch(f"{MOD}.frappe.db.get_value")
    def test_it_falls_back_through_the_item_master(self, mock_get_value, mock_warehouse):
        mock_get_value.return_value = frappe._dict(
            valuation_rate=0, last_purchase_rate=0, standard_rate=700
        )

        self.assertEqual(_item_value("Baklava", "Branch A"), 700)

    @patch(f"{MOD}._default_warehouse", return_value=None)
    @patch(f"{MOD}.frappe.db.get_value", return_value=None)
    def test_an_unpriced_item_values_at_zero_rather_than_failing(
        self, mock_get_value, mock_warehouse
    ):
        """A dish with no cost anywhere still gets thrown away, and the row
        recording that must not be refused over a missing price."""
        self.assertEqual(_item_value("Mystery", "Branch A"), 0)


class TestStockEntryBehaviour(FrappeTestCase):

    # Built directly rather than through frappe.new_doc: new_doc calls
    # frappe.get_doc internally, which these tests patch, so the fixture
    # would be intercepted by the very mock it is meant to set up.
    def _log(self, items, stock_entry=None):
        log = URYWasteLog({
            "doctype": "URY Waste Log",
            "branch": "Branch A",
            "reason": "Spoilage",
            "posting_date": frappe.utils.today(),
            "stock_entry": stock_entry,
        })
        for row in items:
            log.append("items", row)
        return log

    @patch(f"{MOD}._is_stock_item", return_value=False)
    @patch(f"{MOD}.frappe.get_doc")
    def test_non_stock_items_produce_no_stock_entry(self, mock_get_doc, mock_is_stock):
        """Most prepared dishes are not stock items. Asking ERPNext to issue
        one fails the whole submission over a row that was never going to
        move stock."""
        log = self._log([{"item_code": "Baklava", "qty": 2, "valuation_rate": 500}])

        log.create_stock_entry()

        mock_get_doc.assert_not_called()

    @patch(f"{MOD}.frappe.msgprint")
    @patch(f"{MOD}._default_warehouse", return_value=None)
    @patch(f"{MOD}._is_stock_item", return_value=True)
    def test_a_missing_warehouse_warns_and_keeps_the_record(
        self, mock_is_stock, mock_warehouse, mock_msgprint
    ):
        log = self._log([{"item_code": "Chicken", "qty": 2, "valuation_rate": 1000}])

        log.create_stock_entry()

        mock_msgprint.assert_called_once()

    @patch(f"{MOD}.frappe.msgprint")
    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.get_doc", side_effect=Exception("period closed"))
    @patch(f"{MOD}._default_warehouse", return_value="Stores - SC")
    @patch(f"{MOD}._is_stock_item", return_value=True)
    def test_a_refused_stock_movement_never_discards_the_loss(
        self, mock_is_stock, mock_warehouse, mock_get_doc, mock_log, mock_msgprint
    ):
        """A closed period or a negative balance would otherwise hide the very
        number a manager needs."""
        log = self._log([{"item_code": "Chicken", "qty": 2, "valuation_rate": 1000}])

        log.create_stock_entry()

        mock_log.assert_called_once()
        mock_msgprint.assert_called_once()


class TestTotals(FrappeTestCase):

    @patch(f"{MOD}._item_value", return_value=250)
    def test_lines_are_valued_and_totalled(self, mock_value):
        log = URYWasteLog({"doctype": "URY Waste Log", "branch": "Branch A"})
        log.append("items", {"item_code": "Chicken", "qty": 3})
        log.append("items", {"item_code": "Rice", "qty": 2, "valuation_rate": 100})

        log.value_items()

        self.assertEqual(log.items[0].amount, 750)
        # An explicit rate on the row is kept, not overwritten: it is what the
        # stock was worth when it was written off.
        self.assertEqual(log.items[1].amount, 200)
        self.assertEqual(log.total_value, 950)
