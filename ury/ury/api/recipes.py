"""Recipes: what each product is made of, and what that costs today.

A recipe is stored as an ERPNext BOM — the standard place a product's
components live, already read by the Food Cost report and the daily P&L — but
used only as a list of ingredients per portion. Nothing here manufactures: no
Work Order, no Manufacture entry. When a product is sold, its ingredients are
issued from stock as consumption (see ury.ury.api.consumption).

Editing a recipe saves a new BOM and retires the old one, so every past sale
keeps pointing at the recipe it was actually made with.

Cost is worked out live, per stock unit of each ingredient, from purchases:
  warehouse - the valuation of the stock in the warehouse it is taken from
              (FIFO here: what the remaining purchased batches cost)
  average   - the valuation across all warehouses that hold it
  purchase  - the last purchase price, when nothing is in stock
  none      - never bought: shown as unknown, never as free
"""

import math

import frappe
from frappe import _
from frappe.utils import cint, flt

from ury.ury.api.purchases import _company_and_warehouse

MAX_DEPTH = 4
SEARCH_LIMIT = 20
KITCHEN_UOMS = ("Kg", "Gram", "Milligram", "Litre", "Millilitre", "Centilitre")
COST_SOURCES = ("warehouse", "average", "purchase", "none")


# --------------------------------------------------------------------------- list


@frappe.whitelist()
def get_recipe_setup(branch=None):
	_check_read()
	company, default_wh = _company_and_warehouse(branch)
	warehouses = frappe.get_list(
		"Warehouse",
		filters={"company": company, "is_group": 0, "disabled": 0},
		fields=["name", "warehouse_name"],
		order_by="warehouse_name asc",
		limit_page_length=0,
	)
	units = frappe.get_all(
		"URY Production Unit",
		filters={"branch": branch} if branch and branch != "all" else {},
		fields=["name", "production", "warehouse", "branch"],
	)
	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"warehouses": [{"name": w.name, "label": w.warehouse_name or w.name} for w in warehouses],
		"default_warehouse": default_wh,
		"production_units": [
			{"name": u.name, "label": u.production or u.name, "warehouse": u.warehouse,
			 "item_groups": _unit_groups(u.name)}
			for u in units
		],
		"allow_negative_stock": cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock")),
		"permissions": {
			"write": bool(frappe.has_permission("BOM", "create")) and bool(frappe.has_permission("BOM", "submit")),
		},
	}


@frappe.whitelist()
def get_recipes(branch=None, search=None, status=None):
	"""Every product that is sold: its recipe if any, its cost, price and margin."""
	_check_read()
	company, default_wh = _company_and_warehouse(branch)
	prices = _selling_prices(branch)

	filters = {"disabled": 0, "has_variants": 0, "is_sales_item": 1}
	items = frappe.get_list(
		"Item",
		filters=filters,
		or_filters=_search_filters(search),
		fields=["name", "item_name", "item_group", "is_stock_item", "image", "stock_uom"],
		order_by="item_name asc",
		limit_page_length=0,
	)
	# Resale stock items (a can of cola) need no recipe; they are listed only
	# once someone gave them one, since that recipe is then never applied.
	recipes = _default_boms([i.name for i in items])
	items = [i for i in items if not i.is_stock_item or i.name in recipes]

	costs = recipe_unit_costs(list(recipes), branch=branch, boms=recipes)
	rows = []
	for i in items:
		bom = recipes.get(i.name)
		cost = costs.get(i.name)
		price = prices.get(i.name)
		row = {
			"item_code": i.name,
			"item_name": i.item_name,
			"item_group": i.item_group,
			"image": i.image,
			"is_stock_item": cint(i.is_stock_item),
			"recipe": bom.name if bom else None,
			"ingredient_count": bom.count if bom else 0,
			"cost": cost["cost"] if cost else None,
			"cost_complete": cost["complete"] if cost else False,
			"price": price,
			"food_cost_percent": (cost["cost"] / price * 100) if cost and price else None,
			"warning": _warning(i, bom),
		}
		rows.append(row)

	if status == "with":
		rows = [r for r in rows if r["recipe"]]
	elif status == "without":
		rows = [r for r in rows if not r["recipe"] and not r["is_stock_item"]]
	elif status == "warning":
		rows = [r for r in rows if r["warning"] or (r["recipe"] and not r["cost_complete"])]

	sellable = [r for r in rows if not r["is_stock_item"]]
	costed = [r for r in rows if r["food_cost_percent"] is not None]
	return {
		"rows": rows,
		"summary": {
			"products": len(sellable),
			"with_recipe": len([r for r in sellable if r["recipe"]]),
			"without_recipe": len([r for r in sellable if not r["recipe"]]),
			"average_food_cost_percent": sum(r["food_cost_percent"] for r in costed) / len(costed) if costed else None,
		},
	}


