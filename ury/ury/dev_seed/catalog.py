"""Permanent, rerunnable demo-data seed for the "My Restaurant" demo branch.

Seeds a comprehensive Indian/Chinese restaurant menu catalog (item groups +
items), dining tables, and customers for whichever Branch/Company currently
exists on this bench. Idempotent: every insert is guarded by
``frappe.db.exists`` so this is safe to call repeatedly (e.g. after
``bench migrate`` wipes manually-entered test data).

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.catalog.seed

Conventions here are copied from the app's existing seed/setup code so the
records look like anything a real branch onboarding would create:

- Item creation pattern: ``ury/ury/api/minimal/business_setup.py`` (Item
  with ``item_code`` = ``item_name``, ``stock_uom``, ``standard_rate``,
  ``is_stock_item`` / ``is_sales_item``, plus the ``UOM`` bootstrap).
- URY Table / URY Restaurant / URY Room creation pattern: also
  ``business_setup.py`` (a Table requires a Restaurant and a Room, both
  linked to the Branch).
- Overall module shape (``run``/``seed`` entrypoint safe for
  ``bench execute``, per-record existence checks, ``frappe.db.commit()`` at
  the end): ``ury/ury/api/seed_v3_demo.py``.
"""

import frappe


ITEM_GROUPS = [
	"Starters",
	"Main Course",
	"Biryani & Rice",
	"Chinese",
	"Beverages",
	"Desserts",
]

# (item_name, item_group, standard_rate)
MENU_ITEMS = [
	# Starters
	("Veg Spring Rolls", "Starters", 140),
	("Chicken 65", "Starters", 210),
	("Paneer Tikka", "Starters", 220),
	("Tandoori Chicken (Half)", "Starters", 280),
	("Chilli Paneer", "Starters", 210),
	("Hara Bhara Kabab", "Starters", 190),
	("Fish Amritsari", "Starters", 260),
	# Main Course
	("Dal Makhani", "Main Course", 220),
	("Paneer Butter Masala", "Main Course", 240),
	("Butter Chicken", "Main Course", 320),
	("Kadai Chicken", "Main Course", 300),
	("Palak Paneer", "Main Course", 220),
	("Mutton Rogan Josh", "Main Course", 350),
	("Malai Kofta", "Main Course", 230),
	# Biryani & Rice
	("Chicken Biryani", "Biryani & Rice", 260),
	("Mutton Biryani", "Biryani & Rice", 340),
	("Veg Biryani", "Biryani & Rice", 200),
	("Jeera Rice", "Biryani & Rice", 150),
	("Curd Rice", "Biryani & Rice", 140),
	("Hyderabadi Prawn Biryani", "Biryani & Rice", 360),
	("Ghee Rice", "Biryani & Rice", 160),
	# Chinese
	("Chicken Manchurian", "Chinese", 240),
	("Veg Manchurian", "Chinese", 190),
	("Hakka Noodles", "Chinese", 180),
	("Chilli Chicken", "Chinese", 260),
	("Veg Fried Rice", "Chinese", 170),
	("Chicken Fried Rice", "Chinese", 210),
	("Spring Rolls (Chicken)", "Chinese", 190),
	# Beverages
	("Pepsi", "Beverages", 50),
	("Fresh Lime Soda", "Beverages", 60),
	("Masala Chai", "Beverages", 40),
	("Filter Coffee", "Beverages", 50),
	("Mango Lassi", "Beverages", 80),
	("Cold Coffee", "Beverages", 90),
	("Buttermilk (Chaas)", "Beverages", 40),
	# Desserts
	("Gulab Jamun (2 pcs)", "Desserts", 90),
	("Ice Cream (2 scoops)", "Desserts", 110),
	("Rasmalai (2 pcs)", "Desserts", 120),
	("Kheer", "Desserts", 100),
	("Chocolate Brownie", "Desserts", 130),
	("Kulfi", "Desserts", 90),
]

# (table_name, seats, shape)
TABLES = [
	("T1", 2, "Square"),
	("T2", 2, "Square"),
	("T3", 4, "Square"),
	("T4", 4, "Square"),
	("T5", 4, "Rectangle"),
	("T6", 4, "Rectangle"),
	("T7", 6, "Rectangle"),
	("T8", 6, "Rectangle"),
	("T9", 8, "Circle"),
	("T10", 2, "Round"),
	("T11", 4, "Square"),
	("T12", 8, "Rectangle"),
]

CUSTOMERS = [
	"Rahul Sharma",
	"Priya Iyer",
	"Amit Verma",
	"Sneha Reddy",
	"Vikram Singh",
	"Anjali Nair",
	"Rohan Mehta",
	"Kavita Joshi",
	"Arjun Rao",
	"Neha Kapoor",
]

# UI 'Round' -> DB 'Circle', matching business_setup.py's shape_map.
SHAPE_MAP = {"Round": "Circle", "Square": "Square", "Rectangle": "Rectangle", "Circle": "Circle"}

