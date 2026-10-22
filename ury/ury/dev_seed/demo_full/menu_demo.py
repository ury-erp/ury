"""Demo seed: a 33-item, 7-category restaurant menu covering every URY
production policy, with generated item images and category icons.

Run (from the bench, site context)::

    bench --site <site> execute <dotted.path>.menu_demo.seed
    # or from a console / import: menu_demo.seed(branch="My Branch")

Grounded in the URY app source (sa-brochure-shots bench):

* Production policy -- ``URY Item Production Configuration.production_policy``
  (Select) with options exactly ``PRE_PRODUCED`` / ``MADE_TO_ORDER`` /
  ``DIRECT_RETAIL``.  Validation (``ury_production_validation.py``):
  PRE_PRODUCED and MADE_TO_ORDER need department + production_unit + an
  active, submitted BOM of the same item/company; DIRECT_RETAIL needs
  ``direct_retail_warehouse`` and must NOT have a BOM.  Config docs are named
  ``UIPC-{item}-{branch}``; only one *active* config per item+branch.
* KDS/KOT routing -- ``ury_kot_routing.resolve_production_units``: an exact
  active config's ``production_unit`` wins (DIRECT_RETAIL without a unit
  routes nowhere, i.e. no KOT).  So units here do NOT get ``item_groups``
  rows (that table is only the legacy fallback and would double-route other
  seeds' items in the same Item Groups).
* Category icons -- POS ``getMenuCourses`` (ury_pos/api.py) returns
  ``URY Menu Course.icon`` (Data) and the POS Sidebar renders it through
  ``pos/src/lib/category-icons.tsx`` (a lucide-react icon *name*, e.g.
  ``Drumstick``; only an allow-list of names is rendered, empty falls back to
  fuzzy name matching).  ``URY Menu Item.course`` links the item to its course.
* Item images -- ``getRestaurantMenu`` returns ``Item.image``
  (``item_image``) per menu row; the POS shows that URL on item cards.  Images
  here are rendered with Pillow at seed time (no downloads) and attached as
  public Files to the Item.
* Prices -- ``URY Menu.on_update`` -> ``make_price_list`` recreates one
  ``Item Price`` per menu row on the menu's own Price List, so adding rows to
  the active menu *is* setting the branch price list.  A fallback
  ``Standard Selling`` Item Price (if that list exists) and
  ``Item.standard_rate`` are set too.

Idempotent; per-item try/except with savepoints; single commit per phase;
prints a summary.
"""

import io
import re

import frappe
from frappe.utils import flt

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

PRE = "PRE_PRODUCED"
MTO = "MADE_TO_ORDER"
DR = "DIRECT_RETAIL"

# category -> (lucide icon name from pos/src/lib/category-icons.tsx, gradient, shape)
CATEGORIES = {
	"Starters": ("UtensilsCrossed", ((232, 128, 54), (176, 74, 22)), "plate"),
	"Grills & BBQ": ("Drumstick", ((196, 58, 49), (120, 28, 28)), "skewer"),
	"Biryani & Rice": ("CookingPot", ((214, 160, 38), (150, 100, 14)), "pot"),
	"Breads": ("Wheat", ((196, 146, 84), (130, 88, 44)), "bread"),
	"Curries": ("Soup", ((186, 84, 28), (110, 44, 14)), "bowl"),
	"Desserts": ("IceCreamBowl", ((214, 96, 140), (140, 50, 94)), "cone"),
	"Beverages": ("CupSoda", ((38, 140, 170), (20, 82, 118)), "glass"),
}

# Production departments / units created for this menu (reused if present).
UNITS = {
	"Main Kitchen": "Batch-cooked gravies, biryani, rice and bread (pre-produced)",
	"Grill & Tandoor": "Live grill, tandoor and fry station (made to order)",
	"Beverage Bar": "Juice bar and dessert counter (made to order)",
}

DEFAULT_UOM = "Nos"