# --------------------------------------------------------------------------- one recipe


@frappe.whitelist()
def get_recipe(item_code, branch=None):
	_check_read()
	item = frappe.db.get_value(
		"Item", item_code, ["name", "item_name", "item_group", "is_stock_item", "stock_uom", "image", "disabled"], as_dict=True
	)
	if not item:
		frappe.throw(_("Item {0} not found").format(item_code), frappe.DoesNotExistError)

	bom_name = _default_boms([item_code]).get(item_code)
	bom = frappe.get_doc("BOM", bom_name.name) if bom_name else None
	default_wh = consumption_warehouse(item_code, branch=branch)
	recipe_wh = _recipe_warehouse(bom) if bom else None
	source_wh = recipe_wh or default_wh

	lines = []
	if bom:
		codes = [r.item_code for r in bom.items]
		meta = {
			r.name: r for r in frappe.get_all(
				"Item", filters={"name": ["in", codes]},
				fields=["name", "item_name", "stock_uom", "is_stock_item", "image"],
			)
		}
		for r in bom.items:
			wh = r.source_warehouse or source_wh
			unit = ingredient_unit_cost(r.item_code, wh)
			m = meta.get(r.item_code) or frappe._dict()
			stock_qty = flt(r.stock_qty) / (flt(bom.quantity) or 1)
			lines.append({
				"item_code": r.item_code,
				"item_name": m.item_name or r.item_name,
				"is_kit": not cint(m.is_stock_item),
				"qty": flt(r.qty) / (flt(bom.quantity) or 1),
				"uom": r.uom,
				"stock_uom": r.stock_uom,
				"conversion_factor": flt(r.conversion_factor) or 1,
				"stock_qty": stock_qty,
				"source_warehouse": r.source_warehouse if r.source_warehouse != recipe_wh else None,
				"unit_cost": unit["rate"],
				"cost_source": unit["source"],
				"line_cost": unit["rate"] * stock_qty if unit["source"] != "none" else None,
				"uoms": _uom_options(r.item_code, r.stock_uom),
				"whole_number": _whole_number(r.uom),
				"available_qty": _available(r.item_code, wh),
				"last_purchase": _last_purchases([r.item_code]).get(r.item_code),
			})

	total = sum(l["line_cost"] or 0 for l in lines)
	price = _selling_prices(branch).get(item_code)
	history = frappe.get_all(
		"BOM", filters={"item": item_code, "docstatus": 1}, fields=["name", "creation", "owner", "is_default"],
		order_by="creation desc", limit_page_length=10,
	)
	return {
		"item": {
			"item_code": item.name,
			"item_name": item.item_name,
			"item_group": item.item_group,
			"image": item.image,
			"is_stock_item": cint(item.is_stock_item),
			"stock_uom": item.stock_uom,
		},
		"recipe": bom.name if bom else None,
		"source_warehouse": recipe_wh,
		"default_warehouse": default_wh,
		"ingredients": lines,
		"cost": total,
		"cost_complete": all(l["cost_source"] != "none" for l in lines) if lines else False,
		"price": price,
		"food_cost_percent": (total / price * 100) if price and lines else None,
		"history": [
			{"name": h.name, "creation": h.creation, "by": frappe.utils.get_fullname(h.owner), "current": bool(h.is_default)}
			for h in history
		],
		"warning": _warning(item, bom_name),
	}


