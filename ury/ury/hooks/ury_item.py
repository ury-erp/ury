import frappe
from frappe import _


def validate(doc, method):
	update_menu_item(doc, method)
	update_variants_add_on(doc, method)
	validate_yield_tracking(doc, method)
	validate_yield_standard_permission(doc, method)


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


YIELD_STANDARD_FIELDS = (
	"custom_yield_percent",
	"custom_yield_tracked",
	"custom_yield_check_cadence",
	"custom_yield_check_interval_days",
)


def validate_yield_standard_permission(doc, method):
	"""Defense-in-depth: reject changes to the four yield-standard fields
	from anyone but a manager, no matter how the write reaches Item.save().

	F2 follow-up (PR #435 adversarial review): permlevel: 1 on these fields
	(see fixtures/custom_field.json + patches/v3_26) is the primary
	permission boundary now, but Item is a shared core doctype and permlevel
	handling has historically been easy to get wrong (e.g. silently
	dropping disallowed fields instead of raising, or a future fixture
	regression resetting permlevel back to 0). This hook is a second,
	code-level backstop: it runs on every save -- Desk, REST, the raw
	frappe.client.set_value path, and update_yield_standards() alike -- and
	throws instead of silently no-op'ing, so a permlevel misconfiguration
	degrades to "blocked with a clear error" rather than "silently open".
	"""
	if _is_yield_standard_manager():
		return

	before = doc.get_doc_before_save()
	for fieldname in YIELD_STANDARD_FIELDS:
		current = doc.get(fieldname)
		previous = before.get(fieldname) if before else None
		if current == previous:
			continue
		if not current and not previous:
			# Both falsy (None/0/"" vs None/0/"") -- not a meaningful change.
			continue
		frappe.throw(
			_(
				"Only a manager can change {0}. Use the Yield Standards page, "
				"which is manager-gated."
			).format(_(doc.meta.get_label(fieldname) or fieldname)),
			frappe.PermissionError,
		)


def _is_yield_standard_manager():
	if frappe.session.user == "Administrator":
		return True
	allowed_roles = {"URY Manager", "System Manager"}
	return bool(allowed_roles & set(frappe.get_roles()))


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
	if doc.get("custom_yield_tracked"):
		yield_percent = doc.get("custom_yield_percent")
		if not yield_percent or yield_percent <= 0 or yield_percent > 100:
			frappe.throw(
				_(
					"Item {0}: Yield Percent must be greater than 0 and at most 100 when Yield Tracked is enabled."
				).format(doc.name or doc.item_code)
			)

def on_update(doc, method=None):
	before = doc.get_doc_before_save()
	if not before:
		return
		
	yield_changed = (
		doc.custom_yield_percent != before.custom_yield_percent
		or doc.custom_yield_tracked != before.custom_yield_tracked
	)
	
	if yield_changed:
		frappe.enqueue(
			"ury.ury.hooks.ury_item.update_boms_with_yield",
			item_code=doc.name,
			queue="long",
			timeout=1500
		)

def update_boms_with_yield(item_code):
	item = frappe.get_cached_doc("Item", item_code)
	is_yield_tracked = item.custom_yield_tracked
	yield_percent = item.custom_yield_percent

	boms = frappe.get_all(
		"BOM Item",
		filters={"item_code": item_code, "parenttype": "BOM"},
		fields=["parent"],
		distinct=True
	)
	
	for bom in boms:
		try:
			bom_doc = frappe.get_doc("BOM", bom.parent)
			dirty = False
			for row in bom_doc.items:
				if row.item_code == item_code:
					if row.custom_yield_percent != yield_percent:
						if is_yield_tracked:
							row.custom_yield_percent = yield_percent
							row.custom_yield_qty = (row.qty or 0.0) * (yield_percent / 100.0)
						else:
							row.custom_yield_percent = 0
							row.custom_yield_qty = 0
						dirty = True
			
			if dirty:
				bom_doc.flags.ignore_validate_update_after_submit = True
				bom_doc.flags.ignore_permissions = True
				bom_doc.save()
		except Exception as e:
			frappe.log_error("Yield Update Error", f"Failed to update BOM {bom.parent} for item {item_code}: {e}")
