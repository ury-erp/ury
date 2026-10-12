# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Test for URYDailyPandL.get_proft_loss_details() (COVERAGE_GAP_ANALYSIS.md
Table 1: "P&L financial calculation", HIGH -- Top 15 item #8, note the
pre-existing typo in the function name is intentional/load-bearing and must
not be "fixed" without a matching JS/API-caller update). Mocked per this
track's read-path convention: `frappe.render_template` is a pure
read+format call over the doc's own already-computed fields, no DB write.
"""

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l import URYDailyPandL

MODULE = "ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l"


class TestGetProftLossDetails(FrappeTestCase):
	def test_renders_template_with_branch_company_currency(self):
		doc = URYDailyPandL({"doctype": "URY Daily P and L"})
		doc.net_profit = 1234.56
		doc.branch = "Kazakhstan Branch"

		with (
			patch(f"{MODULE}.frappe.db.get_value", return_value="Kazakhstan Company"),
			patch("ury.ury.services.currency.get_default_currency", return_value="KZT") as currency,
			patch(f"{MODULE}.frappe.render_template", return_value="<html>rendered</html>") as mock_render,
		):
			result = doc.get_proft_loss_details()

		currency.assert_called_once_with("Kazakhstan Company")
		mock_render.assert_called_once_with(
			"ury/doctype/ury_daily_p_and_l/profit_loss_details.html",
			{"data": doc, "currency": "KZT"},
		)
		self.assertEqual(result, "<html>rendered</html>")
