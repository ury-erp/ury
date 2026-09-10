import frappe
from frappe import _


def validate(doc, method):
	update_menu_item(doc, method)
	update_variants_add_on(doc, method)
	validate_yield_tracking(doc, method)


def update_menu_item(doc, event):
	menu_items = frappe.get_all('URY Menu Item', filters={'item': doc.item_code})
	for menu_item in menu_items:
		frappe.db.set_value('URY Menu Item', menu_item.name, 'item_name', doc.item_name)

def update_variants_add_on(doc, event):
	if doc.custom_pos_add_on_items:
		for row in doc.custom_pos_add_on_items:
			if not frappe.db.exists("URY Menu Item", {"item": row.item}):
				frappe.throw(f"Item '{row.item}' in POS Add On Items is not in URY Menu")

	if doc.custom_pos_item_variants:
		for row in doc.custom_pos_item_variants:
			if not frappe.db.exists("URY Menu Item", {"item": row.item}):
				frappe.throw(f"Item '{row.item}' in POS Item Variants is not in URY Menu")


def validate_yield_tracking(doc, method):
	"""
	Enforce that an Item cannot be marked custom_yield_tracked=1 with no
	standard yield percent declared. Without this guard, custom_yield_tracked=1
	+ custom_yield_percent=0 passes silently, and every downstream consumer
	(BOM Item back-calculation, URY Yield Check's snapshot) either no-ops or
	divides by/against a meaningless 0 -- the zero-guard is only as strong as
	its weakest entry point, and Item itself (editable directly via desk, API,
	or the Yield Standards page) is one of them.
	"""
	if doc.get("custom_yield_tracked") and not doc.get("custom_yield_percent"):
		frappe.throw(
			_(
				"Item {0} is marked Yield Tracked but has no Yield Percent set. "
				"Set a standard yield percent before enabling yield tracking."
			).format(doc.name or doc.item_code)
		)
