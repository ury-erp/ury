"""Read-only operations tools for HUF: org structure, stock, reorder, transfers,
recipes, production, theoretical-vs-actual variance and outlet P&L.

These sit next to `ury_tools.py` (floor/shift/report tools) and follow the
same rules: every function is whitelisted, calls `require_manager()` first,
and only ever reads. Results are shaped for an LLM — small, named fields,
long lists capped via `ury_report_catalog.compact` — rather than for a UI.

Branch → warehouse scoping: a branch's stock lives in its POS Profile
warehouse plus every `URY Production Department.department_warehouse` for
that branch (kitchen, bar, ...). Company scoping covers all of its
non-group warehouses.
"""

import frappe
from frappe.utils import cint, flt, getdate, today

from ury.ury.ai_tools.ury_report_catalog import compact, llm_sized, resolve_period
from ury.ury.report_api.utils import require_manager

MAX_ROWS = 40

# Stock Entry purposes / voucher types that represent consumption (as opposed
# to moving stock between warehouses) for theoretical-vs-actual variance.
_CONSUMPTION_SE_PURPOSES = ("Manufacture", "Material Issue", "Material Consumption for Manufacture", "Repack")
_SALE_VOUCHERS = ("Sales Invoice", "POS Invoice", "Delivery Note")


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------


def _period(period=None, start_date=None, end_date=None, default="today"):
	if start_date or end_date:
		s = str(getdate(start_date or end_date))
		e = str(getdate(end_date or start_date))
		return s, e
	return resolve_period(period or default)


def _branch_company(branch):
	company = frappe.db.get_value("Branch", branch, "company")
	if company is None and not frappe.db.exists("Branch", branch):
		frappe.throw(
			f"Unknown branch '{branch}'. Branches: {', '.join(frappe.get_all('Branch', pluck='name'))}",
			frappe.ValidationError,
		)
	return company


def branch_warehouses(branch):
	whs = set(frappe.get_all("POS Profile", filters={"branch": branch, "disabled": 0}, pluck="warehouse"))
	whs |= set(
		frappe.get_all(
			"URY Production Department",
			filters={"branch": branch, "enabled": 1},
			pluck="department_warehouse",
		)
	)
	return sorted(w for w in whs if w)


def _company_warehouses(company):
	return frappe.get_all("Warehouse", filters={"company": company, "is_group": 0}, pluck="name", order_by="name")


def _scope_warehouses(branch=None, company=None, warehouse=None):
	if warehouse:
		return [warehouse]
	if branch:
		return branch_warehouses(branch)
	if company:
		return _company_warehouses(company)
	return None  # no restriction


def _in(values):
	return ", ".join(frappe.db.escape(v) for v in values)


def _currency(company):
	return frappe.get_cached_value("Company", company, "default_currency") if company else None


# ---------------------------------------------------------------------------
# Org structure & lookup
# ---------------------------------------------------------------------------


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_org_structure(company=None):
	"""Companies (legal entities, with parent group and currency) → branches
	(outlets) → restaurant/brand, active menu, POS profile and the
	warehouses each outlet draws stock from, plus central/transit stores."""
	require_manager()
	companies = frappe.get_all(
		"Company",
		filters={"name": company} if company else {},
		fields=["name", "abbr", "parent_company", "default_currency", "country", "is_group"],
		order_by="name",
	)
	out = []
	for c in companies:
		branches = []
		for b in frappe.get_all("Branch", filters={"company": c.name}, pluck="name", order_by="name"):
			rest = frappe.db.get_value("URY Restaurant", {"branch": b}, ["name", "active_menu"], as_dict=True) or {}
			branches.append(
				{
					"branch": b,
					"restaurant": rest.get("name"),
					"active_menu": rest.get("active_menu"),
					"pos_profiles": frappe.get_all("POS Profile", filters={"branch": b, "disabled": 0}, pluck="name"),
					"production_departments": frappe.get_all(
						"URY Production Department",
						filters={"branch": b, "enabled": 1},
						fields=["name", "department_warehouse as warehouse"],
					),
				}
			)
		branch_whs = {w for b in branches for w in branch_warehouses(b["branch"])}
		other_whs = frappe.get_all(
			"Warehouse",
			filters={"company": c.name, "is_group": 0, "name": ["not in", list(branch_whs) or [""]]},
			fields=["name", "warehouse_type"],
			order_by="name",
		)
		out.append(
			{
				"company": c.name,
				"abbr": c.abbr,
				"parent_company": c.parent_company or None,
				"currency": c.default_currency,
				"country": c.country,
				"is_group": c.is_group,
				"branches": branches,
				"central_and_other_warehouses": other_whs,
			}
		)
	brands = frappe.db.sql("select distinct brand from `tabItem` where ifnull(brand,'')!='' limit 20", pluck=True)
	return {
		"companies": out,
		"item_brands": brands,
		"note": "Each branch has its own URY Restaurant (brand/outlet), menu and warehouses; companies are separate legal entities with their own currency and books.",
	}


_LOOKUPS = {
	"branch": ("Branch", ["name", "company"], ["name"]),
	"company": ("Company", ["name", "abbr", "default_currency", "parent_company"], ["name", "abbr"]),
	"item": ("Item", ["name as item_code", "item_name", "item_group", "stock_uom", "is_stock_item"], ["name", "item_name"]),
	"item_group": ("Item Group", ["name", "parent_item_group"], ["name"]),
	"customer": ("Customer", ["name", "customer_name", "mobile_no"], ["name", "customer_name", "mobile_no"]),
	"employee": ("User", ["name as user_id", "full_name"], ["name", "full_name"]),
	"warehouse": ("Warehouse", ["name", "company", "warehouse_type"], ["name"]),
	"supplier": ("Supplier", ["name", "supplier_name"], ["name", "supplier_name"]),
	"menu": ("URY Menu", ["name", "branch"], ["name"]),
	"department": ("URY Production Department", ["name", "branch", "department_warehouse"], ["name"]),
}