# Raw materials: name -> (uom, valuation rate)
RAW_MATERIALS = {
	"RM Basmati Rice": ("Kg", 120),
	"RM Chicken": ("Kg", 220),
	"RM Mutton": ("Kg", 650),
	"RM Prawns": ("Kg", 600),
	"RM Fish Fillet": ("Kg", 450),
	"RM Paneer": ("Kg", 320),
	"RM Mixed Vegetables": ("Kg", 60),
	"RM Potato": ("Kg", 30),
	"RM Onion": ("Kg", 35),
	"RM Tomato Puree": ("Kg", 80),
	"RM Cream": ("Litre", 250),
	"RM Butter": ("Kg", 520),
	"RM Ghee": ("Kg", 600),
	"RM Cooking Oil": ("Litre", 130),
	"RM Curd": ("Kg", 70),
	"RM Whole Spice Mix": ("Kg", 800),
	"RM Ginger Garlic Paste": ("Kg", 180),
	"RM Tikka Marinade": ("Kg", 250),
	"RM Maida": ("Kg", 45),
	"RM Atta": ("Kg", 40),
	"RM Toor Dal": ("Kg", 140),
	"RM Orange": ("Kg", 70),
	"RM Watermelon": ("Kg", 25),
	"RM Mint Leaves": ("Kg", 120),
	"RM Lemon": ("Kg", 100),
	"RM Sugar": ("Kg", 45),
	"RM Milk": ("Litre", 60),
	"RM Khoya": ("Kg", 380),
	"RM Walnuts": ("Kg", 900),
	"RM Brownie Mix": ("Kg", 300),
	"RM Vanilla Ice Cream": ("Litre", 220),
	"RM Wrap Bread": ("Nos", 6),
	"RM Coconut Milk": ("Litre", 180),
}

# (item, category, policy, price, production_unit, {raw material: qty per portion})
# Unit is None for DIRECT_RETAIL.  Names deliberately avoid catalog.py's
# dev_seed item names so nothing collides with other seeds.
ITEMS = [
	# --- Starters
	("Chicken 65 Dry", "Starters", MTO, 240, "Grill & Tandoor",
		{"RM Chicken": 0.2, "RM Tikka Marinade": 0.03, "RM Cooking Oil": 0.05}),
	("Crispy Onion Bhaji", "Starters", MTO, 150, "Grill & Tandoor",
		{"RM Onion": 0.15, "RM Maida": 0.05, "RM Cooking Oil": 0.06}),
	("Hara Bhara Kebab Platter", "Starters", PRE, 210, "Main Kitchen",
		{"RM Mixed Vegetables": 0.18, "RM Potato": 0.08, "RM Cooking Oil": 0.03}),
	("Veg Samosa (2 pcs)", "Starters", PRE, 90, "Main Kitchen",
		{"RM Potato": 0.12, "RM Maida": 0.08, "RM Cooking Oil": 0.05}),
	# --- Grills & BBQ (all made to order)
	("Chicken Shawarma Roll", "Grills & BBQ", MTO, 180, "Grill & Tandoor",
		{"RM Chicken": 0.15, "RM Wrap Bread": 1, "RM Curd": 0.03, "RM Onion": 0.03}),
	("Chicken Tikka (6 pcs)", "Grills & BBQ", MTO, 290, "Grill & Tandoor",
		{"RM Chicken": 0.25, "RM Tikka Marinade": 0.05, "RM Curd": 0.04}),
	("Lamb Seekh Kebab", "Grills & BBQ", MTO, 340, "Grill & Tandoor",
		{"RM Mutton": 0.22, "RM Whole Spice Mix": 0.01, "RM Onion": 0.03}),
	("Tandoori Prawns", "Grills & BBQ", MTO, 420, "Grill & Tandoor",
		{"RM Prawns": 0.2, "RM Tikka Marinade": 0.04, "RM Lemon": 0.02}),
	("Paneer Malai Tikka", "Grills & BBQ", MTO, 260, "Grill & Tandoor",
		{"RM Paneer": 0.2, "RM Cream": 0.04, "RM Curd": 0.04}),
	# --- Biryani & Rice (batch cooked)
	("Chicken Dum Biryani", "Biryani & Rice", PRE, 290, "Main Kitchen",
		{"RM Basmati Rice": 0.18, "RM Chicken": 0.2, "RM Ghee": 0.02, "RM Whole Spice Mix": 0.01}),
	("Mutton Dum Biryani", "Biryani & Rice", PRE, 380, "Main Kitchen",
		{"RM Basmati Rice": 0.18, "RM Mutton": 0.22, "RM Ghee": 0.02, "RM Whole Spice Mix": 0.01}),
	("Veg Dum Biryani", "Biryani & Rice", PRE, 230, "Main Kitchen",
		{"RM Basmati Rice": 0.18, "RM Mixed Vegetables": 0.15, "RM Ghee": 0.02}),
	("Steamed Basmati Rice", "Biryani & Rice", PRE, 110, "Main Kitchen",
		{"RM Basmati Rice": 0.15}),
	# --- Breads (tandoor = made to order; parotta = batch)
	("Butter Naan", "Breads", MTO, 60, "Grill & Tandoor",
		{"RM Maida": 0.1, "RM Butter": 0.01, "RM Curd": 0.02}),
	("Garlic Naan", "Breads", MTO, 75, "Grill & Tandoor",
		{"RM Maida": 0.1, "RM Ginger Garlic Paste": 0.01, "RM Butter": 0.01}),
	("Tandoori Roti", "Breads", MTO, 40, "Grill & Tandoor",
		{"RM Atta": 0.08}),
	("Malabar Parotta", "Breads", PRE, 55, "Main Kitchen",
		{"RM Maida": 0.1, "RM Cooking Oil": 0.02}),
	# --- Curries (batch cooked gravies)
	("Murgh Makhani", "Curries", PRE, 320, "Main Kitchen",
		{"RM Chicken": 0.2, "RM Tomato Puree": 0.1, "RM Butter": 0.02, "RM Cream": 0.04}),
	("Dal Tadka", "Curries", PRE, 190, "Main Kitchen",
		{"RM Toor Dal": 0.08, "RM Onion": 0.04, "RM Ghee": 0.01}),
	("Paneer Makhani", "Curries", PRE, 270, "Main Kitchen",
		{"RM Paneer": 0.15, "RM Tomato Puree": 0.1, "RM Cream": 0.04, "RM Butter": 0.02}),
	("Lamb Rogan Josh", "Curries", PRE, 380, "Main Kitchen",
		{"RM Mutton": 0.22, "RM Onion": 0.08, "RM Curd": 0.05, "RM Whole Spice Mix": 0.01}),
	("Kerala Fish Curry", "Curries", PRE, 350, "Main Kitchen",
		{"RM Fish Fillet": 0.2, "RM Coconut Milk": 0.08, "RM Tomato Puree": 0.05}),
	# --- Desserts
	("Gulab Jamun Pair", "Desserts", PRE, 100, "Main Kitchen",
		{"RM Khoya": 0.05, "RM Sugar": 0.06, "RM Maida": 0.01}),
	("Phirni Cup", "Desserts", PRE, 110, "Main Kitchen",
		{"RM Milk": 0.2, "RM Sugar": 0.03, "RM Basmati Rice": 0.02}),
	("Walnut Brownie Sundae", "Desserts", MTO, 190, "Beverage Bar",
		{"RM Brownie Mix": 0.1, "RM Walnuts": 0.02, "RM Vanilla Ice Cream": 0.1}),
	("Packaged Kulfi Stick", "Desserts", DR, 70, None, {}),
	# --- Beverages
	("Fresh Orange Juice", "Beverages", MTO, 120, "Beverage Bar",
		{"RM Orange": 0.4}),
	("Watermelon Juice", "Beverages", MTO, 100, "Beverage Bar",
		{"RM Watermelon": 0.4, "RM Mint Leaves": 0.005}),
	("Mint Lemonade", "Beverages", MTO, 90, "Beverage Bar",
		{"RM Lemon": 0.05, "RM Mint Leaves": 0.01, "RM Sugar": 0.02}),
	("Bottled Water 500ml", "Beverages", DR, 30, None, {}),
	("Cola Can 330ml", "Beverages", DR, 60, None, {}),
	("Diet Cola Can 330ml", "Beverages", DR, 60, None, {}),
	("Orange Soda Can 330ml", "Beverages", DR, 60, None, {}),
]

