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
	"Soups",
	"Salads",
	"South Indian",
	"Breads",
	"Pizza",
	"Burgers & Sandwiches",
	"Pasta",
	"Ice Cream",
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
	("Onion Pakora", "Starters", 170),
	# Main Course
	("Dal Makhani", "Main Course", 220),
	("Paneer Butter Masala", "Main Course", 240),
	("Butter Chicken", "Main Course", 320),
	("Kadai Chicken", "Main Course", 300),
	("Palak Paneer", "Main Course", 220),
	("Mutton Rogan Josh", "Main Course", 350),
	("Malai Kofta", "Main Course", 230),
	("Shahi Tukda", "Main Course", 280),
	# Biryani & Rice
	("Chicken Biryani", "Biryani & Rice", 260),
	("Mutton Biryani", "Biryani & Rice", 340),
	("Veg Biryani", "Biryani & Rice", 200),
	("Jeera Rice", "Biryani & Rice", 150),
	("Curd Rice", "Biryani & Rice", 140),
	("Hyderabadi Prawn Biryani", "Biryani & Rice", 360),
	("Ghee Rice", "Biryani & Rice", 160),
	("Lucknowi Biryani", "Biryani & Rice", 280),
	# Chinese
	("Chicken Manchurian", "Chinese", 240),
	("Veg Manchurian", "Chinese", 190),
	("Hakka Noodles", "Chinese", 180),
	("Chilli Chicken", "Chinese", 260),
	("Veg Fried Rice", "Chinese", 170),
	("Chicken Fried Rice", "Chinese", 210),
	("Spring Rolls (Chicken)", "Chinese", 190),
	("Szechuan Paneer", "Chinese", 220),
	# Beverages
	("Pepsi", "Beverages", 50),
	("Fresh Lime Soda", "Beverages", 60),
	("Masala Chai", "Beverages", 40),
	("Filter Coffee", "Beverages", 50),
	("Mango Lassi", "Beverages", 80),
	("Cold Coffee", "Beverages", 90),
	("Buttermilk (Chaas)", "Beverages", 40),
	("Iced Tea", "Beverages", 50),
	# Desserts
	("Gulab Jamun (2 pcs)", "Desserts", 90),
	("Ice Cream (2 scoops)", "Desserts", 110),
	("Rasmalai (2 pcs)", "Desserts", 120),
	("Kheer", "Desserts", 100),
	("Chocolate Brownie", "Desserts", 130),
	("Kulfi", "Desserts", 90),
	("Jalebi", "Desserts", 80),
	("Barfi", "Desserts", 100),
	# Soups
	("Tomato Soup", "Soups", 120),
	("Corn Soup", "Soups", 140),
	("Mulligatawny Soup", "Soups", 160),
	("Hot & Sour Soup", "Soups", 150),
	("Cream of Mushroom", "Soups", 180),
	("Chicken Soup", "Soups", 170),
	("Lentil Soup", "Soups", 140),
	("Clear Soup", "Soups", 160),
	# Salads
	("Greek Salad", "Salads", 180),
	("Caesar Salad", "Salads", 200),
	("Garden Salad", "Salads", 150),
	("Coleslaw", "Salads", 140),
	("Beetroot Salad", "Salads", 160),
	("Rocket Salad", "Salads", 190),
	("Tandoori Paneer Salad", "Salads", 220),
	("Chickpea Salad", "Salads", 170),
	# South Indian
	("Dosa", "South Indian", 140),
	("Idli", "South Indian", 100),
	("Vada", "South Indian", 120),
	("Sambar", "South Indian", 130),
	("Rasam", "South Indian", 120),
	("Uttapam", "South Indian", 150),
	("Appam", "South Indian", 130),
	("Pongal", "South Indian", 140),
	# Breads
	("Naan", "Breads", 60),
	("Roti", "Breads", 40),
	("Kulcha", "Breads", 70),
	("Paratha", "Breads", 80),
	("Puri", "Breads", 60),
	("Bhatura", "Breads", 90),
	("Rumali Roti", "Breads", 50),
	("Tandoori Roti", "Breads", 65),
	# Pizza
	("Margherita Pizza", "Pizza", 250),
	("Pepperoni Pizza", "Pizza", 280),
	("Veggie Pizza", "Pizza", 240),
	("BBQ Chicken Pizza", "Pizza", 320),
	("Paneer Tikka Pizza", "Pizza", 300),
	("Four Cheese Pizza", "Pizza", 290),
	("Spicy Chicken Pizza", "Pizza", 310),
	("Tandoori Chicken Pizza", "Pizza", 330),
	# Burgers & Sandwiches
	("Veg Burger", "Burgers & Sandwiches", 180),
	("Chicken Burger", "Burgers & Sandwiches", 220),
	("Paneer Burger", "Burgers & Sandwiches", 210),
	("Tandoori Chicken Burger", "Burgers & Sandwiches", 250),
	("Mutton Burger", "Burgers & Sandwiches", 240),
	("Grilled Cheese Sandwich", "Burgers & Sandwiches", 160),
	("Paneer Tikka Sandwich", "Burgers & Sandwiches", 200),
	("Tandoori Paneer Wrap", "Burgers & Sandwiches", 210),
	# Pasta
	("Penne Arrabbiata", "Pasta", 240),
	("Fettuccine Alfredo", "Pasta", 260),
	("Spaghetti Bolognese", "Pasta", 280),
	("Penne Vodka", "Pasta", 270),
	("Mac & Cheese", "Pasta", 230),
	("Linguine Aglio e Olio", "Pasta", 220),
	("Creamy Mushroom Pasta", "Pasta", 250),
	("Chicken Alfredo Pasta", "Pasta", 300),
	# Ice Cream
	("Vanilla Ice Cream", "Ice Cream", 80),
	("Chocolate Ice Cream", "Ice Cream", 80),
	("Strawberry Ice Cream", "Ice Cream", 80),
	("Mango Ice Cream", "Ice Cream", 90),
	("Pistachio Ice Cream", "Ice Cream", 90),
	("Butterscotch Ice Cream", "Ice Cream", 90),
	("Mint Chocolate Chip", "Ice Cream", 90),
	("Cookie Dough Ice Cream", "Ice Cream", 100),
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