@frappe.whitelist(methods=["GET"])
@llm_sized
def lookup(entity, query="", company=None, limit=10):
	"""Fuzzy-find exact record names to use as filters: branch, company, item,
	item_group, customer, employee (user id), warehouse, supplier, menu,
	department."""
	require_manager()
	entity = (entity or "").strip().lower().replace(" ", "_")
	entity = {"items": "item", "dish": "item", "user": "employee", "waiter": "employee", "outlet": "branch"}.get(entity, entity)
	if entity not in _LOOKUPS:
		frappe.throw(f"entity must be one of: {', '.join(_LOOKUPS)}", frappe.ValidationError)
	doctype, fields, search_fields = _LOOKUPS[entity]
	filters = {}
	if company and entity in ("branch", "warehouse"):
		filters["company"] = company
	if entity == "employee":
		filters["user_type"] = "System User"
		filters["enabled"] = 1
	or_filters = {f: ["like", f"%{query}%"] for f in search_fields} if query else None
	rows = frappe.get_all(
		doctype, filters=filters, or_filters=or_filters, fields=fields, limit=min(cint(limit) or 10, 50), order_by="modified desc"
	)
	return {"entity": entity, "query": query, "matches": rows}


# ---------------------------------------------------------------------------
# Stock: bin levels, reorder, requests, transfers, movements
# ---------------------------------------------------------------------------


def _reorder_rules(items=None, warehouses=None):
	cond, params = ["ir.parenttype='Item'"], {}
	if items:
		cond.append("ir.parent in %(items)s")
		params["items"] = tuple(items)
	if warehouses:
		cond.append("ir.warehouse in %(whs)s")
		params["whs"] = tuple(warehouses)
	rows = frappe.db.sql(
		f"""select ir.parent item_code, ir.warehouse, ir.warehouse_reorder_level, ir.warehouse_reorder_qty,
			ir.material_request_type
		from `tabItem Reorder` ir where {' and '.join(cond)}""",
		params,
		as_dict=True,
	)
	return {(r.item_code, r.warehouse): r for r in rows}


def _reorder_view(bin_row, rule):
	if not rule:
		return {}
	level = flt(rule.warehouse_reorder_level)
	qty = flt(rule.warehouse_reorder_qty)
	projected = flt(bin_row.get("projected_qty"))
	due = projected < level
	return {
		"min_reorder_level": level,
		"reorder_qty": qty,
		"max_level": level + qty,
		"replenish_by": rule.material_request_type,
		"reorder_due": due,
		# ERPNext's own reorder job formula (erpnext.stock.reorder_item)
		"suggested_order_qty": max(qty, level - projected) if due else 0,
	}


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_stock_levels(item=None, branch=None, company=None, warehouse=None, item_group=None, status=None, limit=MAX_ROWS):
	"""Bin-level stock per item × warehouse: on hand, reserved, requested,
	ordered, projected, value, and — where the outlet has min/max set — the
	reorder level, max level and whether a reorder is due.

	status: 'below_reorder' | 'out_of_stock' | 'negative' | 'in_stock'."""
	require_manager()
	whs = _scope_warehouses(branch, company, warehouse)
	cond, params = ["1=1"], {}
	if whs is not None:
		if not whs:
			return {"rows": [], "note": f"No warehouses mapped to branch {branch}."}
		cond.append("b.warehouse in %(whs)s")
		params["whs"] = tuple(whs)
	if item:
		cond.append("(b.item_code = %(item)s or i.item_name like %(item_like)s)")
		params.update(item=item, item_like=f"%{item}%")
	if item_group:
		cond.append("i.item_group = %(ig)s")
		params["ig"] = item_group
	if status == "out_of_stock":
		cond.append("b.actual_qty <= 0")
	elif status == "negative":
		cond.append("b.actual_qty < 0")
	elif status == "in_stock":
		cond.append("b.actual_qty > 0")

	rows = frappe.db.sql(
		f"""select b.item_code, i.item_name, i.item_group, b.warehouse, i.stock_uom uom,
			b.actual_qty on_hand, b.reserved_qty reserved, b.indented_qty requested,
			b.ordered_qty ordered, b.projected_qty projected, b.valuation_rate, b.stock_value
		from `tabBin` b join `tabItem` i on i.name = b.item_code
		where {' and '.join(cond)}
		order by b.warehouse, i.item_name""",
		params,
		as_dict=True,
	)
	rules = _reorder_rules(warehouses=whs, items=[r.item_code for r in rows] if item else None)
	out = []
	for r in rows:
		view = {**r, **_reorder_view(r, rules.get((r.item_code, r.warehouse)))}
		if status == "below_reorder" and not view.get("reorder_due"):
			continue
		out.append(view)
	total_value = sum(flt(r["stock_value"]) for r in out)
	return {
		"scope": {"branch": branch, "company": company, "warehouses": whs},
		"row_count": len(out),
		"total_stock_value": flt(total_value, 3),
		"currency": _currency(company or (branch and _branch_company(branch))),
		"rows": compact(out, max_rows=cint(limit) or MAX_ROWS),
	}


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_reorder_status(branch=None, company=None, warehouse=None):
	"""Min / max / reorder-point view for an outlet: every item with a reorder
	rule, its projected stock vs min, whether a reorder is due, and the
	Material Requests the outlet has raised (incl. auto-raised by ERPNext's
	reorder job) with their fulfilment status."""
	require_manager()
	whs = _scope_warehouses(branch, company, warehouse)
	rules = _reorder_rules(warehouses=whs)
	items = []
	for (item_code, wh), rule in rules.items():
		b = frappe.db.get_value(
			"Bin", {"item_code": item_code, "warehouse": wh}, ["actual_qty", "projected_qty", "indented_qty"], as_dict=True
		) or {"actual_qty": 0, "projected_qty": 0, "indented_qty": 0}
		items.append(
			{
				"item_code": item_code,
				"item_name": frappe.get_cached_value("Item", item_code, "item_name"),
				"warehouse": wh,
				"on_hand": flt(b["actual_qty"]),
				"projected": flt(b["projected_qty"]),
				"already_requested": flt(b["indented_qty"]),
				**_reorder_view(b, rule),
			}
		)
	due = sorted((r for r in items if r["reorder_due"]), key=lambda r: (r["warehouse"], r["item_name"] or ""))
	requests = _material_requests(branch=branch, company=company, warehouse=warehouse, status="open")
	transit = _pending_transit_by_destination(company or (branch and _branch_company(branch)))
	for r in due:
		for k in ("reorder_due", "replenish_by"):
			r.pop(k, None)
		r["open_requests"] = [
			mr["name"]
			for mr in requests["requests"]
			if isinstance(mr, dict)
			and any(
				isinstance(l, dict) and l.get("item_code") == r["item_code"] and (l.get("warehouse") or mr.get("set_warehouse")) == r["warehouse"]
				for l in mr.get("lines") or []
			)
		]
		on_way = transit.get((r["item_code"], r["warehouse"]))
		if on_way:
			r["in_transit_qty"] = flt(on_way["qty"], 3)
			r["in_transit_dispatches"] = sorted(on_way["dispatches"])
			r["covered_by_transit"] = flt(r["projected"]) + flt(on_way["qty"]) >= flt(r["min_reorder_level"])
	slim_requests = [
		{
			"name": mr["name"],
			"type": mr.get("material_request_type"),
			"status": mr.get("status"),
			"raised_by": mr.get("raised_by"),
			"date": mr.get("transaction_date"),
			"for_warehouse": mr.get("set_warehouse"),
			"items": [
				{"item_code": l.get("item_code"), "qty": l.get("qty"), "uom": l.get("uom")}
				for l in mr.get("lines") or []
				if isinstance(l, dict) and l.get("item_code")
			],
		}
		for mr in requests["requests"]
		if isinstance(mr, dict) and mr.get("name")
	]
	return {
		"scope": {"branch": branch, "company": company, "warehouses": whs},
		"items_with_min_max_rules": len(items),
		"items_reorder_due": len(due),
		"auto_reorder_enabled": bool(cint(frappe.db.get_single_value("Stock Settings", "auto_indent"))),
		"reorder_due_items": due,
		"open_material_requests": slim_requests,
		"items_already_on_the_way": sum(1 for r in due if r.get("in_transit_qty")),
		"note": (
			"Reorder is due when projected qty (on hand + ordered + requested − reserved) falls below the min level; "
			"ERPNext's auto-reorder then raises a Material Request for max(reorder qty, min − projected). Goods already "
			"dispatched from the central store and still in transit are not in projected qty — see in_transit_qty."
		),
	}