@frappe.whitelist()
def search_ingredients(term=None, warehouse=None, exclude=None):
	"""Stock items to use as ingredients, plus products that have their own recipe (kits)."""
	_check_read()
	term = (term or "").strip()
	items = frappe.get_list(
		"Item",
		filters={"disabled": 0, "has_variants": 0, "is_fixed_asset": 0},
		or_filters=_search_filters(term),
		fields=["name", "item_name", "item_group", "stock_uom", "is_stock_item", "image"],
		order_by="item_name asc",
		limit_page_length=SEARCH_LIMIT * 3,
	)
	kits = _default_boms([i.name for i in items if not i.is_stock_item])
	out = []
	for i in items:
		if i.name == exclude or (not i.is_stock_item and i.name not in kits):
			continue
		unit = ingredient_unit_cost(i.name, warehouse)
		out.append({
			"item_code": i.name,
			"item_name": i.item_name,
			"item_group": i.item_group,
			"stock_uom": i.stock_uom,
			"is_kit": not i.is_stock_item,
			"uoms": _uom_options(i.name, i.stock_uom),
			"unit_cost": unit["rate"],
			"cost_source": unit["source"],
			"available_qty": _available(i.name, warehouse) if i.is_stock_item else None,
		})
		if len(out) >= SEARCH_LIMIT:
			break
	return out


@frappe.whitelist()
def price_ingredients(item_codes, warehouse=None):
	"""Cost per stock unit and stock on hand for ingredients, as taken from `warehouse`."""
	_check_read()
	codes = frappe.parse_json(item_codes) if isinstance(item_codes, str) else item_codes
	last = _last_purchases(codes)
	out = {}
	for code in codes or []:
		unit = ingredient_unit_cost(code, warehouse)
		out[code] = {
			"unit_cost": unit["rate"],
			"cost_source": unit["source"],
			"available_qty": _available(code, warehouse),
			"last_purchase": last.get(code),
		}
	return out


@frappe.whitelist(methods=["POST"])
def save_recipe(item_code, data):
	"""Save a product's recipe as a new BOM version and make it the one in force."""
	_check_write()
	data = frappe._dict(frappe.parse_json(data) if isinstance(data, str) else data)
	item = frappe.db.get_value("Item", item_code, ["name", "item_name", "has_variants", "disabled", "is_stock_item"], as_dict=True)
	if not item:
		frappe.throw(_("Item {0} not found").format(item_code), frappe.DoesNotExistError)
	if item.disabled:
		frappe.throw(_("{0} is disabled; enable it before giving it a recipe").format(item.item_name))
	if item.has_variants:
		frappe.throw(_("{0} is a template; give each variant its own recipe").format(item.item_name))

	current = _default_boms([item_code]).get(item_code)
	if (data.get("recipe") or None) != (current.name if current else None):
		frappe.throw(
			_("This recipe was changed by someone else after you opened it. Reload it and try again."),
			frappe.TimestampMismatchError,
		)

	lines = _validate_lines(item_code, data.get("ingredients") or [])
	source_wh = data.get("source_warehouse") or None
	company, _wh = _company_and_warehouse(data.get("branch"))
	if source_wh:
		_check_warehouse(source_wh, company)

	if current and _same_recipe(frappe.get_doc("BOM", current.name), lines, source_wh):
		return {"recipe": current.name, "changed": False}

	bom = frappe.new_doc("BOM")
	bom.update({
		"item": item_code,
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"quantity": 1,
		"uom": frappe.get_cached_value("Item", item_code, "stock_uom"),
		"is_active": 1,
		"is_default": 1,
		"with_operations": 0,
		"rm_cost_as_per": "Valuation Rate",
	})
	for l in lines:
		bom.append("items", {
			"item_code": l.item_code,
			"qty": l.qty,
			"uom": l.uom,
			"conversion_factor": l.conversion_factor,
			# ERPNext's BOM has no recipe-wide warehouse; each line carries it.
			"source_warehouse": l.source_warehouse or source_wh,
			"do_not_explode": 1,
		})
	bom.insert()
	bom.submit()

	# Retire the previous versions: one recipe in force per product.
	for old in frappe.get_all("BOM", filters={"item": item_code, "docstatus": 1, "name": ["!=", bom.name],
											   "is_active": 1}, pluck="name"):
		frappe.db.set_value("BOM", old, {"is_active": 0, "is_default": 0})
	frappe.db.set_value("Item", item_code, "default_bom", bom.name)
	return {"recipe": bom.name, "changed": True}