def _image_slug(item_name):
	"""Convert item name to a URL-safe slug for picsum.photos.

	Lowercases, replaces spaces/parens/ampersands with hyphens,
	strips other non-alphanumeric characters.
	"""
	import re
	slug = item_name.lower()
	# Replace spaces, parentheses, ampersands with hyphens
	slug = re.sub(r'[\s()&]', '-', slug)
	# Remove any remaining non-alphanumeric except hyphens
	slug = re.sub(r'[^a-z0-9-]', '', slug)
	# Collapse multiple hyphens
	slug = re.sub(r'-+', '-', slug)
	# Strip leading/trailing hyphens
	slug = slug.strip('-')
	return slug


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
	image_url = lambda name: f"https://picsum.photos/seed/{_image_slug(name)}/400/400"

	for item_name, item_group, rate in MENU_ITEMS:
		if frappe.db.exists("Item", item_name):
			# Backfill image for existing items that don't have one
			if not frappe.db.get_value("Item", item_name, "image"):
				frappe.db.set_value("Item", item_name, "image", image_url(item_name))
				print(f"Added image to existing Item: {item_name}")
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
				"image": image_url(item_name),
			}
		)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
		print(f"Created Item: {doc.name}")
	return created


def _ensure_item_prices():
	"""Create an ``Item Price`` row against "Standard Selling" for every
	MENU_ITEMS item so real-order price lookups (and ``kot_seed.py``'s own
	price lookup) find a deterministic rate instead of falling through to
	``Item.standard_rate``.

	Previously this module created ``Item.standard_rate`` but no ``Item
	Price`` rows at all, so a naive ``Price List {selling: 1}`` lookup could
	non-deterministically resolve to an unrelated selling price list (e.g.
	an aggregator list such as "Direct") rather than "Standard Selling" --
	confirmed live on the bench. ``kot_seed.py`` worked around this locally
	by pinning to "Standard Selling" with an ``Item.standard_rate``
	fallback; this creates the missing rows at the source instead.
	"""
	price_list = "Standard Selling"
	if not frappe.db.exists("Price List", price_list):
		print(f"Skipped Item Price seed: Price List '{price_list}' not found")
		return []

	created = []
	for item_name, _item_group, rate in MENU_ITEMS:
		if not frappe.db.exists("Item", item_name):
			continue
		if frappe.db.exists(
			"Item Price", {"item_code": item_name, "price_list": price_list}
		):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": item_name,
				"price_list": price_list,
				"price_list_rate": rate,
				"selling": 1,
			}
		)
		try:
			doc.insert(ignore_permissions=True)
		except Exception as e:
			# Guarded like every other insert in this package (see
			# `kot_seed.py::_get_or_create_department_invoice`,
			# `more_seed.py`'s wastage/reservation inserts): an unguarded
			# insert here (e.g. a currency mismatch validation error) would
			# raise past `seed()`'s own `frappe.db.commit()` at the end of
			# this function, losing every table/customer this run also
			# created before reaching it.
			print(f"  ! Failed to create Item Price for {item_name}: {e}")
			continue
		created.append(doc.name)
		print(f"Created Item Price for {item_name}: {rate}")
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