# Opening stock bootstrap (plain Material Receipts; NOT real batch production).
RAW_OPENING_QTY = 300
FG_OPENING_QTY = 60
RETAIL_OPENING_QTY = 120
RETAIL_COST_RATIO = 0.55
FG_COST_RATIO = 0.35


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


# Fallback look for items whose course / item group maps to no seeded category.
NEUTRAL_CATEGORY = ("UtensilsCrossed", ((96, 112, 128), (52, 62, 74)), "plate")
# Filename prefix marking tiles rendered by retile_placeholder_images (idempotence).
RETILE_PREFIX = "demo-tile-"
PLACEHOLDER_HOSTS = ("picsum.photos", "placeholder", "via.placeholder", "source.unsplash", "unsplash", "loremflickr", "dummyimage", "placehold")


def _slug(text):
	return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _resolve_branch(branch):
	if branch:
		if not frappe.db.exists("Branch", branch):
			frappe.throw(f"Branch {branch} does not exist")
		return branch
	rest_branch = frappe.db.get_value("URY Restaurant", {}, "branch")
	if rest_branch:
		return rest_branch
	b = frappe.db.get_value("Branch", {}, "name")
	if not b:
		frappe.throw("No Branch found - cannot seed menu demo data.")
	return b


def _company_for(branch):
	company = frappe.db.get_value("Branch", branch, "company")
	if not company:
		company = frappe.db.get_value("Company", {}, "name")
	if not company:
		frappe.throw("No Company found - cannot seed menu demo data.")
	return company