def _pending_transit_by_destination(company=None):
	"""{(item_code, destination_warehouse): {qty, dispatches}} for transfer
	lines dispatched into a transit warehouse and not yet received."""
	cond = {"docstatus": 1, "purpose": "Material Transfer", "add_to_transit": 1, "per_transferred": ["<", 100]}
	if company:
		cond["company"] = company
	out = {}
	for se in frappe.get_all("Stock Entry", filters=cond, fields=["name", "branch"]):
		for l in frappe.get_all(
			"Stock Entry Detail", filters={"parent": se.name}, fields=["item_code", "qty", "transferred_qty", "material_request"]
		):
			pending = flt(l.qty) - flt(l.transferred_qty)
			if pending <= 1e-9:
				continue
			dest = frappe.db.get_value("Material Request", l.material_request, "set_warehouse") if l.material_request else None
			if not dest and se.branch:
				dest = next(iter(branch_warehouses(se.branch)), None)
			row = out.setdefault((l.item_code, dest), {"qty": 0.0, "dispatches": set()})
			row["qty"] += pending
			row["dispatches"].add(se.name)
	return out


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_material_requests(branch=None, company=None, warehouse=None, status="open", request_type=None, period=None, name=None):
	"""Material Requests (outlet indents / purchase requests): who raised them,
	target warehouse, type, status, % ordered/transferred and line items.
	status: 'open' (default) | 'all' | an exact ERPNext status."""
	require_manager()
	return _material_requests(branch, company, warehouse, status, request_type, period, name)


