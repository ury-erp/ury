"""Stock-on-hand data for the Requirements page.

This module provides read-only access to current stock quantities and valuation
for items on an approved Sales Plan, so the Requirements page can display:
- "In store" quantity per material line
- "Cover" (required_qty / in_store_qty) per material line
- "Material value" (sum of required_qty * valuation_rate across all lines)
- "To purchase" (sum of short_qty * valuation_rate across all lines)

It resolves warehouse locations per item based on:
1. The item's department warehouse (if configured in URY Production Department)
2. Fallback to the branch's central POS Profile warehouse (if configured)
3. Returns `resolved_from: null` (no warehouse could be resolved) so the frontend
   can render "Not available" rather than fabricate a zero quantity.

See RequirementsPage.tsx (line 21-42) for why honest "Not available" is
preferred over invented numbers when warehouse data is missing.
"""

import hashlib
import json

import frappe
from frappe.utils import parse_json

from ury.ury.api.ury_inventory_projection import get_allocatable_qty
from ury.ury.report_api.utils import require_manager


@frappe.whitelist(methods=["GET"])
def get_plan_stock_on_hand(branch=None, items=None):
	"""Return stock-on-hand data for a list of items, grouped by department.

	Args:
		branch: The branch to scope warehouses to (required, cannot be "all")
		items: JSON list of {item_code, department} objects to look up stock for.
		       Parsed from string via frappe.parse_json if needed.

	Returns:
		List of {
			item_code: str,
			department: str,
			warehouse: str (the resolved warehouse used),
			actual_qty: float (from Bin.actual_qty, or 0 if missing),
			projected_qty: float (from Bin.projected_qty, or 0 if missing),
			allocatable_qty: float (projected_qty - active reservations),
			valuation_rate: float (from Item.valuation_rate, or 0.0),
			resolved_from: "department" | "pos_profile" | None
				- "department": used the item's department warehouse
				- "pos_profile": used the branch's central POS Profile warehouse
				- None: no warehouse could be resolved at all (fail closed)
		}

	Raises:
		frappe.PermissionError: if user is not a manager (via require_manager)
	"""
	# Security: every manager-scoped endpoint must call require_manager first
	require_manager()

	# Fail closed if branch is missing or "all" -- mirror RequirementsPage.tsx:105-113
	if not branch or branch == "all":
		return []

	# Parse items parameter (may arrive as string from URL params)
	if isinstance(items, str):
		items = parse_json(items)
	if not items:
		items = []

	items_digest = hashlib.sha256(
		json.dumps(items, sort_keys=True, default=str).encode("utf-8")
	).hexdigest()
	cache_key = f"ury_requirements_stock:{branch}:{items_digest}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	# Resolve the central/POS-Profile warehouse for this branch
	pos_profile_data = frappe.db.get_value(
		"POS Profile",
		{"branch": branch},
		["warehouse", "company"],
		as_dict=True,
	)
	pos_warehouse = pos_profile_data.get("warehouse") if pos_profile_data else None
	company = pos_profile_data.get("company") if pos_profile_data else None

	# Fail closed if branch has no POS Profile warehouse configured
	if not pos_warehouse or not company:
		return []

	# Build department -> warehouse mapping from URY Production Department
	department_warehouses = {}
	departments = frappe.get_all(
		"URY Production Department",
		filters={"branch": branch},
		fields=["name", "department_warehouse"],
	)
	for dept in departments:
		if dept.department_warehouse:
			department_warehouses[dept.name] = dept.department_warehouse

	# Process each item: resolve warehouse, get stock, get valuation
	result = []
	for item in items:
		item_code = item.get("item_code")
		department = item.get("department")

		if not item_code:
			continue

		# Determine which warehouse to use for this item
		resolved_warehouse = None
		resolved_from = None

		# Try department warehouse first
		if department and department in department_warehouses:
			resolved_warehouse = department_warehouses[department]
			resolved_from = "department"

		# Fall back to POS Profile warehouse
		if not resolved_warehouse and pos_warehouse:
			resolved_warehouse = pos_warehouse
			resolved_from = "pos_profile"

		# If no warehouse could be resolved, record as null (honest "Not available")
		if not resolved_warehouse:
			result.append({
				"item_code": item_code,
				"department": department or None,
				"warehouse": None,
				"actual_qty": None,
				"projected_qty": None,
				"allocatable_qty": None,
				"valuation_rate": None,
				"resolved_from": None,
			})
			continue

		# Get allocatable quantity (via inventory projection module)
		stock_data = get_allocatable_qty(item_code, resolved_warehouse, company)

		# Get valuation rate from Item
		valuation_rate = frappe.db.get_value("Item", item_code, "valuation_rate") or 0.0

		result.append({
			"item_code": item_code,
			"department": department or None,
			"warehouse": resolved_warehouse,
			"actual_qty": stock_data.get("bin_actual_qty", 0),
			"projected_qty": stock_data.get("bin_projected_qty", 0),
			"allocatable_qty": stock_data.get("allocatable_qty", 0),
			"valuation_rate": valuation_rate,
			"resolved_from": resolved_from,
		})

	# Cache the result with a short TTL (15 seconds, matching ury_service_line.py)
	frappe.cache().set_value(cache_key, result, expires_in_sec=15)

	return result