def _uom_or_default(uom):
	return uom if frappe.db.exists("UOM", uom) else DEFAULT_UOM


def _ensure_item_group(name, parent="All Item Groups"):
	if frappe.db.exists("Item Group", name):
		return
	frappe.get_doc(
		{"doctype": "Item Group", "item_group_name": name, "parent_item_group": parent, "is_group": 0}
	).insert(ignore_permissions=True)
	print(f"  + Item Group {name}")


def _default_warehouse(company, branch):
	"""Prefer a branch department warehouse (same one Kitchen/other seeds use)."""
	wh = frappe.db.get_value(
		"URY Production Department",
		{"branch": branch, "company": company, "department_warehouse": ["is", "set"]},
		"department_warehouse",
	)
	if wh:
		return wh
	abbr = frappe.db.get_value("Company", company, "abbr")
	for cand in (f"Kitchen - {abbr}", f"Finished Goods - {abbr}"):
		if frappe.db.exists("Warehouse", cand):
			return cand
	wh = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	if not wh:
		frappe.throw(f"No Warehouse for company {company}")
	return wh


def _retail_warehouse(company):
	abbr = frappe.db.get_value("Company", company, "abbr")
	name = f"Direct Retail - {abbr}"
	if frappe.db.exists("Warehouse", name):
		return name
	doc = frappe.get_doc({"doctype": "Warehouse", "warehouse_name": "Direct Retail", "company": company})
	doc.insert(ignore_permissions=True)
	print(f"  + Warehouse {doc.name}")
	return doc.name


def _cost_center(company):
	cc = frappe.db.get_value("Company", company, "cost_center")
	return cc or frappe.db.get_value("Cost Center", {"company": company, "is_group": 0}, "name")


# --------------------------------------------------------------------------
# Production departments / units
# --------------------------------------------------------------------------


def _ensure_units(branch, company, warehouse):
	"""Create one URY Production Department + URY Production Unit per UNITS key.
	Returns {unit_key: (department_name, unit_name)}."""
	cost_center = _cost_center(company)
	# Reuse the POS Profile / warehouse already wired to this branch's units
	# so KOT printing and KDS behave like the existing units.
	ref = frappe.db.get_value(
		"URY Production Unit",
		{"branch": branch, "pos_profile": ["is", "set"]},
		["pos_profile", "warehouse"],
		as_dict=True,
	)
	pos_profile = ref.pos_profile if ref else frappe.db.get_value("POS Profile", {"branch": branch}, "name")
	unit_wh = (ref.warehouse if ref and ref.warehouse else None)

	out = {}
	for key in UNITS:
		try:
			dept = key
			if not frappe.db.exists("URY Production Department", dept):
				d = frappe.get_doc(
					{
						"doctype": "URY Production Department",
						"department_name": dept,
						"enabled": 1,
						"company": company,
						"branch": branch,
						"department_warehouse": warehouse,
						"cost_center": cost_center,
					}
				)
				d.insert(ignore_permissions=True)
				dept = d.name
				print(f"  + Production Department {dept}")
			if not frappe.db.exists("URY Production Unit", key):
				u = {
					"doctype": "URY Production Unit",
					"production": key,
					"enabled": 1,
					"department": dept,
					"branch": branch,
				}
				if pos_profile:
					u["pos_profile"] = pos_profile
				if unit_wh:
					u["warehouse"] = unit_wh
				frappe.get_doc(u).insert(ignore_permissions=True)
				print(f"  + Production Unit {key}")
			out[key] = (dept, key)
		except Exception as e:
			print(f"  ! Production unit {key} failed: {e}")
			frappe.db.rollback()
	frappe.db.commit()
	return out


# --------------------------------------------------------------------------
# Items / raw materials / BOM / production configuration
# --------------------------------------------------------------------------


def _ensure_raw_materials():
	created = 0
	for name, (uom, rate) in RAW_MATERIALS.items():
		if frappe.db.exists("Item", name):
			continue
		try:
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": name,
					"item_name": name[3:] + " (Raw)",
					"item_group": "Raw Material" if frappe.db.exists("Item Group", "Raw Material") else "All Item Groups",
					"stock_uom": _uom_or_default(uom),
					"is_stock_item": 1,
					"is_sales_item": 0,
					"is_purchase_item": 1,
					"valuation_rate": rate,
					"standard_rate": rate,
				}
			).insert(ignore_permissions=True)
			created += 1
		except Exception as e:
			print(f"  ! Raw material {name} failed: {e}")
			frappe.db.rollback()
	frappe.db.commit()
	if created:
		print(f"  + {created} raw material items")
	return created