def _material_requests(branch=None, company=None, warehouse=None, status="open", request_type=None, period=None, name=None):
	filters = {"docstatus": 1}
	if name:
		filters = {"name": name}
	else:
		if company or branch:
			filters["company"] = company or _branch_company(branch)
		if request_type:
			filters["material_request_type"] = request_type
		if status == "open":
			filters["status"] = ["not in", ["Stopped", "Cancelled", "Received", "Transferred", "Issued", "Ordered"]]
		elif status and status != "all":
			filters["status"] = status
		if period:
			s, e = resolve_period(period)
			filters["transaction_date"] = ["between", [s, e]]
	mrs = frappe.get_all(
		"Material Request",
		filters=filters,
		fields=[
			"name", "material_request_type", "status", "transfer_status", "per_ordered", "per_received",
			"transaction_date", "schedule_date", "set_warehouse", "company", "owner",
		],
		order_by="creation desc",
		limit=60,
	)
	whs = set(_scope_warehouses(branch, None, warehouse) or [])
	out = []
	for mr in mrs:
		lines = frappe.get_all(
			"Material Request Item",
			filters={"parent": mr.name},
			fields=["item_code", "item_name", "qty", "ordered_qty", "received_qty", "uom", "warehouse", "from_warehouse"],
			order_by="idx",
		)
		if whs and not any(l.warehouse in whs for l in lines) and mr.set_warehouse not in whs:
			continue
		mr["raised_by"] = "ERPNext auto-reorder" if mr.owner == "Administrator" else mr.owner
		mr["line_count"] = len(lines)
		mr["lines"] = lines[:15]
		out.append(mr)
	return {"count": len(out), "requests": compact(out, 20)}


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_transfers(company=None, branch=None, status="in_transit", period=None, name=None):
	"""Stock transfers between the central store and outlets via the
	Goods-In-Transit warehouse: each dispatch, its final destination, what
	has been received, and every line still on the road (qty and value).
	status: 'in_transit' (default — everything not yet fully received,
	whenever it was dispatched) | 'all' (filtered by `period`)."""
	require_manager()
	filters = {"docstatus": 1, "purpose": "Material Transfer", "add_to_transit": 1}
	if name:
		filters["name"] = name
	if company or branch:
		filters["company"] = company or _branch_company(branch)
	if status == "in_transit":
		filters["per_transferred"] = ["<", 100]
	elif period:
		s, e = resolve_period(period)
		filters["posting_date"] = ["between", [s, e]]
	entries = frappe.get_all(
		"Stock Entry",
		filters=filters,
		fields=["name", "posting_date", "branch", "company", "from_warehouse", "to_warehouse", "per_transferred", "total_outgoing_value"],
		order_by="posting_date desc, posting_time desc",
		limit=40,
	)
	branch_whs = set(branch_warehouses(branch)) if branch else None
	transfers, on_the_road = [], []
	for se in entries:
		lines = frappe.get_all(
			"Stock Entry Detail",
			filters={"parent": se.name},
			fields=["item_code", "item_name", "qty", "transferred_qty", "uom", "material_request", "amount"],
			order_by="idx",
		)
		mr = next((l.material_request for l in lines if l.material_request), None)
		destination = frappe.db.get_value("Material Request", mr, "set_warehouse") if mr else None
		if not destination and se.branch:
			destination = next(iter(branch_warehouses(se.branch)), None)
		if branch_whs is not None and destination not in branch_whs and se.branch != branch:
			continue
		receipts = frappe.get_all(
			"Stock Entry", filters={"outgoing_stock_entry": se.name, "docstatus": 1}, fields=["name", "posting_date"]
		)
		pending_value = 0.0
		for l in lines:
			pending = flt(l.qty) - flt(l.transferred_qty)
			if pending > 1e-9:
				value = flt(l.amount) * pending / flt(l.qty) if flt(l.qty) else 0
				pending_value += value
				on_the_road.append(
					{
						"item_code": l.item_code, "item_name": l.item_name, "qty": flt(pending, 3), "uom": l.uom,
						"value": flt(value, 3), "dispatch": se.name, "dispatched_on": se.posting_date, "to": destination,
					}
				)
		transfers.append(
			{
				"dispatch": se.name,
				"dispatched_on": se.posting_date,
				"from": se.from_warehouse,
				"via": se.to_warehouse,
				"to": destination,
				"for_branch": se.branch,
				"against_request": mr,
				"lines": len(lines),
				"value": flt(se.total_outgoing_value, 3),
				"received_percent": flt(se.per_transferred, 1),
				"state": "Received" if flt(se.per_transferred) >= 100 else ("Partly received" if receipts else "In transit"),
				"receipts": [r.name for r in receipts],
				"pending_value": flt(pending_value, 3),
			}
		)
	return {
		"scope": {"company": company, "branch": branch, "status": status},
		"currency": _currency(company or (branch and _branch_company(branch))),
		"dispatches": transfers,
		"in_transit_lines": on_the_road,
		"in_transit_value": flt(sum(l["value"] for l in on_the_road), 3),
		"in_transit_line_count": len(on_the_road),
	}


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_stock_movements(
	item=None, branch=None, company=None, warehouse=None, voucher_type=None, voucher_no=None, period="today", limit=MAX_ROWS
):
	"""Stock ledger (bin-level history): each in/out movement with qty change,
	balance after, valuation and the source document."""
	require_manager()
	cond, params = ["sle.is_cancelled = 0"], {}
	whs = _scope_warehouses(branch, company, warehouse)
	if whs is not None:
		if not whs:
			return {"rows": []}
		cond.append("sle.warehouse in %(whs)s")
		params["whs"] = tuple(whs)
	if item:
		cond.append("(sle.item_code = %(item)s or i.item_name like %(item_like)s)")
		params.update(item=item, item_like=f"%{item}%")
	if voucher_type:
		cond.append("sle.voucher_type = %(vt)s")
		params["vt"] = voucher_type
	if voucher_no:
		cond.append("sle.voucher_no = %(vn)s")
		params["vn"] = voucher_no
	elif period:
		s, e = resolve_period(period)
		cond.append("sle.posting_date between %(s)s and %(e)s")
		params.update(s=s, e=e)
	rows = frappe.db.sql(
		f"""select sle.posting_date, sle.posting_time, sle.item_code, i.item_name, sle.warehouse,
			sle.actual_qty qty_change, sle.qty_after_transaction balance_after, sle.stock_uom uom,
			sle.valuation_rate, sle.stock_value_difference value_change, sle.voucher_type, sle.voucher_no,
			se.purpose stock_entry_purpose
		from `tabStock Ledger Entry` sle
		join `tabItem` i on i.name = sle.item_code
		left join `tabStock Entry` se on sle.voucher_type='Stock Entry' and se.name = sle.voucher_no
		where {' and '.join(cond)}
		order by sle.posting_datetime desc, sle.creation desc
		limit {min(cint(limit) or MAX_ROWS, 200)}""",
		params,
		as_dict=True,
	)
	return {"row_count": len(rows), "rows": rows}