@frappe.whitelist(methods=["POST"])
def remove_recipe(item_code, recipe=None):
	"""Stop applying a recipe: the product will no longer consume ingredients when sold."""
	_check_write()
	current = _default_boms([item_code]).get(item_code)
	if not current:
		return {"removed": False}
	if recipe and recipe != current.name:
		frappe.throw(_("This recipe was changed by someone else after you opened it. Reload it and try again."),
					 frappe.TimestampMismatchError)
	for name in frappe.get_all("BOM", filters={"item": item_code, "docstatus": 1, "is_active": 1}, pluck="name"):
		frappe.db.set_value("BOM", name, {"is_active": 0, "is_default": 0})
	frappe.db.set_value("Item", item_code, "default_bom", None)
	return {"removed": True}


# --------------------------------------------------------------------------- costing (shared)


def recipe_unit_costs(item_codes, branch=None, boms=None):
	"""Live cost of one portion of each product that has a recipe.

	Returns {item: {"cost": float, "complete": bool}}; "complete" is False when
	any ingredient has never been bought, so the cost is a floor, not a fact.
	Used by the recipes page and the Food Cost report alike, so both show the
	same number.
	"""
	boms = boms if boms is not None else _default_boms(item_codes)
	out = {}
	for code in item_codes:
		bom = boms.get(code)
		if not bom:
			continue
		wh = consumption_warehouse(code, branch=branch)
		total, complete = 0.0, True
		for ing in explode(bom.name, 1):
			unit = ingredient_unit_cost(ing.item_code, ing.warehouse or wh)
			if unit["source"] == "none":
				complete = False
			total += unit["rate"] * ing.qty
		out[code] = {"cost": total, "complete": complete}
	return out


def ingredient_unit_cost(item_code, warehouse=None):
	"""Cost per stock unit of an ingredient, from what was paid for it."""
	if warehouse:
		bin_ = frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse},
								   ["actual_qty", "valuation_rate"], as_dict=True)
		if bin_ and flt(bin_.actual_qty) > 0 and flt(bin_.valuation_rate) > 0:
			return {"rate": flt(bin_.valuation_rate), "source": "warehouse"}
	avg = frappe.db.sql(
		"select sum(stock_value), sum(actual_qty) from `tabBin` where item_code=%s and actual_qty > 0",
		item_code,
	)
	if avg and flt(avg[0][1]) > 0 and flt(avg[0][0]) > 0:
		return {"rate": flt(avg[0][0]) / flt(avg[0][1]), "source": "average"}
	last = _last_purchases([item_code]).get(item_code)
	if last and last["rate"] > 0:
		return {"rate": last["rate"], "source": "purchase"}
	if not cint(frappe.get_cached_value("Item", item_code, "is_stock_item")):
		# A kit: the cost of its own recipe.
		kit = recipe_unit_costs([item_code]).get(item_code)
		if kit:
			return {"rate": kit["cost"], "source": "average" if kit["complete"] else "none"}
	return {"rate": 0.0, "source": "none"}


