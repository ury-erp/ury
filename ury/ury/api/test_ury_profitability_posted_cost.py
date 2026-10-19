import unittest
from unittest.mock import patch

from ury.ury.api.ury_profitability_posted_cost import load_posted_costs


MOD = "ury.ury.api.ury_profitability_posted_cost"


class TestPostedCostEvidence(unittest.TestCase):
	def setUp(self):
		self.lines = [{"parent": "INV-1", "item_code": "Burger", "qty": 2}]
		self.postings = [self.posting("SE-1", 1, 10), self.posting("SE-2", 1, 12)]

	def posting(self, reference, qty, cost, invoice="INV-1"):
		return {"invoice": invoice, "item_code": "Burger", "qty": qty,
			"posting_reference": reference, "posted_cost": cost}

	def costs(self, postings=None, links=None):
		postings = self.postings if postings is None else postings
		links = links if links is not None else [{"posting_reference": row["posting_reference"]} for row in postings]
		with patch(f"{MOD}._read_postings", return_value=postings) as read:
			with patch(f"{MOD}.frappe.get_all", return_value=links):
				costs = load_posted_costs("URY UAE", "URY Barsha", self.lines)
		read.assert_called_once_with("URY UAE", "URY Barsha", {"INV-1"})
		return costs

	def test_sums_multiple_fulfilments_for_one_invoice_item(self):
		self.assertEqual(self.costs(), {("INV-1", "Burger"): 22.0})

	def test_partial_posting_does_not_appear_as_full_cost(self):
		self.assertEqual(self.costs(self.postings[:1]), {})

	def test_overfulfilled_quantity_is_not_attributed(self):
		self.assertEqual(self.costs([self.posting("SE-1", 3, 30)]), {})

	def test_same_item_on_another_invoice_is_not_used(self):
		self.assertEqual(self.costs([self.posting("SE-1", 2, 20, invoice="INV-2")]), {})

	def test_shared_stock_entry_is_not_charged_twice(self):
		self.assertEqual(self.costs(
			[self.posting("SE-1", 2, 20)],
			links=[{"posting_reference": "SE-1"}, {"posting_reference": "SE-1"}],
		), {})

	def test_actual_zero_cost_is_present(self):
		self.assertEqual(self.costs([self.posting("SE-1", 2, 0)]), {("INV-1", "Burger"): 0.0})

	def test_returns_are_not_costed_from_positive_fulfilments(self):
		self.lines[0]["qty"] = -2
		self.assertEqual(self.costs(), {})