def _ensure_menu_item(name, category, policy, price):
	if frappe.db.exists("Item", name):
		frappe.db.set_value("Item", name, {"standard_rate": price, "disabled": 0})
		return False
	frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": name,
			"item_name": name,
			"item_group": category,
			"stock_uom": DEFAULT_UOM,
			"is_stock_item": 1,  # BOM manufacture / retail stock both need stock items
			"is_sales_item": 1,
			"is_purchase_item": 1 if policy == DR else 0,
			"standard_rate": price,
			"description": f"{category} - {policy.replace('_', ' ').title()}",
		}
	).insert(ignore_permissions=True)
	return True


def _ensure_bom(item, company, recipe):
	existing = frappe.db.get_value(
		"BOM",
		{"item": item, "company": company, "docstatus": 1, "is_active": 1},
		"name",
		order_by="is_default desc, modified desc",
	)
	if existing:
		return existing
	rows = []
	for rm, qty in recipe.items():
		rows.append(
			{
				"item_code": rm,
				"qty": qty,
				"uom": frappe.db.get_value("Item", rm, "stock_uom"),
				"rate": RAW_MATERIALS[rm][1],
			}
		)
	bom = frappe.get_doc(
		{
			"doctype": "BOM",
			"item": item,
			"company": company,
			"quantity": 1,
			"is_active": 1,
			"is_default": 1,
			"with_operations": 0,
			"items": rows,
		}
	)
	bom.insert(ignore_permissions=True)
	bom.submit()
	print(f"  + BOM {bom.name}")
	return bom.name


def _ensure_production_config(item, branch, policy, department, unit, bom, retail_wh):
	fields = {
		"active": 1,
		"production_policy": policy,
		"sourcing_mode": "IN_HOUSE",
		# Demo POS must be able to sell freely: don't gate on a Sales Plan.
		"controlled_by_sales_plan": 0,
		"allow_over_plan_sale": 1,
		"availability_mode": "Always Available",
	}
	if policy == DR:
		fields.update(
			{
				"direct_retail_warehouse": retail_wh,
				"department": None,
				"production_unit": None,
				"bom": None,
			}
		)
	else:
		fields.update(
			{
				"department": department,
				"production_unit": unit,
				"bom": bom,
				"direct_retail_warehouse": None,
			}
		)
	name = frappe.db.get_value(
		"URY Item Production Configuration", {"item": item, "branch": branch, "active": 1}, "name"
	) or frappe.db.get_value("URY Item Production Configuration", {"item": item, "branch": branch}, "name")
	if name:
		doc = frappe.get_doc("URY Item Production Configuration", name)
		doc.update(fields)
		doc.save(ignore_permissions=True)
		return name, False
	doc = frappe.get_doc({"doctype": "URY Item Production Configuration", "item": item, "branch": branch, **fields})
	doc.insert(ignore_permissions=True)
	return doc.name, True


def _ensure_standard_selling_price(item, price):
	pl = "Standard Selling"
	if not frappe.db.exists("Price List", pl):
		return
	name = frappe.db.get_value("Item Price", {"item_code": item, "price_list": pl}, "name")
	if name:
		frappe.db.set_value("Item Price", name, "price_list_rate", price)
		return
	frappe.get_doc(
		{"doctype": "Item Price", "item_code": item, "price_list": pl, "price_list_rate": price, "selling": 1}
	).insert(ignore_permissions=True)


# --------------------------------------------------------------------------
# Image rendering (Pillow, no network)
# --------------------------------------------------------------------------


def _font(size):
	from PIL import ImageFont

	for path in (
		"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
		"/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
		"/System/Library/Fonts/Supplemental/Arial Bold.ttf",
		"DejaVuSans-Bold.ttf",
	):
		try:
			return ImageFont.truetype(path, size)
		except Exception:
			continue
	try:
		return ImageFont.load_default(size=size)
	except TypeError:
		return ImageFont.load_default()