def explode(bom_name, qty, warehouse=None, depth=0, seen=None):
	"""A recipe's stock ingredients for `qty` portions, kits opened up.

	Returns rows (item_code, qty in stock unit, warehouse or None, recipe).
	"""
	seen = (seen or set()) | {bom_name}
	if depth > MAX_DEPTH:
		frappe.throw(_("Recipe {0} nests kits more than {1} levels deep").format(bom_name, MAX_DEPTH))
	bom = frappe.get_cached_doc("BOM", bom_name)
	per = flt(qty) / (flt(bom.quantity) or 1)
	out = []
	for r in bom.items:
		need = flt(r.stock_qty) * per
		wh = r.source_warehouse or warehouse
		if cint(frappe.get_cached_value("Item", r.item_code, "is_stock_item")):
			out.append(frappe._dict(item_code=r.item_code, qty=need, warehouse=wh, recipe=bom_name))
			continue
		kit = _default_boms([r.item_code]).get(r.item_code)
		if not kit or kit.name in seen:
			# A non-stock ingredient without a recipe cannot be taken from a shelf.
			continue
		out.extend(explode(kit.name, need, wh, depth + 1, seen))
	return out


def consumption_warehouse(item_code, branch=None, pos_profile=None, fallback=None):
	"""Where a product's ingredients are taken from when it is sold, unless its recipe names one.

	The warehouse of the production unit (kitchen, bar, hookah station) that
	makes this item group in the branch; else the sale's own warehouse; else
	the branch's.
	"""
	group = frappe.get_cached_value("Item", item_code, "item_group")
	if group:
		groups = [group] + _ancestors(group)
		unit_filters = {"warehouse": ["is", "set"]}
		if pos_profile:
			unit_filters["pos_profile"] = pos_profile
		elif branch and branch != "all":
			unit_filters["branch"] = branch
		for unit in frappe.get_all("URY Production Unit", filters=unit_filters, fields=["name", "warehouse"]):
			unit_groups = set(_unit_groups(unit.name))
			if unit_groups.intersection(groups):
				return unit.warehouse
	if fallback:
		return fallback
	if pos_profile:
		wh = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
		if wh:
			return wh
	return _company_and_warehouse(branch)[1]


# --------------------------------------------------------------------------- helpers


def _check_read():
	frappe.has_permission("BOM", "read", throw=True)


def _check_write():
	frappe.has_permission("BOM", "create", throw=True)
	frappe.has_permission("BOM", "submit", throw=True)


def _search_filters(term):
	term = (term or "").strip()
	if not term:
		return None
	like = f"%{term}%"
	return [["Item", "name", "like", like], ["Item", "item_name", "like", like], ["Item", "item_group", "like", like]]


def _default_boms(item_codes):
	"""{item: BOM row} for the recipe in force for each item."""
	if not item_codes:
		return {}
	rows = frappe.get_all(
		"BOM",
		filters={"item": ["in", item_codes], "is_active": 1, "is_default": 1, "docstatus": 1},
		fields=["name", "item", "modified"],
		order_by="creation desc",
	)
	out = {}
	for r in rows:
		if r.item not in out:
			out[r.item] = r
	if out:
		counts = dict(frappe.get_all(
			"BOM Item", filters={"parent": ["in", [r.name for r in out.values()]]},
			fields=["parent", "count(name) as n"], group_by="parent", as_list=True,
		))
		for r in out.values():
			r.count = cint(counts.get(r.name))
	return out