@frappe.whitelist(methods=["GET"])
@llm_sized
def trace_sale_stock_impact(invoice=None, branch=None):
	"""Follow one sale from the bill to the bins: POS invoice → KOTs → recipe
	(BOM) used per dish → the Manufacture stock entry posted when the kitchen
	marked it ready → every ingredient deducted from the outlet warehouse
	with the bin balance after. Defaults to the latest sale at `branch`."""
	require_manager()
	if not invoice:
		filters = {"docstatus": ["<", 2]}
		if branch:
			filters["branch"] = branch
		latest_kot = frappe.get_all(
			"URY KOT", filters={**({"branch": branch} if branch else {}), "invoice": ["is", "set"]},
			fields=["invoice"], order_by="creation desc", limit=1,
		)
		if not latest_kot:
			return {"found": False, "reason": "No KOT-linked sale found."}
		invoice = latest_kot[0].invoice
	inv = frappe.db.get_value(
		"POS Invoice", invoice,
		["name", "branch", "company", "posting_date", "grand_total", "status", "restaurant_table", "customer", "currency"],
		as_dict=True,
	)
	if not inv:
		frappe.throw(f"POS Invoice {invoice} not found", frappe.ValidationError)

	inv["items"] = frappe.get_all(
		"POS Invoice Item", filters={"parent": invoice}, fields=["item_code", "item_name", "qty", "amount"], order_by="idx"
	)
	kots = frappe.get_all("URY KOT", filters={"invoice": invoice}, pluck="name")
	records = frappe.get_all(
		"URY Fulfilment Record",
		filters={"kot": ["in", kots or [""]]},
		fields=["kot", "item_code", "qty", "fulfilment_type", "posted_to_erpnext", "posting_reference"],
	)
	dishes = []
	for rec in records:
		dish = {**rec, "stock_entry": rec.posting_reference}
		if rec.posting_reference and frappe.db.exists("Stock Entry", rec.posting_reference):
			se = frappe.db.get_value("Stock Entry", rec.posting_reference, ["bom_no", "purpose", "posting_date", "posting_time"], as_dict=True)
			dish["bom"] = se.bom_no
			dish["posted_at"] = f"{se.posting_date} {se.posting_time}"
			dish["ingredient_movements"] = frappe.db.sql(
				"""select sle.item_code, i.item_name, sle.warehouse, sle.actual_qty qty_change, sle.stock_uom uom,
					sle.qty_after_transaction bin_balance_after, sle.stock_value_difference value_change
				from `tabStock Ledger Entry` sle join `tabItem` i on i.name=sle.item_code
				where sle.voucher_type='Stock Entry' and sle.voucher_no=%s and sle.is_cancelled=0
				order by sle.actual_qty""",
				rec.posting_reference,
				as_dict=True,
			)
		dishes.append(dish)
	return {
		"invoice": inv,
		"kots": kots,
		"dishes": dishes,
		"note": (
			"Made-to-order dishes deduct their recipe ingredients from the outlet's kitchen/bar bin when the KOT is "
			"marked ready (Manufacture entry: ingredients out, dish in). The dish itself is then deducted by the sale "
			"when the POS session closes (consolidated Sales Invoice with update_stock)."
		),
	}


# ---------------------------------------------------------------------------
# Recipes & production
# ---------------------------------------------------------------------------


def _resolve_bom(item, company=None, bom=None):
	if bom:
		return bom
	filters = {"item": item, "is_active": 1, "docstatus": 1}
	if company:
		filters["company"] = company
	name = frappe.db.get_value("BOM", {**filters, "is_default": 1}, "name") or frappe.db.get_value(
		"BOM", filters, "name", order_by="creation desc"
	)
	if not name:
		frappe.throw(f"No active BOM (recipe) for '{item}'" + (f" in {company}" if company else ""), frappe.ValidationError)
	return name


def _company_rate(item_code, company):
	"""Current weighted valuation rate of `item_code` across `company`'s
	warehouses — what an ingredient actually costs this entity now."""
	row = frappe.db.sql(
		"""select sum(b.stock_value) v, sum(b.actual_qty) q, max(b.valuation_rate) r
		from `tabBin` b join `tabWarehouse` w on w.name=b.warehouse
		where b.item_code=%s and w.company=%s""",
		(item_code, company),
		as_dict=True,
	)[0]
	if flt(row.q) > 0 and flt(row.v) > 0:
		return flt(row.v) / flt(row.q)
	return flt(row.r) or flt(frappe.get_cached_value("Item", item_code, "valuation_rate"))


