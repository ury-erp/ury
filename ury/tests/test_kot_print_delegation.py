# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import MagicMock, patch
import frappe
from ury.ury.doctype.ury_kot.ury_kot import URYKOT


class TestKOTPrintDelegation(unittest.TestCase):
    def setUp(self):
        frappe.flags.in_test = True

    @patch("ury.ury.doctype.ury_kot.ury_kot.URYKOT.multi_print_kot")
    @patch("ury.ury.doctype.ury_kot.ury_kot.URYKOT.kotDisplayRealtime")
    def test_on_submit_bypasses_multi_print_when_grillax_installed(self, mock_display, mock_multi_print):
        kot = URYKOT({"doctype": "URY KOT", "name": "KOT-001"})

        with patch("frappe.get_installed_apps", return_value=["frappe", "erpnext", "ury", "grillax"]):
            kot.on_submit()
            mock_multi_print.assert_not_called()
            mock_display.assert_called_once()

    @patch("ury.ury.doctype.ury_kot.ury_kot.URYKOT.multi_print_kot")
    @patch("ury.ury.doctype.ury_kot.ury_kot.URYKOT.kotDisplayRealtime")
    def test_on_submit_executes_multi_print_when_standalone_ury(self, mock_display, mock_multi_print):
        kot = URYKOT({"doctype": "URY KOT", "name": "KOT-002"})

        with patch("frappe.get_installed_apps", return_value=["frappe", "erpnext", "ury"]):
            kot.on_submit()
            mock_multi_print.assert_called_once()
            mock_display.assert_called_once()
