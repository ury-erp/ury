"""The dashboard's warehouses: what is in stock, where, what it is worth, and what needs attention.

Stock lives in ERPNext's Bin (one row per item per warehouse) and moves
through the Stock Ledger. This module reads both for one company, the one the
active branch belongs to, and shapes them for the warehouse map, the charts
and a warehouse's own item list.

A row's health:
  negative - quantity below zero; a booking mistake to fix, not real stock
  out      - nothing left of an item this warehouse has held
  low      - at or below its reorder level (Item Reorder for that warehouse,
             else the item's safety stock); items with neither are never low
  ok       - everything else
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

from ury.ury.api.purchases import _company_and_warehouse

PAGE_SIZES = (20, 50, 100)
STATUSES = ("ok", "low", "out", "negative")
STAGNANT_DAYS = 90
LAYOUT_LIMIT = 96
GROUP_LIMIT = 7


# --------------------------------------------------------------------------- overview


@frappe.whitelist()
def get_inventory_overview(branch=None, days=30):
	"""Everything the warehouses dashboard shows above the item list."""
	_check_access()
	days = min(max(cint(days) or 30, 7), 365)
	company, _branch_wh = _company_and_warehouse(branch)
	main = frappe.db.get_single_value("Stock Settings", "default_warehouse")
	if main and frappe.db.get_value("Warehouse", main, "company") != company:
		main = None

	warehouses = frappe.get_list(
		"Warehouse",
		filters={"company": company, "disabled": 0},
		fields=["name", "warehouse_name", "parent_warehouse", "is_group", "warehouse_type", "is_rejected_warehouse", "lft", "rgt"],
		order_by="lft asc",
		limit_page_length=0,
	)
	leaves = [w.name for w in warehouses if not w.is_group]
	rows = _bin_rows(leaves)

	per_wh = {}
	# Low/out/negative count positions (an item in a warehouse), the same unit
	# as each warehouse's own counts, so the headline equals their sum.
	items_in_stock = set()
	positions = {"low": 0, "out": 0, "negative": 0}
	total_value = 0.0
	stagnant_value, stagnant_count = 0.0, 0
	by_group = {}
	for r in rows:
		s = per_wh.setdefault(r.warehouse, frappe._dict(
			item_count=0, total_qty=0.0, stock_value=0.0, ok=0, low=0, out=0, negative=0, stagnant=0,
		))
		s[r.status] += 1
		s.stock_value += flt(r.stock_value)
		if flt(r.actual_qty) > 0:
			s.item_count += 1
			s.total_qty += flt(r.actual_qty)
			items_in_stock.add(r.item_code)
			total_value += flt(r.stock_value)
			by_group[r.item_group or _("Other")] = by_group.get(r.item_group or _("Other"), 0.0) + flt(r.stock_value)
			if r.stagnant:
				s.stagnant += 1
				stagnant_count += 1
				stagnant_value += flt(r.stock_value)
		if r.status in positions:
			positions[r.status] += 1

	last_moves = _last_movement(leaves)
	out = []
	for w in warehouses:
		if w.is_group:
			children = [c for c in warehouses if not c.is_group and c.lft > w.lft and c.rgt < w.rgt]
			stats = frappe._dict(item_count=0, total_qty=0.0, stock_value=0.0, ok=0, low=0, out=0, negative=0, stagnant=0)
			for c in children:
				for key, value in (per_wh.get(c.name) or {}).items():
					stats[key] += value
			last = max((last_moves.get(c.name) for c in children if last_moves.get(c.name)), default=None)
		else:
			stats = per_wh.get(w.name) or frappe._dict(item_count=0, total_qty=0.0, stock_value=0.0, ok=0, low=0, out=0, negative=0, stagnant=0)
			last = last_moves.get(w.name)
		out.append({
			"name": w.name,
			"label": w.warehouse_name or w.name,
			"parent": w.parent_warehouse,
			"is_group": cint(w.is_group),
			"is_main": w.name == main,
			"is_transit": w.warehouse_type == "Transit",
			"is_rejected": cint(w.is_rejected_warehouse),
			"item_count": cint(stats.item_count),
			"total_qty": flt(stats.total_qty),
			"stock_value": flt(stats.stock_value),
			"low_count": cint(stats.low),
			"out_count": cint(stats.out),
			"negative_count": cint(stats.negative),
			"stagnant_count": cint(stats.stagnant),
			"last_movement": last,
		})

	groups = sorted(by_group.items(), key=lambda kv: kv[1], reverse=True)
	if len(groups) > GROUP_LIMIT:
		rest = sum(v for _k, v in groups[GROUP_LIMIT - 1:])
		groups = groups[:GROUP_LIMIT - 1] + [(_("Other"), rest)]

	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"main_warehouse": main,
		"today": nowdate(),
		"days": days,
		"warehouses": out,
		"kpis": {
			"stock_value": total_value,
			"items_in_stock": len(items_in_stock),
			"low_count": positions["low"],
			"out_count": positions["out"],
			"negative_count": positions["negative"],
			"stagnant_value": stagnant_value,
			"stagnant_count": stagnant_count,
			"warehouse_count": len(leaves),
		},
		"value_by_group": [{"item_group": k, "value": v} for k, v in groups if v],
		"movement": _movement(leaves, days),
		"recent": _recent(leaves),
	}


# --------------------------------------------------------------------------- one warehouse


@frappe.whitelist()
def get_warehouse_stock(warehouse, search=None, status=None, item_group=None, page=1, page_size=20,
						sort="value"):
	"""A warehouse's items (a group warehouse covers all its children), paged and filtered."""
	_check_access()
	leaves = _leaves_of(warehouse)
	page = max(cint(page), 1)
	page_size = cint(page_size) if cint(page_size) in PAGE_SIZES else PAGE_SIZES[0]

	rows = _bin_rows(leaves)
	if len(leaves) > 1:
		rows = _merge_by_item(rows)

	term = (search or "").strip().lower()
	if term:
		rows = [r for r in rows if term in (r.item_code or "").lower() or term in (r.item_name or "").lower()]
	if item_group:
		rows = [r for r in rows if r.item_group == item_group]
	counts = {s: 0 for s in STATUSES}
	for r in rows:
		counts[r.status] += 1
	if status in STATUSES:
		rows = [r for r in rows if r.status == status]
	elif status == "stagnant":
		rows = [r for r in rows if r.stagnant]

	key = {
		"value": lambda r: -flt(r.stock_value),
		"qty": lambda r: -flt(r.actual_qty),
		"name": lambda r: (r.item_name or r.item_code or "").lower(),
		# Most urgent first: negative, out, low, then ok.
		"status": lambda r: (("negative", "out", "low", "ok").index(r.status), (r.item_name or "").lower()),
	}.get(sort) or (lambda r: -flt(r.stock_value))
	rows.sort(key=key)

	total = len(rows)
	start = (page - 1) * page_size
	return {
		"warehouse": warehouse,
		"rows": [_public_row(r) for r in rows[start:start + page_size]],
		"total": total,
		"value": sum(flt(r.stock_value) for r in rows),
		"status_counts": counts,
		"item_groups": sorted({r.item_group for r in _bin_rows(leaves) if r.item_group}),
		"page": page,
		"page_size": page_size,
	}


