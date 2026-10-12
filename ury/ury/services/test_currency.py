from unittest import TestCase
from unittest.mock import patch

import frappe

from ury.ury.services.currency import get_default_currency

MODULE = "ury.ury.services.currency"


class TestCurrency(TestCase):
	def test_company_currency_takes_precedence_over_country(self):
		with patch(f"{MODULE}.frappe.db.get_value", return_value="USD") as get_value:
			self.assertEqual(get_default_currency("Kazakhstan Company"), "USD")
		get_value.assert_called_once_with("Company", "Kazakhstan Company", "default_currency")

	def test_persisted_site_currency_without_company(self):
		with (
			patch(f"{MODULE}.frappe.defaults.get_user_default", return_value=None),
			patch(f"{MODULE}.frappe.defaults.get_global_default", return_value="KZT"),
		):
			self.assertEqual(get_default_currency(), "KZT")

	def test_country_currency_during_setup(self):
		with (
			patch(f"{MODULE}.frappe.defaults.get_user_default", return_value=None),
			patch(f"{MODULE}.frappe.defaults.get_global_default", return_value=None),
			patch(f"{MODULE}.frappe.db.get_single_value", return_value="Kazakhstan"),
			patch(f"{MODULE}.get_country_info", return_value={"currency": "KZT"}),
		):
			self.assertEqual(get_default_currency(), "KZT")

	def test_missing_setup_does_not_invent_rupees(self):
		with (
			patch(f"{MODULE}.frappe.defaults.get_user_default", return_value=None),
			patch(f"{MODULE}.frappe.defaults.get_global_default", return_value=None),
			patch(f"{MODULE}.frappe.db.get_single_value", return_value=None),
			patch(f"{MODULE}.frappe.throw", side_effect=frappe.ValidationError),
			self.assertRaises(frappe.ValidationError),
		):
			get_default_currency()