def _walk_recipe(bom_name, qty, level, max_levels, seen):
	bom = frappe.db.get_value(
		"BOM", bom_name, ["item", "quantity", "uom", "process_loss_percentage", "total_cost", "company"], as_dict=True
	)
	factor = flt(qty) / (flt(bom.quantity) or 1)
	rows = frappe.get_all(
		"BOM Item",
		filters={"parent": bom_name, "parenttype": "BOM"},
		fields=["item_code", "item_name", "stock_qty", "stock_uom", "rate", "amount", "bom_no", "custom_yield_percent", "custom_yield_qty"],
		order_by="idx",
	)
	nodes = []
	for r in rows:
		need = flt(r.stock_qty) * factor
		node = {
			"level": level,
			"item_code": r.item_code,
			"item_name": r.item_name,
			"qty": flt(need, 4),
			"uom": r.stock_uom,
		}
		rate = _company_rate(r.item_code, bom.company)
		node["unit_cost"] = flt(rate, 4)
		node["cost"] = flt(need * rate, 4)
		if flt(r.custom_yield_percent):
			node["yield_percent"] = flt(r.custom_yield_percent)
			node["usable_qty_after_yield"] = flt(need * flt(r.custom_yield_percent) / 100, 4)
		std_yield = frappe.get_cached_value("Item", r.item_code, "custom_yield_percent")
		if flt(std_yield):
			node["item_standard_yield_percent"] = flt(std_yield)
		if r.bom_no and level < max_levels and r.bom_no not in seen:
			sub = frappe.db.get_value("BOM", r.bom_no, ["quantity", "uom", "process_loss_percentage"], as_dict=True)
			node["sub_recipe"] = r.bom_no
			node["sub_recipe_batch"] = f"{flt(sub.quantity)} {sub.uom}"
			if flt(sub.process_loss_percentage):
				node["process_loss_percent"] = flt(sub.process_loss_percentage)
			node["components"] = _walk_recipe(r.bom_no, need, level + 1, max_levels, seen | {r.bom_no})
			if not node["cost"]:
				node["cost"] = flt(sum(c["cost"] for c in node["components"]), 4)
		nodes.append(node)
	return nodes


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_recipe(item, company=None, branch=None, qty=1, bom=None, max_levels=5):
	"""Multi-level recipe (BOM) for a dish or prep item: every ingredient and
	sub-recipe down the tree, scaled to `qty`, with yield %, process loss,
	and cost per line and per portion."""
	require_manager()
	company = company or (branch and _branch_company(branch))
	if item and not frappe.db.exists("Item", item):
		match = frappe.db.get_value("Item", {"item_name": ["like", f"%{item}%"]}, "name")
		item = match or item
	bom_name = _resolve_bom(item, company, bom)
	head = frappe.db.get_value(
		"BOM", bom_name,
		["item", "item_name", "quantity", "uom", "company", "total_cost", "process_loss_percentage", "is_default", "custom_bom_revision"],
		as_dict=True,
	)
	tree = _walk_recipe(bom_name, flt(qty) or 1, 1, cint(max_levels) or 5, {bom_name})

	def depth(nodes):
		return max([1 + depth(n.get("components", [])) for n in nodes] or [0])

	return {
		"bom": bom_name,
		"item": head.item,
		"item_name": head.item_name,
		"company": head.company,
		"currency": _currency(head.company),
		"recipe_batch_size": f"{flt(head.quantity)} {head.uom}",
		"scaled_to_qty": flt(qty) or 1,
		"cost_for_scaled_qty": flt(sum(n["cost"] for n in tree), 4),
		"cost_basis": "current valuation rate of each ingredient in this company's warehouses",
		"process_loss_percent": flt(head.process_loss_percentage),
		"levels": depth(tree),
		"standard_yield_percent": flt(frappe.get_cached_value("Item", head.item, "custom_yield_percent")) or None,
		"components": tree,
	}


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_production(company=None, branch=None, period="today", item=None, status=None, kind="batches"):
	"""Production activity. kind='batches' (default): Production Plans (batch
	production runs per department) with their work orders, planned vs
	produced qty and state. kind='work_orders': individual work orders.
	Includes recorded yield checks for the period."""
	require_manager()
	s, e = resolve_period(period)
	company = company or (branch and _branch_company(branch))
	whs = branch_warehouses(branch) if branch else None
	result = {"period": [s, e], "company": company, "branch": branch}

	wo_filters = {"docstatus": 1, "creation": ["between", [f"{s} 00:00:00", f"{e} 23:59:59"]]}
	if company:
		wo_filters["company"] = company
	if whs:
		wo_filters["fg_warehouse"] = ["in", whs]
	if item:
		wo_filters["production_item"] = item
	if status:
		wo_filters["status"] = status

	if kind == "batches":
		pp_filters = {"docstatus": 1, "posting_date": ["between", [s, e]]}
		if company:
			pp_filters["company"] = company
		plans = frappe.get_all(
			"Production Plan",
			filters=pp_filters,
			fields=["name", "posting_date", "status", "custom_ury_department as department",
				"custom_ury_department_warehouse as department_warehouse", "custom_ury_production_state as production_state",
				"custom_ury_sales_plan as sales_plan", "total_planned_qty", "total_produced_qty"],
			order_by="creation desc",
			limit=30,
		)
		if whs:
			plans = [p for p in plans if p.department_warehouse in whs]
		for p in plans:
			p["work_orders"] = frappe.get_all(
				"Work Order",
				filters={"production_plan": p.name, "docstatus": 1},
				fields=["name", "production_item", "qty", "produced_qty", "status", "bom_no"],
			)
		result["batches"] = compact(plans, 20)
	else:
		result["work_orders"] = compact(
			frappe.get_all(
				"Work Order",
				filters=wo_filters,
				fields=["name", "production_item", "item_name", "qty", "produced_qty", "status", "bom_no",
					"fg_warehouse", "production_plan", "actual_start_date", "actual_end_date"],
				order_by="creation desc",
				limit=60,
			),
			MAX_ROWS,
		)

	yc_filters = {"checked_on": ["between", [f"{s} 00:00:00", f"{e} 23:59:59"]]}
	if company:
		yc_filters["company"] = company
	if branch:
		yc_filters["branch"] = branch
	result["yield_checks"] = frappe.get_all(
		"URY Yield Check",
		filters=yc_filters,
		fields=["item", "branch", "input_qty", "output_qty", "stock_uom", "actual_yield_percent",
			"standard_yield_percent_snapshot as standard_yield_percent", "variance_percent", "checked_on"],
		order_by="checked_on desc",
		limit=20,
	)
	return result


# ---------------------------------------------------------------------------
# Theoretical vs actual, outlet P&L
# ---------------------------------------------------------------------------


def _sold_items(branch, s, e):
	return frappe.db.sql(
		"""select pii.item_code, sum(pii.stock_qty) qty, sum(pii.net_amount) net_sales
		from `tabPOS Invoice Item` pii join `tabPOS Invoice` pi on pi.name = pii.parent
		where pi.docstatus = 1 and pi.branch = %(b)s and pi.posting_date between %(s)s and %(e)s
			and pi.status in ('Paid', 'Consolidated') and pi.is_return = 0
		group by pii.item_code""",
		{"b": branch, "s": s, "e": e},
		as_dict=True,
	)