def _draw_shape(d, shape, cx, cy):
	W = (255, 255, 255, 235)
	Wl = (255, 255, 255, 120)
	if shape == "plate":
		d.ellipse((cx - 190, cy - 190, cx + 190, cy + 190), outline=W, width=18)
		d.ellipse((cx - 120, cy - 120, cx + 120, cy + 120), fill=Wl)
		for dx, dy in ((-50, -30), (40, -50), (10, 40)):
			d.ellipse((cx + dx - 34, cy + dy - 34, cx + dx + 34, cy + dy + 34), fill=W)
	elif shape == "skewer":
		d.line((cx - 230, cy, cx + 230, cy), fill=W, width=16)
		for i in range(4):
			x = cx - 190 + i * 100
			d.rounded_rectangle((x, cy - 70, x + 80, cy + 70), radius=28, fill=W)
		for i in range(5):
			x = cx - 200 + i * 100
			d.polygon([(x, cy + 190), (x + 30, cy + 110), (x + 60, cy + 190)], fill=Wl)
	elif shape in ("pot", "bowl"):
		d.pieslice((cx - 190, cy - 150, cx + 190, cy + 230), 0, 180, fill=W)
		d.rounded_rectangle((cx - 210, cy - 20, cx + 210, cy + 10), radius=12, fill=W)
		if shape == "pot":
			d.rounded_rectangle((cx - 40, cy - 70, cx + 40, cy - 28), radius=16, fill=W)
		for dx in (-90, 0, 90):
			d.arc((cx + dx - 30, cy - 190, cx + dx + 30, cy - 90), 200, 340, fill=Wl, width=14)
	elif shape == "bread":
		d.ellipse((cx - 220, cy - 140, cx + 220, cy + 140), fill=W)
		for dx in (-110, -30, 50, 130):
			d.line((cx + dx, cy - 70, cx + dx + 40, cy + 70), fill=(0, 0, 0, 55), width=14)
	elif shape == "cone":
		d.polygon([(cx - 100, cy + 10), (cx + 100, cy + 10), (cx, cy + 230)], fill=Wl)
		d.ellipse((cx - 110, cy - 130, cx + 110, cy + 60), fill=W)
		d.ellipse((cx - 70, cy - 230, cx + 70, cy - 90), fill=W)
	elif shape == "glass":
		d.polygon([(cx - 130, cy - 130), (cx + 130, cy - 130), (cx + 95, cy + 210), (cx - 95, cy + 210)], fill=Wl)
		d.polygon([(cx - 118, cy - 40), (cx + 118, cy - 40), (cx + 95, cy + 210), (cx - 95, cy + 210)], fill=W)
		d.line((cx + 40, cy - 130, cx + 110, cy - 250), fill=W, width=16)


def _render_tile(item_name, category):
	from PIL import Image, ImageDraw

	_icon, (top, bottom), shape = CATEGORIES.get(category) or NEUTRAL_CATEGORY
	S = 800
	img = Image.new("RGB", (S, S))
	px = ImageDraw.Draw(img)
	for y in range(S):
		t = y / (S - 1)
		px.line(
			[(0, y), (S, y)],
			fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
		)
	d = ImageDraw.Draw(img, "RGBA")
	_draw_shape(d, shape, S // 2, 290)

	# Name band
	d.rectangle((0, 540, S, S), fill=(0, 0, 0, 120))
	font = _font(70)
	words, lines, cur = item_name.split(), [], ""
	for w in words:
		trial = (cur + " " + w).strip()
		if d.textlength(trial, font=font) <= S - 80 or not cur:
			cur = trial
		else:
			lines.append(cur)
			cur = w
	lines.append(cur)
	lines = lines[:3]
	line_h = 84
	y = 540 + (S - 540 - line_h * len(lines)) // 2
	for ln in lines:
		w = d.textlength(ln, font=font)
		d.text(((S - w) / 2, y), ln, font=font, fill=(255, 255, 255, 255))
		y += line_h

	img = img.resize((400, 400), Image.LANCZOS)
	buf = io.BytesIO()
	img.save(buf, "PNG", optimize=True)
	return buf.getvalue()


def _ensure_image(item, category):
	current = frappe.db.get_value("Item", item, "image")
	if current and current.startswith("/files/"):
		return False
	from frappe.utils.file_manager import save_file

	content = _render_tile(item, category)
	f = save_file(f"{_slug(item)}.png", content, "Item", item, folder="Home", is_private=0, df="image")
	frappe.db.set_value("Item", item, "image", f.file_url)
	return True


# --------------------------------------------------------------------------
# Menu / courses
# --------------------------------------------------------------------------


def _ensure_courses():
	made = 0
	for cat, (icon, _g, _s) in CATEGORIES.items():
		if not frappe.db.exists("URY Menu Course", cat):
			frappe.get_doc({"doctype": "URY Menu Course", "course": cat, "icon": icon}).insert(
				ignore_permissions=True
			)
			made += 1
		elif not frappe.db.get_value("URY Menu Course", cat, "icon"):
			frappe.db.set_value("URY Menu Course", cat, "icon", icon)
	frappe.db.commit()
	return made


def _active_menu(branch):
	restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch}, "name")
	menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu") if restaurant else None
	if not menu:
		menu = frappe.db.get_value("URY Menu", {"branch": branch, "enabled": 1}, "name") or frappe.db.get_value(
			"URY Menu", {"branch": branch}, "name"
		)
	return restaurant, menu