def _validate_lines(item_code, raw):
	if not raw:
		frappe.throw(_("Add at least one ingredient"))
	lines, seen = [], set()
	from erpnext.stock.get_item_details import get_conversion_factor

	for i, row in enumerate(raw, start=1):
		row = frappe._dict(row)
		code = (row.get("item_code") or "").strip()
		ing = frappe.db.get_value("Item", code, ["name", "item_name", "stock_uom", "is_stock_item", "disabled", "has_variants"], as_dict=True)
		if not ing or ing.disabled:
			frappe.throw(_("Row {0}: choose an ingredient").format(i))
		if code == item_code:
			frappe.throw(_("Row {0}: a product cannot be an ingredient of itself").format(i))
		if ing.has_variants:
			frappe.throw(_("Row {0}: {1} is a template; choose one of its variants").format(i, ing.item_name))
		if code in seen:
			frappe.throw(_("Row {0}: {1} is listed twice; put the full quantity on one row").format(i, ing.item_name))
		seen.add(code)
		if not ing.is_stock_item:
			kit = _default_boms([code]).get(code)
			if not kit:
				frappe.throw(_("Row {0}: {1} is not kept in stock and has no recipe of its own, so it cannot be deducted").format(i, ing.item_name))
			if item_code in {x.item_code for x in _explode_items(kit.name)}:
				frappe.throw(_("Row {0}: {1} already contains this product; a recipe cannot contain itself").format(i, ing.item_name))

		qty = flt(row.get("qty"))
		if qty <= 0:
			frappe.throw(_("Row {0}: quantity must be greater than zero").format(i))
		uom = row.get("uom") or ing.stock_uom
		factor = flt(get_conversion_factor(code, uom).get("conversion_factor"))
		if not factor:
			frappe.throw(_("Row {0}: unit {1} has no conversion to {2} for {3}").format(i, uom, ing.stock_uom, ing.item_name))
		if _whole_number(uom) and not _is_whole(qty):
			frappe.throw(_("Row {0}: {1} is counted in whole {2}; enter a whole number, or keep it in stock in a divisible unit such as Kg or Litre").format(i, ing.item_name, uom))
		if ing.is_stock_item and _whole_number(ing.stock_uom) and not _is_whole(qty * factor):
			frappe.throw(_("Row {0}: {1} is kept in stock in whole {2}, so one portion must use a whole number of them").format(i, ing.item_name, ing.stock_uom))
		wh = row.get("source_warehouse") or None
		if wh:
			_check_warehouse(wh, None)
		lines.append(frappe._dict(item_code=code, qty=qty, uom=uom, conversion_factor=factor, source_warehouse=wh))
	return lines


def _explode_items(bom_name):
	try:
		return explode(bom_name, 1)
	except Exception:
		return []


def _same_recipe(bom, lines, source_wh):
	if flt(bom.quantity) != 1:
		return False
	old = sorted((r.item_code, flt(r.qty), r.uom, r.source_warehouse or None) for r in bom.items)
	new = sorted((l.item_code, flt(l.qty), l.uom, l.source_warehouse or source_wh) for l in lines)
	return old == new


def _recipe_warehouse(bom):
	"""The warehouse the whole recipe is taken from, when every line agrees."""
	whs = {r.source_warehouse for r in bom.items}
	return whs.pop() if len(whs) == 1 else None


def _check_warehouse(warehouse, company):
	wh = frappe.db.get_value("Warehouse", warehouse, ["is_group", "disabled", "company"], as_dict=True)
	if not wh or wh.is_group or wh.disabled:
		frappe.throw(_("Warehouse {0} cannot hold stock").format(warehouse))
	if company and wh.company != company:
		frappe.throw(_("Warehouse {0} belongs to another company").format(warehouse))


def _whole_number(uom):
	return bool(uom) and bool(cint(frappe.get_cached_value("UOM", uom, "must_be_whole_number")))


def _is_whole(value):
	return math.isclose(value, round(value), abs_tol=1e-9)