def _bom_per_unit(bom_no, multi_level, cache):
	"""{component: qty per 1 unit of output} for the BOM exactly as a
	Manufacture entry consumes it (single-level BOM Items, or BOM Explosion
	Items when the entry used a multi-level BOM)."""
	key = (bom_no, bool(multi_level))
	if key not in cache:
		bom_qty = flt(frappe.db.get_value("BOM", bom_no, "quantity")) or 1
		table = "BOM Explosion Item" if multi_level else "BOM Item"
		per = {}
		for r in frappe.get_all(table, filters={"parent": bom_no, "parenttype": "BOM"}, fields=["item_code", "stock_qty"]):
			per[r.item_code] = per.get(r.item_code, 0) + flt(r.stock_qty) / bom_qty
		cache[key] = per
	return cache[key]


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_theoretical_vs_actual(branch, period="today", start_date=None, end_date=None, item=None, limit=MAX_ROWS):
	"""Theoretical vs actual usage for an outlet, per ingredient / prep item.

	Theoretical = standard recipe for what was actually made and sold:
	  • every Manufacture in the outlet's warehouses (dishes made to order at
	    KOT-ready and batch/pre-produced items) × its BOM, at the level the
	    kitchen consumes it (so a dish that uses a pre-made gravy expects the
	    gravy, and the gravy batch expects its raw ingredients), plus
	  • direct-retail items sold as-is (e.g. soft drinks), from POS invoices.
	Actual = what really left the bins: production consumption, wastage /
	material issues, stock-count corrections and reconciliations, plus
	direct-retail sales. Transfers between warehouses and purchases are
	excluded. Variance = actual − theoretical, valued at the outlet's
	valuation rate. Positive variance = more used than the recipes allow."""
	require_manager()
	s, e = _period(period, start_date, end_date)
	company = _branch_company(branch)
	whs = branch_warehouses(branch)
	if not whs:
		return {"error": f"No warehouses mapped to branch {branch}."}

	theoretical, actual, value, count_adj, wastage = {}, {}, {}, {}, {}
	produced = {}

	# 1) Production in the window → theoretical component usage.
	cache = {}
	for se in frappe.db.sql(
		f"""select se.name, se.bom_no, se.fg_completed_qty, se.use_multi_level_bom,
			(se.custom_ury_posting_intent is not null and se.custom_ury_posting_intent != '') made_to_order
		from `tabStock Entry` se
		where se.docstatus=1 and se.purpose='Manufacture' and se.posting_date between %(s)s and %(e)s
			and ifnull(se.bom_no,'') != ''
			and exists (select 1 from `tabStock Entry Detail` d where d.parent=se.name and d.t_warehouse in ({_in(whs)}))""",
		{"s": s, "e": e},
		as_dict=True,
	):
		fg = frappe.db.get_value("BOM", se.bom_no, "item")
		kind = "made_to_order" if cint(se.made_to_order) else "batch"
		produced.setdefault(fg, {"made_to_order": 0, "batch": 0})[kind] += flt(se.fg_completed_qty)
		for comp, per in _bom_per_unit(se.bom_no, se.use_multi_level_bom, cache).items():
			theoretical[comp] = theoretical.get(comp, 0) + per * flt(se.fg_completed_qty)

	# 2) Direct-retail sales (stock items sold without a recipe).
	net_sales = 0.0
	for row in _sold_items(branch, s, e):
		net_sales += flt(row.net_sales)
		if not frappe.db.exists("BOM", {"item": row.item_code, "is_active": 1, "docstatus": 1, "company": company}) and cint(
			frappe.get_cached_value("Item", row.item_code, "is_stock_item")
		):
			theoretical[row.item_code] = theoretical.get(row.item_code, 0) + flt(row.qty)
			actual[row.item_code] = actual.get(row.item_code, 0) + flt(row.qty)

	# 3) Actual non-sale consumption out of the outlet's bins.
	for r in frappe.db.sql(
		f"""select sle.item_code, sle.actual_qty qty, sle.stock_value_difference val, sle.voucher_type, se.purpose,
			(sle.voucher_type = 'Stock Reconciliation' or sle.voucher_no like 'MAT-STK-CRCTN-%%') is_count
		from `tabStock Ledger Entry` sle
		left join `tabStock Entry` se on sle.voucher_type='Stock Entry' and se.name=sle.voucher_no
		where sle.is_cancelled=0 and sle.warehouse in ({_in(whs)})
			and sle.posting_date between %(s)s and %(e)s
			and (
				sle.voucher_type = 'Stock Reconciliation'
				or sle.voucher_no like 'MAT-STK-CRCTN-%%'
				or (sle.voucher_type='Stock Entry' and se.purpose in %(purposes)s and sle.actual_qty < 0)
			)""",
		{"s": s, "e": e, "purposes": _CONSUMPTION_SE_PURPOSES},
		as_dict=True,
	):
		actual[r.item_code] = actual.get(r.item_code, 0) - flt(r.qty)
		value[r.item_code] = value.get(r.item_code, 0) - flt(r.val)
		if cint(r.is_count):
			count_adj[r.item_code] = count_adj.get(r.item_code, 0) + flt(r.qty)
		elif r.purpose == "Material Issue":
			wastage[r.item_code] = wastage.get(r.item_code, 0) - flt(r.qty)

	rows = []
	for code in set(theoretical) | set(actual):
		if item and code != item:
			continue
		th, ac = flt(theoretical.get(code), 4), flt(actual.get(code), 4)
		if abs(th) < 1e-9 and abs(ac) < 1e-9:
			continue
		rate = (abs(value.get(code, 0)) / abs(ac) if ac and value.get(code) else 0) or flt(
			frappe.db.get_value("Bin", {"item_code": code, "warehouse": ["in", whs]}, "valuation_rate")
		) or flt(frappe.get_cached_value("Item", code, "valuation_rate"))
		var = ac - th
		rows.append(
			{
				"item_code": code,
				"item_name": frappe.get_cached_value("Item", code, "item_name"),
				"uom": frappe.get_cached_value("Item", code, "stock_uom"),
				"theoretical_qty": th,
				"actual_qty": ac,
				"variance_qty": flt(var, 4),
				"variance_percent": flt(var / th * 100, 1) if th else None,
				"variance_value": flt(var * rate, 3),
				"of_which_wastage_or_material_issue_qty": flt(wastage.get(code, 0), 4) or None,
				"of_which_stock_count_correction_qty": flt(-count_adj.get(code, 0), 4) or None,
				"theoretical_cost": flt(th * rate, 3),
				"actual_cost": flt(ac * rate, 3),
			}
		)
	rows.sort(key=lambda r: -abs(r["variance_value"]))
	th_cost = sum(r["theoretical_cost"] for r in rows)
	ac_cost = sum(r["actual_cost"] for r in rows)
	return {
		"branch": branch,
		"company": company,
		"currency": _currency(company),
		"period": [s, e],
		"warehouses": whs,
		"net_sales": flt(net_sales, 3),
		"production": {
			"dishes_made_to_order": flt(sum(v["made_to_order"] for v in produced.values()), 3),
			"batch_produced_qty": flt(sum(v["batch"] for v in produced.values()), 3),
			"distinct_items_produced": len(produced),
		},
		"theoretical_cost": flt(th_cost, 3),
		"actual_cost": flt(ac_cost, 3),
		"variance_value": flt(ac_cost - th_cost, 3),
		"variance_percent": flt((ac_cost - th_cost) / th_cost * 100, 1) if th_cost else None,
		"rows_with_variance": sum(1 for r in rows if abs(r["variance_qty"]) > 1e-6),
		"rows": compact(rows, cint(limit) or MAX_ROWS),
	}