def _ensure_menu_rows(branch, seeded):
	"""seeded: list of (item, category, price). Adds/updates rows on the active menu."""
	restaurant, menu_name = _active_menu(branch)
	rows_spec = [
		{
			"item": i,
			"item_name": i,
			"rate": p,
			"course": c,
			"course_icon": CATEGORIES[c][0],
			"disabled": 0,
		}
		for i, c, p in seeded
	]
	if not menu_name:
		menu_name = f"{branch} Menu"
		doc = frappe.get_doc(
			{"doctype": "URY Menu", "name": menu_name, "branch": branch, "enabled": 1, "items": rows_spec}
		)
		doc.insert(ignore_permissions=True)
		print(f"  + URY Menu {menu_name}")
		added, updated = len(rows_spec), 0
	else:
		doc = frappe.get_doc("URY Menu", menu_name)
		by_item = {r.item: r for r in doc.items}
		added = updated = 0
		for spec in rows_spec:
			row = by_item.get(spec["item"])
			if row is None:
				doc.append("items", spec)
				added += 1
			elif (row.rate != spec["rate"] or row.course != spec["course"] or row.disabled
				or row.course_icon != spec["course_icon"]):
				row.update(spec)
				updated += 1
		if added or updated or not doc.enabled:
			doc.enabled = 1
			doc.save(ignore_permissions=True)  # on_update rebuilds the menu Price List
	if restaurant and frappe.db.get_value("URY Restaurant", restaurant, "active_menu") != menu_name:
		frappe.db.set_value("URY Restaurant", restaurant, "active_menu", menu_name)
		print(f"  + {restaurant}.active_menu = {menu_name}")
	elif not restaurant:
		print(f"  ! No URY Restaurant for {branch}: menu {menu_name} not activated")
	frappe.db.commit()
	return menu_name, added, updated


# --------------------------------------------------------------------------
# Opening stock
# --------------------------------------------------------------------------


def _receipt(company, warehouse, lines, label):
	"""lines: [(item, qty, rate)]. Skips items already holding stock."""
	rows = []
	for item, qty, rate in lines:
		have = flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": warehouse}, "actual_qty"))
		if have >= qty / 2:
			continue
		rows.append({"item_code": item, "qty": qty, "t_warehouse": warehouse, "basic_rate": rate})
	if not rows:
		return 0
	frappe.db.savepoint("menu_demo_receipt")
	try:
		se = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"stock_entry_type": "Material Receipt",
				"purpose": "Material Receipt",
				"company": company,
				"items": rows,
			}
		)
		se.insert(ignore_permissions=True)
		se.submit()
		print(f"  + {label}: {len(rows)} lines via {se.name}")
		return len(rows)
	except Exception as e:
		frappe.db.rollback(save_point="menu_demo_receipt")
		print(f"  ! {label} receipt failed: {e}")
		return 0


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def _is_placeholder_image(image):
	"""True if the image is empty, an external/placeholder URL, or a local path with no File record."""
	if not image:
		return True
	if image.startswith("/files/" + RETILE_PREFIX):
		return False
	low = image.lower()
	if low.startswith(("http://", "https://", "//")):
		site = (frappe.utils.get_url() or "").lower()
		if any(h in low for h in PLACEHOLDER_HOSTS):
			return True
		return not (site and low.startswith(site))  # external host
	if low.startswith("/files/"):
		return not frappe.db.exists("File", {"file_url": image})
	return False


def retile_placeholder_images():
	"""Replace empty/placeholder Item images on enabled URY Menus with rendered tiles. Idempotent."""
	from frappe.utils.file_manager import save_file

	rows = {}  # item -> (course, item_group)
	for menu in frappe.get_all("URY Menu", filters={"enabled": 1}, pluck="name"):
		for r in frappe.get_doc("URY Menu", menu).items:
			if r.item:
				rows.setdefault(r.item, r.course)
	scanned = retiled = skipped = failed = 0
	for item, course in rows.items():
		scanned += 1
		try:
			image, group = frappe.db.get_value("Item", item, ["image", "item_group"])
		except Exception:
			continue
		if not _is_placeholder_image(image):
			skipped += 1
			continue
		frappe.db.savepoint("menu_demo_retile")
		try:
			category = course if course in CATEGORIES else (group if group in CATEGORIES else None)
			content = _render_tile(item, category)
			f = save_file(
				f"{RETILE_PREFIX}{_slug(item)}.png", content, "Item", item,
				folder="Home", is_private=0, df="image",
			)
			frappe.db.set_value("Item", item, "image", f.file_url)
			retiled += 1
			if retiled % 25 == 0:
				frappe.db.commit()
		except Exception as e:
			frappe.db.rollback(save_point="menu_demo_retile")
			failed += 1
			print(f"  ! retile {item}: {e}")
	frappe.db.commit()
	print(f"retile_placeholder_images: scanned={scanned} retiled={retiled} skipped={skipped} failed={failed}")
	return {"scanned": scanned, "retiled": retiled, "skipped": skipped, "failed": failed}