def _uom_options(item_code, stock_uom):
	"""Units a recipe can measure this ingredient in, with their factor to the stock unit."""
	opts = {stock_uom: 1.0}
	for r in frappe.get_all("UOM Conversion Detail", filters={"parent": item_code, "parenttype": "Item"},
							fields=["uom", "conversion_factor"]):
		opts[r.uom] = flt(r.conversion_factor)
	# Global conversions (Gram -> Kg, ml -> Litre), so "50 g" works without
	# setting it up on every item — limited to kitchen units, not every unit
	# of mass ERPNext knows (Kip, Slug, Pood...).
	for r in frappe.get_all("UOM Conversion Factor", filters={"to_uom": stock_uom, "from_uom": ["in", KITCHEN_UOMS]},
							fields=["from_uom", "value"]):
		# 1 from_uom = value x stock unit.
		if r.from_uom not in opts and flt(r.value):
			opts[r.from_uom] = flt(r.value)
	for r in frappe.get_all("UOM Conversion Factor", filters={"from_uom": stock_uom, "to_uom": ["in", KITCHEN_UOMS]},
							fields=["to_uom", "value"]):
		# 1 stock unit = value x to_uom, so 1 to_uom = 1/value stock unit.
		if r.to_uom not in opts and flt(r.value):
			opts[r.to_uom] = 1 / flt(r.value)
	return [
		{"uom": u, "conversion_factor": f, "whole_number": _whole_number(u)}
		for u, f in opts.items() if f
	]


def _available(item_code, warehouse):
	if not warehouse:
		return None
	return flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))


def _last_purchases(item_codes):
	"""Last price paid per stock unit, with when and from whom."""
	if not item_codes:
		return {}
	pi = frappe.qb.DocType("Purchase Invoice")
	pii = frappe.qb.DocType("Purchase Invoice Item")
	rows = (
		frappe.qb.from_(pii).join(pi).on(pi.name == pii.parent)
		.select(pii.item_code, pii.base_net_rate, pii.conversion_factor, pi.posting_date, pi.supplier_name, pi.name)
		.where((pi.docstatus == 1) & (pi.is_return == 0) & pii.item_code.isin(item_codes))
		.orderby(pi.posting_date, order=frappe.qb.desc).orderby(pi.creation, order=frappe.qb.desc)
		.limit(200)
		.run(as_dict=True)
	)
	out = {}
	for r in rows:
		if r.item_code not in out:
			out[r.item_code] = {
				"rate": flt(r.base_net_rate) / (flt(r.conversion_factor) or 1),
				"date": r.posting_date,
				"supplier": r.supplier_name,
				"invoice": r.name,
			}
	return out


def _selling_prices(branch=None):
	"""Price of each product: the branch's active menu, else the selling price list."""
	prices = {}
	menus = []
	filters = {"branch": branch} if branch and branch != "all" else {}
	for r in frappe.get_all("URY Restaurant", filters=filters, fields=["active_menu"]):
		if r.active_menu:
			menus.append(r.active_menu)
	if menus:
		for r in frappe.get_all("URY Menu Item", filters={"parent": ["in", menus], "disabled": 0}, fields=["item", "rate"]):
			if flt(r.rate) and r.item not in prices:
				prices[r.item] = flt(r.rate)
	# A product on another menu still has a price worth comparing its cost to.
	for r in frappe.get_all("URY Menu Item", filters={"disabled": 0}, fields=["item", "rate"], order_by="modified desc"):
		if flt(r.rate) and r.item not in prices:
			prices[r.item] = flt(r.rate)
	price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
	for r in frappe.get_all("Item Price", filters={"price_list": price_list, "selling": 1}, fields=["item_code", "price_list_rate"]):
		if r.item_code not in prices and flt(r.price_list_rate):
			prices[r.item_code] = flt(r.price_list_rate)
	for r in frappe.get_all("Item", filters={"is_sales_item": 1, "standard_rate": [">", 0]}, fields=["name", "standard_rate"]):
		prices.setdefault(r.name, flt(r.standard_rate))
	return prices


def _warning(item, bom):
	if bom and cint(item.is_stock_item):
		# The sale already takes the product itself off the shelf; applying its
		# recipe too would count the same goods twice, so it is not applied.
		return "stock_item"
	return None


def _ancestors(group):
	try:
		from frappe.utils.nestedset import get_ancestors_of

		return get_ancestors_of("Item Group", group)
	except Exception:
		return []


def _unit_groups(unit):
	return frappe.get_all("URY Production Item Groups", filters={"parent": unit}, pluck="item_group")