def _sold_recipe_cost(branch, company, date):
	"""Σ qty sold × recipe cost (BOM exploded to ingredients at the company's
	current valuation). Stock items sold as-is cost their own valuation."""
	from ury.ury.api.ury_bom_compiler import compile_bom_vector

	total, missing = 0.0, []
	for row in _sold_items(branch, date, date):
		if frappe.db.exists("BOM", {"item": row.item_code, "company": company, "is_active": 1, "docstatus": 1}):
			vec = compile_bom_vector(row.item_code, flt(row.qty), company)
			total += sum(flt(c["qty"]) * _company_rate(c["component_item"], company) for c in vec["components"])
			continue
		rate = _company_rate(row.item_code, company)
		if rate:
			total += flt(row.qty) * rate
		else:
			missing.append(row.item_code)
	return total, missing


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_wastage(branch, from_date=None, to_date=None, department=None, status=None, company=None):
	"""Wastage / damage write-offs (URY Wastage) for a branch: per record and
	per item with qty, value, reason and approval status, plus totals."""
	require_manager()
	filters = {"branch": branch, "docstatus": ["<", 2]}
	if department:
		filters["department"] = department
	if status:
		filters["status"] = status
	if company:
		filters["company"] = company
	if from_date or to_date:
		s, e = _period(None, from_date, to_date)
		filters["captured_on"] = ["between", [f"{s} 00:00:00", f"{e} 23:59:59"]]
	docs = frappe.get_all(
		"URY Wastage",
		filters=filters,
		fields=["name", "department", "warehouse", "status", "reason_category", "reason_notes",
			"captured_by", "captured_on", "approved_by", "stock_entry"],
		order_by="captured_on desc",
		limit=100,
	)
	by_item = {}
	for d in docs:
		d["items"] = frappe.get_all(
			"Wastage Item", filters={"parent": d.name, "parenttype": "URY Wastage"},
			fields=["item_code", "item_name", "qty", "uom", "amount"],
		)
		d["value"] = flt(sum(flt(i.amount) for i in d["items"]), 3)
		for i in d["items"]:
			agg = by_item.setdefault(i.item_code, {"item_code": i.item_code, "item_name": i.item_name, "uom": i.uom, "qty": 0, "value": 0})
			agg["qty"] += flt(i.qty)
			agg["value"] += flt(i.amount)
	top = sorted(by_item.values(), key=lambda r: -r["value"])
	return {
		"branch": branch,
		"currency": _currency(company or _branch_company(branch)),
		"records": len(docs),
		"total_value": flt(sum(d["value"] for d in docs), 3),
		"by_status": {st: sum(1 for d in docs if d.status == st) for st in {d.status for d in docs}},
		"by_item": compact(top, 15),
		"records_detail": compact(docs, 15),
	}


_PNL_FIELDS = [
	"gross_sales", "cash_discount_round_off", "tax", "net_sales", "cogs", "cogs_percent", "disposables_cost",
	"total_direct_expenses", "gross_profit", "gross_profit_percent", "total_employee_costs",
	"total_indirect_expenses", "depreciation", "total_other_expenses", "net_profit", "net_profit_percent",
]


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_outlet_pnl(branch, date=None):
	"""Daily outlet P&L. Returns the submitted 'URY Daily P and L' for the
	branch/date when one exists (authoritative: COGS, staff, fixed and
	variable expenses, net profit). Otherwise returns a live estimate from
	today's sales and actual ingredient consumption, clearly labelled."""
	require_manager()
	date = str(getdate(date or today())) if str(date or "").lower() not in ("today", "yesterday") else resolve_period(date)[0]
	company = _branch_company(branch)
	name = frappe.db.get_value("URY Daily P and L", {"branch": branch, "date": date, "docstatus": 1}, "name")
	if name:
		doc = frappe.get_doc("URY Daily P and L", name)
		return {
			"source": "saved",
			"document": name,
			"branch": branch,
			"date": date,
			"currency": _currency(company),
			**{f: flt(doc.get(f), 3) for f in _PNL_FIELDS},
			"direct_expenses": [
				{"expense": r.get("expense") or r.get("expense_type") or r.get("particulars"), "amount": flt(r.get("amount"), 3)}
				for r in (doc.get("direct_expenses_breakup") or [])
			][:15],
			"indirect_expenses": [
				{"expense": r.get("expense") or r.get("expense_type") or r.get("particulars"), "amount": flt(r.get("amount"), 3)}
				for r in (doc.get("indirect_expenses_breakup") or [])
			][:15],
		}
	sales = frappe.db.sql(
		"""select count(*) bills, sum(net_total) net, sum(grand_total) gross, sum(total_taxes_and_charges) tax,
			sum(discount_amount) discount
		from `tabPOS Invoice` where docstatus=1 and branch=%s and posting_date=%s and status in ('Paid','Consolidated')""",
		(branch, date),
		as_dict=True,
	)[0]
	net = flt(sales.net)
	cogs, missing = _sold_recipe_cost(branch, company, date)
	recent = frappe.get_all(
		"URY Daily P and L", filters={"branch": branch, "docstatus": 1}, fields=["date", "net_profit"], order_by="date desc", limit=3
	)
	return {
		"source": "live_estimate",
		"note": "No submitted Daily P&L for this date — live estimate: net sales minus the recipe cost of the dishes sold (at current ingredient valuation). Excludes staff, rent, utilities and other expenses; see ury_get_theoretical_vs_actual for usage variance.",
		"branch": branch,
		"date": date,
		"currency": _currency(company),
		"bills": cint(sales.bills),
		"gross_sales": flt(sales.gross, 3),
		"tax": flt(sales.tax, 3),
		"discount": flt(sales.discount, 3),
		"net_sales": flt(net, 3),
		"cogs_recipe_cost_of_items_sold": flt(cogs, 3),
		"items_sold_without_recipe_cost": missing[:10] or None,
		"cogs_percent": flt(cogs / net * 100, 1) if net else None,
		"gross_profit_estimate": flt(net - cogs, 3),
		"recent_saved_pnls": recent,
	}