@frappe.whitelist()
def get_warehouse_layout(warehouse):
	"""The items to draw inside a warehouse: the most valuable ones, grouped into racks by item group."""
	_check_access()
	leaves = _leaves_of(warehouse)
	rows = _bin_rows(leaves)
	if len(leaves) > 1:
		rows = _merge_by_item(rows)
	# Out-of-stock rows are kept: they are drawn as empty slots, the thing to notice.
	rows.sort(key=lambda r: (r.status not in ("out", "negative", "low"), -flt(r.stock_value)))
	shown = rows[:LAYOUT_LIMIT]

	racks = {}
	for r in shown:
		racks.setdefault(r.item_group or _("Other"), []).append(_public_row(r))
	ordered = sorted(racks.items(), key=lambda kv: -sum(i["stock_value"] for i in kv[1]))
	return {
		"warehouse": warehouse,
		"racks": [{"item_group": k, "items": v} for k, v in ordered],
		"total_items": len(rows),
		"shown_items": len(shown),
	}


# --------------------------------------------------------------------------- helpers


def _check_access():
	frappe.has_permission("Warehouse", "read", throw=True)
	frappe.has_permission("Bin", "read", throw=True)


def _leaves_of(warehouse):
	wh = frappe.db.get_value("Warehouse", warehouse, ["name", "is_group", "lft", "rgt", "company"], as_dict=True)
	if not wh:
		frappe.throw(_("Warehouse {0} not found").format(warehouse), frappe.DoesNotExistError)
	if not frappe.has_permission("Warehouse", "read", doc=wh.name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if not wh.is_group:
		return [wh.name]
	return frappe.get_all(
		"Warehouse",
		filters={"lft": [">", wh.lft], "rgt": ["<", wh.rgt], "is_group": 0, "disabled": 0},
		pluck="name",
	)


def _bin_rows(warehouses):
	"""Bin rows for these warehouses, with the item's details, reorder level, health and staleness."""
	if not warehouses:
		return []
	rows = _fetch_bins(warehouses)
	if not rows:
		return []
	reorder = _reorder_levels(warehouses)

	cutoff = getdate(add_days(nowdate(), -STAGNANT_DAYS))
	history = _ledger_history(warehouses)

	for r in rows:
		r.reorder_level = reorder.get((r.item_code, r.warehouse)) or flt(r.safety_stock)
		r.status = _status(flt(r.actual_qty), r.reorder_level)
		first_in, r.last_out = history.get((r.item_code, r.warehouse), (None, None))
		# Held for a quarter without a single unit leaving: tied-up money, and
		# for a kitchen, a freshness question. Fresh arrivals are not stagnant.
		r.stagnant = bool(
			flt(r.actual_qty) > 0
			and first_in and getdate(first_in) < cutoff
			and (r.last_out is None or getdate(r.last_out) < cutoff)
		)
	return rows


def _fetch_bins(warehouses):
	b = frappe.qb.DocType("Bin")
	item = frappe.qb.DocType("Item")
	return (
		frappe.qb.from_(b)
		.join(item).on(item.name == b.item_code)
		.select(
			b.item_code, b.warehouse, b.actual_qty, b.reserved_qty, b.projected_qty, b.ordered_qty,
			b.valuation_rate, b.stock_value, b.stock_uom,
			item.item_name, item.item_group, item.image, item.safety_stock,
		)
		.where(b.warehouse.isin(warehouses))
		.where(item.is_stock_item == 1)
		.run(as_dict=True)
	)


def _reorder_levels(warehouses):
	"""Each item's reorder level per warehouse, from Item Reorder."""
	ir = frappe.qb.DocType("Item Reorder")
	return {
		(r.parent, r.warehouse): flt(r.warehouse_reorder_level)
		for r in (
			frappe.qb.from_(ir)
			.select(ir.parent, ir.warehouse, ir.warehouse_reorder_level)
			.where(ir.warehouse.isin(warehouses))
			.where(ir.parenttype == "Item")
			.run(as_dict=True)
		)
	}


def _status(qty, reorder_level):
	if qty < 0:
		return "negative"
	if qty == 0:
		return "out"
	if reorder_level and qty <= reorder_level:
		return "low"
	return "ok"


def _ledger_history(warehouses):
	"""(first movement, last outgoing movement) per item and warehouse, in one query."""
	rows = frappe.db.sql(
		"""
		select item_code, warehouse, min(posting_date) as first_in,
			max(case when actual_qty < 0 then posting_date end) as last_out
		from `tabStock Ledger Entry`
		where is_cancelled = 0 and warehouse in %(warehouses)s
		group by item_code, warehouse
		""",
		{"warehouses": warehouses},
		as_dict=True,
	)
	return {(r.item_code, r.warehouse): (r.first_in, r.last_out) for r in rows}


def _last_movement(warehouses):
	if not warehouses:
		return {}
	sle = frappe.qb.DocType("Stock Ledger Entry")
	from frappe.query_builder.functions import Max

	rows = (
		frappe.qb.from_(sle)
		.select(sle.warehouse, Max(sle.posting_date).as_("last"))
		.where(sle.warehouse.isin(warehouses))
		.where(sle.is_cancelled == 0)
		.groupby(sle.warehouse)
		.run(as_dict=True)
	)
	return {r.warehouse: r.last for r in rows}


def _movement(warehouses, days):
	"""Value received and issued per day (per week past a month), oldest first, gaps filled."""
	today = getdate(nowdate())
	start = getdate(add_days(today, -(days - 1)))
	weekly = days > 31
	buckets = {}
	d = start
	while d <= today:
		key = _bucket(d, start, weekly)
		buckets.setdefault(key, {"date": str(key), "in_value": 0.0, "out_value": 0.0, "in_count": 0, "out_count": 0})
		d = getdate(add_days(d, 1))
	if warehouses:
		for r in frappe.db.sql(
			"""
			select posting_date,
				sum(case when stock_value_difference > 0 then stock_value_difference else 0 end) as in_value,
				sum(case when stock_value_difference < 0 then -stock_value_difference else 0 end) as out_value,
				sum(case when actual_qty > 0 then 1 else 0 end) as in_count,
				sum(case when actual_qty < 0 then 1 else 0 end) as out_count
			from `tabStock Ledger Entry`
			where is_cancelled = 0 and warehouse in %(warehouses)s
				and posting_date between %(start)s and %(end)s
			group by posting_date
			""",
			{"warehouses": warehouses, "start": start, "end": today},
			as_dict=True,
		):
			b = buckets.get(_bucket(getdate(r.posting_date), start, weekly))
			if b:
				b["in_value"] += flt(r.in_value)
				b["out_value"] += flt(r.out_value)
				b["in_count"] += cint(r.in_count)
				b["out_count"] += cint(r.out_count)
	return {"granularity": "week" if weekly else "day", "points": list(buckets.values())}


def _bucket(d, start, weekly):
	if not weekly:
		return d
	return getdate(add_days(start, ((d - start).days // 7) * 7))


def _recent(warehouses, limit=12):
	if not warehouses:
		return []
	rows = frappe.get_all(
		"Stock Ledger Entry",
		filters={"warehouse": ["in", warehouses], "is_cancelled": 0},
		fields=["item_code", "warehouse", "actual_qty", "stock_value_difference", "voucher_type", "voucher_no",
				"posting_date", "posting_time", "stock_uom"],
		order_by="posting_date desc, posting_time desc, creation desc",
		limit_page_length=limit,
	)
	names = dict(frappe.get_all("Item", filters={"name": ["in", list({r.item_code for r in rows})]},
								fields=["name", "item_name"], as_list=True)) if rows else {}
	for r in rows:
		r.item_name = names.get(r.item_code) or r.item_code
	return rows


def _merge_by_item(rows):
	"""One row per item across several warehouses (a group warehouse's view)."""
	merged = {}
	for r in rows:
		m = merged.get(r.item_code)
		if not m:
			merged[r.item_code] = frappe._dict(r, warehouses=1)
			continue
		for f in ("actual_qty", "reserved_qty", "projected_qty", "ordered_qty", "stock_value", "reorder_level"):
			m[f] = flt(m.get(f)) + flt(r.get(f))
		m.warehouses += 1
		m.stagnant = m.stagnant and r.stagnant
		if r.last_out and (not m.last_out or getdate(r.last_out) > getdate(m.last_out)):
			m.last_out = r.last_out
	for m in merged.values():
		m.valuation_rate = flt(m.stock_value) / flt(m.actual_qty) if flt(m.actual_qty) > 0 else flt(m.valuation_rate)
		m.status = _status(flt(m.actual_qty), m.reorder_level)
		m.warehouse = None
	return list(merged.values())


def _public_row(r):
	return {
		"item_code": r.item_code,
		"item_name": r.item_name,
		"item_group": r.item_group,
		"image": r.image,
		"warehouse": r.get("warehouse"),
		"stock_uom": r.stock_uom,
		"actual_qty": flt(r.actual_qty),
		"reserved_qty": flt(r.reserved_qty),
		"ordered_qty": flt(r.ordered_qty),
		"projected_qty": flt(r.projected_qty),
		"valuation_rate": flt(r.valuation_rate),
		"stock_value": flt(r.stock_value),
		"reorder_level": flt(r.reorder_level),
		"status": r.status,
		"stagnant": bool(r.stagnant),
		"last_out": r.last_out,
	}