UOM = "Unit"


def _get_branch():
	branch_name = frappe.db.get_value("Branch", {}, "name")
	if not branch_name:
		frappe.throw("No Branch found on this site — cannot seed catalog demo data.")
	return branch_name


def _get_company():
	company_name = frappe.db.get_value("Company", {}, "name")
	if not company_name:
		frappe.throw("No Company found on this site — cannot seed catalog demo data.")
	return company_name


def _ensure_uom():
	if not frappe.db.exists("UOM", UOM):
		frappe.get_doc(
			{"doctype": "UOM", "uom_name": UOM, "must_be_whole_number": 0}
		).insert(ignore_permissions=True)
		print(f"Created UOM: {UOM}")


def _ensure_item_groups():
	parent = frappe.db.get_value("Item Group", {"is_group": 1}, "name") or "All Item Groups"

	created = []
	for group_name in ITEM_GROUPS:
		if frappe.db.exists("Item Group", group_name):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Item Group",
				"item_group_name": group_name,
				"parent_item_group": parent,
				"is_group": 0,
			}
		)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
		print(f"Created Item Group: {doc.name}")
	return created


def _ensure_items():
	created = []
	for item_name, item_group, rate in MENU_ITEMS:
		if frappe.db.exists("Item", item_name):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": item_name,
				"item_name": item_name,
				"item_group": item_group,
				"stock_uom": UOM,
				"standard_rate": rate,
				"is_stock_item": 0,
				"is_sales_item": 1,
			}
		)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
		print(f"Created Item: {doc.name}")
	return created


def _ensure_restaurant_and_room(branch_name, company_name):
	"""URY Table requires a URY Restaurant and a URY Room, both linked to
	the Branch (see business_setup.py, step 2-3). Reuse existing ones for
	this branch if present instead of assuming none exist.
	"""
	room_name = frappe.db.get_value("URY Room", {"branch": branch_name}, "name")
	if not room_name:
		room_name = "Main Dining"
		if not frappe.db.exists("URY Room", room_name):
			frappe.get_doc(
				{
					"doctype": "URY Room",
					"name": room_name,
					"branch": branch_name,
					"room_type": "AC",
				}
			).insert(ignore_permissions=True)
			print(f"Created URY Room: {room_name}")

	restaurant_name = frappe.db.get_value("URY Restaurant", {"branch": branch_name}, "name")
	if not restaurant_name:
		restaurant_name = company_name
		if not frappe.db.exists("URY Restaurant", restaurant_name):
			frappe.get_doc(
				{
					"doctype": "URY Restaurant",
					"name": restaurant_name,
					"company": company_name,
					"branch": branch_name,
					"invoice_series_prefix": "INV-",
					"aggregator_series_prefix": "AGG-",
					"default_room": room_name,
				}
			).insert(ignore_permissions=True)
			print(f"Created URY Restaurant: {restaurant_name}")

	return restaurant_name, room_name


def _ensure_tables(branch_name, company_name):
	restaurant_name, room_name = _ensure_restaurant_and_room(branch_name, company_name)

	created = []
	for table_name, seats, shape in TABLES:
		if frappe.db.exists("URY Table", table_name):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "URY Table",
				"name": table_name,
				"restaurant": restaurant_name,
				"restaurant_room": room_name,
				"branch": branch_name,
				"no_of_seats": seats,
				"table_shape": SHAPE_MAP.get(shape, "Square"),
			}
		)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
		print(f"Created URY Table: {doc.name}")
	return created


def _ensure_customers():
	customer_group = (
		frappe.db.get_value("Customer Group", {"is_group": 0}, "name") or "All Customer Groups"
	)
	territory = frappe.db.get_value("Territory", {"is_group": 0}, "name") or "All Territories"

	created = []
	for customer_name in CUSTOMERS:
		if frappe.db.exists("Customer", customer_name):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": customer_name,
				"customer_type": "Individual",
				"customer_group": customer_group,
				"territory": territory,
			}
		)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
		print(f"Created Customer: {doc.name}")
	return created


def seed():
	"""Idempotent entrypoint — safe to call repeatedly, e.g. via
	``bench execute ury.ury.dev_seed.catalog.seed``.
	"""
	branch_name = _get_branch()
	company_name = _get_company()

	_ensure_uom()
	item_groups = _ensure_item_groups()
	items = _ensure_items()
	tables = _ensure_tables(branch_name, company_name)
	customers = _ensure_customers()

	frappe.db.commit()

	summary = {
		"branch": branch_name,
		"company": company_name,
		"item_groups_created": len(item_groups),
		"items_created": len(items),
		"tables_created": len(tables),
		"customers_created": len(customers),
	}
	print(f"Catalog seed complete: {summary}")
	return summary


# Backwards-compatible alias matching the ``run()`` convention used by
# ury/ury/api/seed_v3_demo.py.
run = seed