def seed(branch=None):
	frappe.set_user("Administrator")
	branch = _resolve_branch(branch)
	company = _company_for(branch)
	print(f"menu_demo: branch={branch} company={company}")

	stats = {
		"items_created": 0,
		"images": 0,
		"boms": 0,
		"configs_created": 0,
		"configs_updated": 0,
		"failed": [],
		"by_policy": {PRE: 0, MTO: 0, DR: 0},
	}

	for cat in CATEGORIES:
		_ensure_item_group(cat)
	if frappe.db.exists("Item Group", "Raw Material") is None:
		_ensure_item_group("Raw Material")
	frappe.db.commit()

	warehouse = _default_warehouse(company, branch)
	retail_wh = _retail_warehouse(company)
	units = _ensure_units(branch, company, warehouse)
	_ensure_raw_materials()
	courses_created = _ensure_courses()

	seeded = []
	for item, cat, policy, price, unit_key, recipe in ITEMS:
		frappe.db.savepoint("menu_demo_item")
		try:
			if _ensure_menu_item(item, cat, policy, price):
				stats["items_created"] += 1
			try:
				if _ensure_image(item, cat):
					stats["images"] += 1
			except Exception as e:  # image is cosmetic; never block the item
				print(f"  ! image for {item}: {e}")

			bom = dept = unit = None
			if policy != DR:
				if unit_key not in units:
					raise RuntimeError(f"production unit {unit_key} unavailable")
				dept, unit = units[unit_key]
				had = frappe.db.exists("BOM", {"item": item, "company": company, "docstatus": 1, "is_active": 1})
				bom = _ensure_bom(item, company, recipe)
				if not had:
					stats["boms"] += 1
			_cfg, created = _ensure_production_config(item, branch, policy, dept, unit, bom, retail_wh)
			stats["configs_created" if created else "configs_updated"] += 1
			_ensure_standard_selling_price(item, price)
			stats["by_policy"][policy] += 1
			seeded.append((item, cat, price))
			frappe.db.commit()
		except Exception as e:
			frappe.db.rollback(save_point="menu_demo_item")
			stats["failed"].append(item)
			print(f"  ! {item} failed: {e}")
			frappe.log_error(frappe.get_traceback(), f"menu_demo item {item}")

	try:
		menu_name, added, updated = _ensure_menu_rows(branch, seeded)
	except Exception as e:
		frappe.db.rollback()
		menu_name, added, updated = None, 0, 0
		print(f"  ! menu wiring failed: {e}")
		frappe.log_error(frappe.get_traceback(), "menu_demo menu wiring")

	# Opening inventory so sales/consumption don't hit negative stock.
	rm_lines = [(n, RAW_OPENING_QTY, r) for n, (_u, r) in RAW_MATERIALS.items() if frappe.db.exists("Item", n)]
	fg_lines = [
		(i, FG_OPENING_QTY, round(p * FG_COST_RATIO, 2))
		for i, _c, pol, p, _u, _r in ITEMS
		if pol == PRE and i in {s[0] for s in seeded}
	]
	retail_lines = [
		(i, RETAIL_OPENING_QTY, round(p * RETAIL_COST_RATIO, 2))
		for i, _c, pol, p, _u, _r in ITEMS
		if pol == DR and i in {s[0] for s in seeded}
	]
	stock = {
		"raw": _receipt(company, warehouse, rm_lines, "raw materials"),
		"pre_produced_fg": _receipt(company, warehouse, fg_lines, "pre-produced opening stock"),
		"retail": _receipt(company, retail_wh, retail_lines, "direct retail stock"),
	}
	frappe.db.commit()

	summary = {
		"branch": branch,
		"menu": menu_name,
		"menu_rows_added": added,
		"menu_rows_updated": updated,
		"categories": list(CATEGORIES),
		"courses_created": courses_created,
		"items_seeded": len(seeded),
		**{k: v for k, v in stats.items() if k != "failed"},
		"failed": stats["failed"],
		"stock_lines": stock,
	}
	try:
		summary["retile"] = retile_placeholder_images()
	except Exception as e:
		frappe.db.rollback()
		print(f"  ! retile failed: {e}")
	print(f"menu_demo complete: {summary}")
	return summary
