import frappe
from frappe.tests.utils import FrappeTestCase


DOCTYPE = "URY Commission Settings"


class TestURYCommissionSettings(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def _make_settings(self, **kwargs):
		base = {
			"doctype": DOCTYPE,
		}
		base.update(kwargs)
		return frappe.get_doc(base)

	def test_default_rate_below_zero_fails(self):
		doc = self._make_settings(default_rate=-1)
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_default_rate_above_100_fails(self):
		doc = self._make_settings(default_rate=101)
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_default_rate_zero_passes(self):
		doc = self._make_settings(default_rate=0)
		doc.validate()

	def test_default_rate_100_passes(self):
		doc = self._make_settings(default_rate=100)
		doc.validate()

	def test_default_rate_50_passes(self):
		doc = self._make_settings(default_rate=50)
		doc.validate()

	def test_default_rate_none_passes(self):
		doc = self._make_settings(default_rate=None)
		doc.validate()

	def test_duplicate_branch_designation_employee_fails(self):
		rule1 = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "Designation1",
			"employee": "Employee1",
			"rate_type": "Flat",
			"rate": 10,
		})
		rule2 = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "Designation1",
			"employee": "Employee1",
			"rate_type": "Flat",
			"rate": 20,
		})
		doc = self._make_settings(rules=[rule1, rule2])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_empty_branch_designation_employee_allowed(self):
		rule1 = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "",
			"designation": "",
			"employee": "",
			"rate_type": "Flat",
			"rate": 10,
		})
		rule2 = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "",
			"designation": "",
			"employee": "",
			"rate_type": "Flat",
			"rate": 20,
		})
		doc = self._make_settings(rules=[rule1, rule2])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_flat_rate_below_zero_fails(self):
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Flat",
			"rate": -1,
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_flat_rate_above_100_fails(self):
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Flat",
			"rate": 101,
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_flat_rate_50_passes(self):
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Flat",
			"rate": 50,
		})
		doc = self._make_settings(rules=[rule])
		doc.validate()

	def test_tiered_rule_with_no_tiers_fails(self):
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Tiered",
			"tiers": [],
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_tiered_rule_first_tier_not_starting_at_zero_fails(self):
		tier = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 100,
			"rate": 10,
		})
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Tiered",
			"tiers": [tier],
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_tiered_rule_non_ascending_tier_amounts_fails(self):
		tier1 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 0,
			"rate": 10,
		})
		tier2 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 500,
			"rate": 15,
		})
		tier3 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 400,
			"rate": 20,
		})
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Tiered",
			"tiers": [tier1, tier2, tier3],
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_tiered_rule_duplicate_tier_amounts_fails(self):
		tier1 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 0,
			"rate": 10,
		})
		tier2 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 500,
			"rate": 15,
		})
		tier3 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 500,
			"rate": 20,
		})
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Tiered",
			"tiers": [tier1, tier2, tier3],
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_tiered_rule_tier_rate_below_zero_fails(self):
		tier = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 0,
			"rate": -1,
		})
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Tiered",
			"tiers": [tier],
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_tiered_rule_tier_rate_above_100_fails(self):
		tier = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 0,
			"rate": 101,
		})
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Tiered",
			"tiers": [tier],
		})
		doc = self._make_settings(rules=[rule])
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_valid_tiered_rule_with_multiple_tiers_passes(self):
		tier1 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 0,
			"rate": 10,
		})
		tier2 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 1000,
			"rate": 15,
		})
		tier3 = frappe.get_doc({
			"doctype": "URY Commission Tier",
			"from_amount": 5000,
			"rate": 20,
		})
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Tiered",
			"tiers": [tier1, tier2, tier3],
		})
		doc = self._make_settings(rules=[rule])
		doc.validate()

	def test_valid_config_with_multiple_rules_passes(self):
		rule1 = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch1",
			"designation": "",
			"employee": "",
			"rate_type": "Flat",
			"rate": 10,
		})
		rule2 = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "Branch2",
			"designation": "Designation1",
			"employee": "",
			"rate_type": "Flat",
			"rate": 15,
		})
		rule3 = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "",
			"designation": "",
			"employee": "Employee1",
			"rate_type": "Flat",
			"rate": 20,
		})
		doc = self._make_settings(
			enabled=1,
			commission_base="Net Sales",
			include_returns=1,
			attribution_mode="Opener",
			default_rate=5,
			tier_period="Monthly",
			rules=[rule1, rule2, rule3],
		)
		doc.validate()

	def test_valid_single_flat_rule_passes(self):
		rule = frappe.get_doc({
			"doctype": "URY Commission Rule",
			"branch": "",
			"designation": "",
			"employee": "",
			"rate_type": "Flat",
			"rate": 50,
		})
		doc = self._make_settings(default_rate=10, rules=[rule])
		doc.validate()