def _ensure_menu_items(branch_name):
	"""Wire seeded Items into URY Menu and URY Menu Course records.

	Creates or updates the active URY Menu for this branch with all seeded
	MENU_ITEMS, ensuring each course (item_group) has a corresponding URY Menu
	Course record. Idempotent: safe to rerun — skips existing courses and menu
	items, only creating new ones.

	Returns a dict with keys:
	  - menu_courses_created: count of new URY Menu Course records created
	  - menu_items_added: count of items added to the menu's child table
	"""
	# Find the URY Restaurant linked to this branch
	restaurant_name = frappe.db.get_value("URY Restaurant", {"branch": branch_name}, "name")
	if not restaurant_name:
		print(f"  ! Skipping menu wiring: no URY Restaurant found for branch '{branch_name}'")
		return {"menu_courses_created": 0, "menu_items_added": 0}

	# Get or create the active menu
	active_menu = frappe.db.get_value("URY Restaurant", restaurant_name, "active_menu")
	if not active_menu:
		# Look for an existing URY Menu for this branch
		active_menu = frappe.db.get_value("URY Menu", {"branch": branch_name}, "name")
		if not active_menu:
			# Create a new default menu
			active_menu = "Default Menu"
			if not frappe.db.exists("URY Menu", active_menu):
				menu_doc = frappe.get_doc(
					{
						"doctype": "URY Menu",
						"name": active_menu,
						"branch": branch_name,
						"enabled": 1,
						"items": [],
					}
				)
				menu_doc.insert(ignore_permissions=True)
				print(f"Created URY Menu: {active_menu}")
		# Set it as active on the restaurant
		frappe.db.set_value("URY Restaurant", restaurant_name, "active_menu", active_menu)

	# Load the menu document
	menu_doc = frappe.get_doc("URY Menu", active_menu)

	# Track existing items in the menu to avoid duplicates
	existing_item_codes = {row.item for row in menu_doc.items}

	# Track which courses we've already created in this session
	existing_courses = set(frappe.get_all("URY Menu Course", pluck="name"))

	menu_courses_created = 0
	menu_items_added = 0

	# Iterate through all seeded menu items
	for item_name, item_group, rate in MENU_ITEMS:
		# Only process items that actually exist in the Item doctype
		if not frappe.db.exists("Item", item_name):
			continue

		# Ensure the URY Menu Course exists for this item_group
		if item_group not in existing_courses:
			course_doc = frappe.get_doc(
				{"doctype": "URY Menu Course", "course": item_group}
			)
			course_doc.insert(ignore_permissions=True)
			existing_courses.add(item_group)
			menu_courses_created += 1
			print(f"Created URY Menu Course: {item_group}")

		# Add the item to the menu if not already present
		if item_name not in existing_item_codes:
			menu_doc.append(
				"items",
				{
					"item": item_name,
					"item_name": item_name,
					"rate": rate,
					"course": item_group,
				},
			)
			existing_item_codes.add(item_name)
			menu_items_added += 1

	# Save the menu document once if items were added
	if menu_items_added > 0:
		menu_doc.save(ignore_permissions=True)
		print(f"Updated URY Menu '{active_menu}': added {menu_items_added} items")

	return {
		"menu_courses_created": menu_courses_created,
		"menu_items_added": menu_items_added,
	}


def seed():
	"""Idempotent entrypoint — safe to call repeatedly, e.g. via
	``bench execute ury.ury.dev_seed.catalog.seed``.
	"""
	branch_name = _get_branch()
	company_name = _get_company()

	_ensure_uom()
	item_groups = _ensure_item_groups()
	items = _ensure_items()
	item_prices = _ensure_item_prices()
	tables = _ensure_tables(branch_name, company_name)
	customers = _ensure_customers()
	menu_result = _ensure_menu_items(branch_name)

	frappe.db.commit()

	summary = {
		"branch": branch_name,
		"company": company_name,
		"item_groups_created": len(item_groups),
		"items_created": len(items),
		"item_prices_created": len(item_prices),
		"tables_created": len(tables),
		"customers_created": len(customers),
		"menu_courses_created": menu_result["menu_courses_created"],
		"menu_items_added": menu_result["menu_items_added"],
	}
	print(f"Catalog seed complete: {summary}")
	return summary


# Backwards-compatible alias matching the ``run()`` convention used by
# ury/ury/api/seed_v3_demo.py.
run = seed
