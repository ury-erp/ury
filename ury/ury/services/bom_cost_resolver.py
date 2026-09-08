"""BOM (Bill of Materials) and Product Bundle cost resolution utilities.

Provides recursive cost calculation for items with active BOMs or product bundles,
enabling reuse across multiple reports (food cost, product categorization, etc).
"""

from __future__ import annotations

from typing import Any

try:
	import frappe
except ModuleNotFoundError:  # pragma: no cover - allows host-side unit tests
	class _StubDB:
		def exists(self, *args: Any, **kwargs: Any) -> bool:
			return False

		def get_value(self, *args: Any, **kwargs: Any) -> Any:
			return None

		def get_all(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
			return []

	class _StubFrappe:
		db = _StubDB()

		def get_all(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
			return []

		def get_doc(self, *args: Any, **kwargs: Any) -> Any:
			raise ModuleNotFoundError("frappe is not available in this host test environment")

	frappe = _StubFrappe()


def resolve_item_cost(
	item_code: str,
	price_list: str,
	qty: float = 1.0,
	max_depth: int = 2,
) -> dict[str, Any]:
	"""Resolve the total cost of an item, considering BOM or product bundle structure.

	Recursively walks through BOMs and product bundles up to max_depth levels,
	accumulating costs from leaf-level item prices.

	Args:
		item_code: The item code to resolve cost for.
		price_list: The price list (typically buying price list) to use for lookups.
		qty: Quantity multiplier for the item (default 1.0).
		max_depth: Maximum recursion depth for BOM traversal (default 2 limits to parent + 1 child BOM).

	Returns:
		Dict with:
			- cost: float - calculated cost per unit (or total for qty > 1)
			- unset_items: list[str] - item names that lacked prices and were skipped
			- complete: bool - whether all items had prices resolved
	"""
	result = _resolve_cost_recursive(item_code, price_list, depth=0, max_depth=max_depth)
	result['cost'] = result.get('cost', 0) * qty
	return result


def _resolve_cost_recursive(
	item_code: str,
	price_list: str,
	depth: int = 0,
	max_depth: int = 2,
) -> dict[str, Any]:
	"""Internal recursive cost resolver.

	Depth-limited to prevent infinite loops. Depth >= max_depth only looks up Item Price.
	"""
	unset_items: list[str] = []

	# Check for BOM first (active, default, submitted)
	boms = frappe.db.get_all(
		"BOM",
		fields=("*"),
		filters={
			'item': item_code,
			'is_active': 1,
			'is_default': 1,
			'docstatus': 1,
		},
	)

	if len(boms) > 0 and depth < max_depth:
		# This item has an active BOM; resolve it recursively
		bom_cost = 0
		bom = frappe.get_doc("BOM", boms[0].name)

		for bom_item in bom.items:
			item_result = _resolve_cost_recursive(
				bom_item.item_code,
				price_list,
				depth=depth + 1,
				max_depth=max_depth,
			)
			bom_cost += item_result['cost'] * bom_item.qty
			unset_items.extend(item_result.get('unset_items', []))

		# BOM cost is per unit of BOM output; normalize by BOM quantity
		cost_per_unit = bom_cost / bom.quantity if bom.quantity else 0

		return {
			'cost': cost_per_unit,
			'unset_items': unset_items,
			'complete': len(unset_items) == 0,
		}

	# No BOM (or depth exhausted); look up Item Price
	item_prices = frappe.db.get_all(
		"Item Price",
		fields=['name', 'price_list_rate'],
		filters={
			'price_list': price_list,
			'item_code': item_code,
		},
	)

	if len(item_prices) > 0:
		return {
			'cost': float(item_prices[0].price_list_rate),
			'unset_items': unset_items,
			'complete': True,
		}

	# No price found; mark as unset
	item_doc = frappe.db.get_value("Item", item_code, "item_name") or item_code
	unset_items.append(str(item_doc))

	return {
		'cost': 0,
		'unset_items': unset_items,
		'complete': False,
	}


def resolve_product_bundle_cost(
	bundle_item_code: str,
	price_list: str,
	max_depth: int = 2,
) -> dict[str, Any]:
	"""Resolve the total cost of a product bundle.

	Sums up costs of all items in the bundle, using resolve_item_cost for each.

	Args:
		bundle_item_code: The product bundle item code.
		price_list: The price list to use for cost lookups.
		max_depth: Maximum recursion depth for BOM traversal within bundle items.

	Returns:
		Dict with:
			- cost: float - total cost of the bundle
			- unset_items: list[str] - item names that lacked prices
			- complete: bool - whether all bundle items resolved successfully
	"""
	bundle_cost = 0
	all_unset: list[str] = []
	all_complete = True

	# Fetch the product bundle definition
	pb_docs = frappe.db.get_all(
		"Product Bundle",
		fields=("*"),
		filters={'new_item_code': bundle_item_code},
	)

	if len(pb_docs) == 0:
		return {
			'cost': 0,
			'unset_items': [bundle_item_code],
			'complete': False,
		}

	pb = frappe.get_doc("Product Bundle", pb_docs[0].name)

	for pb_item in pb.items:
		item_result = resolve_item_cost(
			pb_item.item_code,
			price_list,
			qty=pb_item.qty,
			max_depth=max_depth,
		)
		bundle_cost += item_result['cost']
		all_unset.extend(item_result.get('unset_items', []))
		if not item_result.get('complete', True):
			all_complete = False

	return {
		'cost': bundle_cost,
		'unset_items': all_unset,
		'complete': all_complete,
	}
