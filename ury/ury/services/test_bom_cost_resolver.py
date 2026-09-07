"""Unit tests for BOM cost resolver utilities."""

from __future__ import annotations

from unittest import TestCase
from unittest.mock import MagicMock, patch

from ury.ury.services.bom_cost_resolver import (
	resolve_item_cost,
	resolve_product_bundle_cost,
)


class TestResolveBOMCost(TestCase):
	"""Test BOM cost resolution logic."""

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_simple_item_without_bom(self, mock_frappe):
		"""Resolve cost for a simple item with only Item Price entry."""
		mock_frappe.db.get_all.side_effect = [
			# First call: no BOM found
			[],
			# Second call: Item Price found
			[MagicMock(price_list_rate=100.0)],
		]

		result = resolve_item_cost('ITEM001', 'BUY-LIST')

		self.assertEqual(result['cost'], 100.0)
		self.assertEqual(result['unset_items'], [])
		self.assertTrue(result['complete'])

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_simple_item_with_qty_multiplier(self, mock_frappe):
		"""Resolve cost with quantity multiplier."""
		mock_frappe.db.get_all.side_effect = [
			# First call: no BOM found
			[],
			# Second call: Item Price found
			[MagicMock(price_list_rate=100.0)],
		]

		result = resolve_item_cost('ITEM001', 'BUY-LIST', qty=2.5)

		self.assertEqual(result['cost'], 250.0)
		self.assertEqual(result['unset_items'], [])
		self.assertTrue(result['complete'])

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_missing_item_price(self, mock_frappe):
		"""Handle item with no price in price list."""
		mock_frappe.db.get_all.side_effect = [
			# First call: no BOM found
			[],
			# Second call: no Item Price found
			[],
		]
		mock_frappe.db.get_value.return_value = 'Item Name 001'

		result = resolve_item_cost('ITEM001', 'BUY-LIST')

		self.assertEqual(result['cost'], 0)
		self.assertIn('Item Name 001', result['unset_items'])
		self.assertFalse(result['complete'])

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_single_level_bom(self, mock_frappe):
		"""Resolve cost for item with a BOM containing simple items."""
		bom_mock = MagicMock()
		bom_item_1 = MagicMock(item_code='COMP1', qty=2)
		bom_item_2 = MagicMock(item_code='COMP2', qty=3)
		bom_mock.items = [bom_item_1, bom_item_2]
		bom_mock.quantity = 1

		mock_frappe.db.get_all.side_effect = [
			# First call: BOM found for main item
			[MagicMock(name='BOM001')],
			# Second call: no BOM for COMP1
			[],
			# Third call: Item Price for COMP1
			[MagicMock(price_list_rate=50.0)],
			# Fourth call: no BOM for COMP2
			[],
			# Fifth call: Item Price for COMP2
			[MagicMock(price_list_rate=75.0)],
		]
		mock_frappe.get_doc.return_value = bom_mock

		result = resolve_item_cost('ITEM001', 'BUY-LIST')

		# Expected cost: (50 * 2) + (75 * 3) = 100 + 225 = 325, divided by qty 1 = 325
		self.assertEqual(result['cost'], 325.0)
		self.assertEqual(result['unset_items'], [])
		self.assertTrue(result['complete'])

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_bom_with_non_unity_output_qty(self, mock_frappe):
		"""Resolve BOM cost when BOM output is not 1 unit."""
		bom_mock = MagicMock()
		bom_item = MagicMock(item_code='COMP1', qty=2)
		bom_mock.items = [bom_item]
		bom_mock.quantity = 4  # BOM outputs 4 units

		mock_frappe.db.get_all.side_effect = [
			# First call: BOM found
			[MagicMock(name='BOM001')],
			# Second call: no BOM for component
			[],
			# Third call: Item Price for component
			[MagicMock(price_list_rate=100.0)],
		]
		mock_frappe.get_doc.return_value = bom_mock

		result = resolve_item_cost('ITEM001', 'BUY-LIST')

		# Expected: (100 * 2) / 4 = 200 / 4 = 50 per unit
		self.assertEqual(result['cost'], 50.0)

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_depth_limit_prevents_infinite_recursion(self, mock_frappe):
		"""Depth limiting prevents recursion beyond max_depth."""
		bom_mock = MagicMock()
		bom_item = MagicMock(item_code='COMP1', qty=1)
		bom_mock.items = [bom_item]
		bom_mock.quantity = 1

		# Set up mocks so that at max_depth, we stop recursing and look up Item Price
		call_count = [0]

		def get_all_side_effect(*args, **kwargs):
			call_count[0] += 1
			if kwargs.get('filters', {}).get('item') == 'COMP1' and call_count[0] > 1:
				# After recursion, no BOM should be returned to avoid further recursion
				return []
			if kwargs.get('filters', {}).get('item') == 'ITEM001':
				return [MagicMock(name='BOM001')]
			if kwargs.get('filters', {}).get('item_code') == 'COMP1':
				# Item Price lookup
				return [MagicMock(price_list_rate=200.0)]
			return []

		mock_frappe.db.get_all.side_effect = get_all_side_effect
		mock_frappe.get_doc.return_value = bom_mock

		result = resolve_item_cost('ITEM001', 'BUY-LIST', max_depth=2)

		# Should find the price for COMP1 even though it might have a BOM (due to depth limit)
		self.assertTrue(result['cost'] > 0)

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_product_bundle_simple(self, mock_frappe):
		"""Resolve cost for product bundle with simple items."""
		bundle_mock = MagicMock()
		bundle_item_1 = MagicMock(item_code='ITEM1', qty=2)
		bundle_item_2 = MagicMock(item_code='ITEM2', qty=3)
		bundle_mock.items = [bundle_item_1, bundle_item_2]

		def get_all_side_effect(*args, **kwargs):
			# Product bundle lookup
			if kwargs.get('filters', {}).get('new_item_code') == 'BUNDLE':
				return [MagicMock(name='PB001')]
			# No BOMs for bundle items
			if kwargs.get('filters', {}).get('item'):
				return []
			# Item Price lookups
			if kwargs.get('filters', {}).get('item_code') == 'ITEM1':
				return [MagicMock(price_list_rate=50.0)]
			if kwargs.get('filters', {}).get('item_code') == 'ITEM2':
				return [MagicMock(price_list_rate=75.0)]
			return []

		mock_frappe.db.get_all.side_effect = get_all_side_effect
		mock_frappe.get_doc.return_value = bundle_mock

		result = resolve_product_bundle_cost('BUNDLE', 'BUY-LIST')

		# Expected: (50 * 2) + (75 * 3) = 100 + 225 = 325
		self.assertEqual(result['cost'], 325.0)
		self.assertEqual(result['unset_items'], [])
		self.assertTrue(result['complete'])

	@patch('ury.ury.services.bom_cost_resolver.frappe')
	def test_product_bundle_with_missing_item(self, mock_frappe):
		"""Handle product bundle when one item lacks a price."""
		bundle_mock = MagicMock()
		bundle_item_1 = MagicMock(item_code='ITEM1', qty=2)
		bundle_item_2 = MagicMock(item_code='ITEM2', qty=3)
		bundle_mock.items = [bundle_item_1, bundle_item_2]

		def get_all_side_effect(*args, **kwargs):
			# Product bundle lookup
			if kwargs.get('filters', {}).get('new_item_code') == 'BUNDLE':
				return [MagicMock(name='PB001')]
			# No BOMs for bundle items
			if kwargs.get('filters', {}).get('item'):
				return []
			# Item Price lookup for ITEM1 succeeds, ITEM2 fails
			if kwargs.get('filters', {}).get('item_code') == 'ITEM1':
				return [MagicMock(price_list_rate=50.0)]
			if kwargs.get('filters', {}).get('item_code') == 'ITEM2':
				return []
			return []

		mock_frappe.db.get_all.side_effect = get_all_side_effect
		mock_frappe.db.get_value.return_value = 'Item Two'
		mock_frappe.get_doc.return_value = bundle_mock

		result = resolve_product_bundle_cost('BUNDLE', 'BUY-LIST')

		# Partial cost (only ITEM1)
		self.assertEqual(result['cost'], 100.0)
		self.assertIn('Item Two', result['unset_items'])
		self.assertFalse(result['complete'])
