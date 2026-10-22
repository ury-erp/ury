"""Demo seed: Short-Excess + Yield variance source documents (last 21 days).

Run (from the bench dir)::

    bench --site <site> execute <dotted.path>.variance_yield_demo.seed
    # or, from a console:  seed(branch="My Branch")

Reports / endpoints this feeds (all grounded in ury/ury/ury source):

1. "Short-Excess Report" (Script-less Query Report,
   ury/report/short_excess_report/short_excess_report.json, module URY,
   ref_doctype Stock Correction).  Query joins `tabStock Correction` +
   `tabStock Correction Item`, filters branch / posting_date range /
   docstatus = 1 / optional warehouse.  -> we create SUBMITTED Stock
   Corrections (their on_submit posts a real Material Receipt / Material
   Issue Stock Entry), each referencing a SUBMITTED Stock Reconciliation.
   Negative item qty = Short, positive = Excess.
2. Yield variance (ury/api/ury_yield_variance.py, module URY):
     - get_yield_variance(company, branch, item)  <- URY Yield Check rows
       (actual_yield_percent, standard_yield_percent_snapshot,
       variance_percent, checked_on)
     - get_yield_check_compliance(company, branch) <- Item yield-tracking
       fields (custom_yield_tracked / _check_cadence / _interval_days),
       URY Yield Check rows in the last 30 days, and branch scoping via
       services/yield_branch_scope.branch_item_codes (active URY Item
       Production Configuration.bom -> BOM Item components).
   -> we create URY Yield Check docs through the real controller
      (URYYieldCheck.validate computes yield / variance / snapshot).

NOT targeted: "Wastage and Damage Report" (URY Issue Wastage) -- it needs a
Sales Plan -> Issue Authorization chain that is out of scope for this seed.
There is no cash short/excess report (Sub POS Closing / POS Closing Entry)
in this source tree.

Idempotency:
  - Stock Correction: skipped when one with remarks starting with MARKER and
    the same posting_date + direction already exists for the branch.
  - Stock Reconciliation: skipped when a submitted one exists for the branch
    on that posting_date.
  - URY Yield Check: skipped per (item, branch, date) if one already exists.
"""

import random

import frappe
from frappe.utils import add_days, getdate, nowdate, now_datetime

MARKER = "[sa-variance-demo]"
DAYS = 21
SR_TIME = "00:10:00"
SC_TIME = "00:20:00"
MIN_ITEMS = 5
MAX_ITEMS = 6

# Used only when the site has too few stock-tracked BOM components.
DEMO_ITEMS = [
	# (item_code, item_name, standard_yield_percent, valuation_rate)
	("SA-DEMO-CHICKEN", "Chicken Whole (Demo)", 92, 210),
	("SA-DEMO-PRAWN", "Prawns Raw (Demo)", 88, 520),
	("SA-DEMO-ONION", "Onion Bulk (Demo)", 95, 38),
	("SA-DEMO-PANEER", "Paneer Block (Demo)", 98, 340),
	("SA-DEMO-MUTTON", "Mutton Bone-in (Demo)", 90, 780),
	("SA-DEMO-FISH", "Fish Whole (Demo)", 86, 430),
]
DEFAULT_STANDARDS = [92, 95, 88, 98, 90, 94]

# Day pattern for Stock Corrections (cycled by day index).
# S = short doc, E = excess doc, "" = on target (no correction).
DAY_PATTERN = ["SE", "S", "", "E", "S", "E", "", "SE", "S", "E", ""]


# --------------------------------------------------------------------------
# Resolution helpers
# --------------------------------------------------------------------------

def _branch_ctx(branch):
	branch = branch or frappe.db.get_value("Branch", {}, "name")
	if not branch:
		frappe.throw("No Branch on this site")
	company = frappe.db.get_value("Branch", branch, "company") or frappe.db.get_value(
		"Company", {}, "name"
	)
	warehouse = frappe.db.get_value("POS Profile", {"branch": branch}, "warehouse")
	if not warehouse:
		abbr = frappe.db.get_value("Company", company, "abbr")
		for cand in (f"Stores - {abbr}", f"Finished Goods - {abbr}"):
			if frappe.db.exists("Warehouse", cand):
				warehouse = cand
				break
	if not warehouse:
		warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	if not warehouse:
		frappe.throw(f"No warehouse resolvable for branch {branch}")
	return branch, company, warehouse


def _stock_uom_default():
	return "Kg" if frappe.db.exists("UOM", "Kg") else "Nos"


def _ensure_demo_items(n_needed, company):
	"""Create up to n_needed yield-tracked stock Items (idempotent)."""
	out = []
	group = (
		"Raw Material"
		if frappe.db.exists("Item Group", "Raw Material")
		else frappe.db.get_value("Item Group", {"is_group": 0}, "name")
	)
	uom = _stock_uom_default()
	for code, name, std, rate in DEMO_ITEMS:
		if len(out) >= n_needed:
			break
		if frappe.db.exists("Item", code):
			out.append(code)
			continue
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": name,
				"item_group": group,
				"stock_uom": uom,
				"is_stock_item": 1,
				"is_purchase_item": 1,
				"is_sales_item": 0,
				"valuation_rate": rate,
				"custom_yield_tracked": 1,
				"custom_yield_percent": std,
				"custom_yield_check_cadence": "Interval",
				"custom_yield_check_interval_days": 2,
			}
		).insert(ignore_permissions=True)
		out.append(code)
	return out


def _pick_items(branch, company):
	"""Prefer stock components of BOMs used at this branch, then any BOM
	component that is a stock item, then top up with demo Items."""
	from ury.ury.services.yield_branch_scope import branch_item_codes

	def stock_ok(codes):
		if not codes:
			return []
		return frappe.get_all(
			"Item",
			filters={"name": ["in", list(codes)], "disabled": 0, "is_stock_item": 1, "has_variants": 0},
			pluck="name",
			order_by="name asc",
		)

	picked = stock_ok(branch_item_codes(branch) or set())
	if len(picked) < MAX_ITEMS:
		rows = frappe.db.sql(
			"""SELECT DISTINCT bi.item_code FROM `tabBOM Item` bi
			JOIN `tabBOM` b ON b.name = bi.parent
			WHERE bi.parenttype = 'BOM' AND b.docstatus = 1""",
			as_list=True,
		)
		extra = [c for c in stock_ok([r[0] for r in rows]) if c not in picked]
		picked += extra
	picked = picked[:MAX_ITEMS]
	if len(picked) < MIN_ITEMS:
		for c in _ensure_demo_items(MIN_ITEMS - len(picked) + 1, company):
			if c not in picked:
				picked.append(c)
	return picked[:MAX_ITEMS]


def _ensure_yield_standards(items):
	"""Make every picked item yield-tracked with a valid standard + Interval
	cadence.  Uses db.set_value (not Item.save) so the yield-change hook does
	not enqueue BOM rewrites; existing valid standards are preserved."""
	std_map = {}
	for i, code in enumerate(items):
		v = frappe.db.get_value(
			"Item",
			code,
			[
				"custom_yield_tracked",
				"custom_yield_percent",
				"custom_yield_check_cadence",
				"custom_yield_check_interval_days",
				"valuation_rate",
			],
			as_dict=True,
		)
		upd = {}
		std = v.custom_yield_percent
		if not v.custom_yield_tracked or not std or std <= 0 or std > 100:
			std = DEFAULT_STANDARDS[i % len(DEFAULT_STANDARDS)]
			upd["custom_yield_tracked"] = 1
			upd["custom_yield_percent"] = std
		if v.custom_yield_check_cadence in (None, "", "None"):
			upd["custom_yield_check_cadence"] = "Interval"
			upd["custom_yield_check_interval_days"] = 2
		elif v.custom_yield_check_cadence == "Interval" and not v.custom_yield_check_interval_days:
			upd["custom_yield_check_interval_days"] = 2
		if not v.valuation_rate:
			upd["valuation_rate"] = 60 + (sum(map(ord, code)) % 180)
		if upd:
			frappe.db.set_value("Item", code, upd, update_modified=False)
		std_map[code] = std
	return std_map


def _ensure_branch_scope_bom(branch, company, items):
	"""Best effort: make tracked items visible to get_yield_check_compliance
	(scoped via active IPC -> BOM -> BOM Item).  Only acts if none of the
	items is already in the branch scope, and only fills an IPC row that has
	no BOM yet (never rewrites an existing one)."""
	from ury.ury.services.yield_branch_scope import branch_item_codes

	if set(items) & (branch_item_codes(branch) or set()):
		return "already in branch scope"
	ipc = frappe.get_all(
		"URY Item Production Configuration",
		filters={"branch": branch, "active": 1, "bom": ["is", "not set"]},
		fields=["name", "item"],
		limit=1,
	)
	if not ipc:
		return "no IPC row without BOM; compliance report will stay empty for this branch"
	try:
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": ipc[0].item,
				"company": company,
				"quantity": 1,
				"is_active": 1,
				"is_default": 0,
				"items": [{"item_code": c, "qty": 1} for c in items[:4]],
			}
		)
		bom.insert(ignore_permissions=True)
		bom.submit()
		frappe.db.set_value("URY Item Production Configuration", ipc[0].name, "bom", bom.name)
		frappe.db.commit()
		return f"created {bom.name} on IPC {ipc[0].name}"
	except Exception as e:  # noqa: BLE001
		frappe.db.rollback()
		return f"BOM scope fix failed: {e}"


# --------------------------------------------------------------------------
# Per-day document creators
# --------------------------------------------------------------------------

def _rate(code):
	return frappe.db.get_value("Item", code, "valuation_rate") or 100


def _ensure_stock_reconciliation(branch, company, warehouse, items, day, rng):
	"""Return name of a submitted SR for this branch/day (create if absent)."""
	existing = frappe.db.get_value(
		"Stock Reconciliation",
		{"branch": branch, "posting_date": day, "docstatus": 1},
		"name",
	)
	if existing:
		return existing, False
	cmp = frappe.db.get_value(
		"Company", company, ["stock_adjustment_account", "cost_center", "abbr"], as_dict=True
	)
	diff_acct = cmp.stock_adjustment_account
	if not diff_acct:
		cand = f"Stock Adjustment - {cmp.abbr}"
		diff_acct = cand if frappe.db.exists("Account", cand) else None
	doc = frappe.get_doc(
		{
			"doctype": "Stock Reconciliation",
			"company": company,
			"purpose": "Stock Reconciliation",
			"branch": branch,
			"posting_date": day,
			"posting_time": SR_TIME,
			"set_posting_time": 1,
			"expense_account": diff_acct,
			"cost_center": cmp.cost_center,
			"items": [
				{
					"item_code": c,
					"warehouse": warehouse,
					"qty": rng.randint(60, 140),
					"valuation_rate": _rate(c),
				}
				for c in items
			],
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	return doc.name, True


def _is_v16_correction():
	"""URY version-16 Stock Correction Item has current_qty: qty = counted
	(target physical) qty, must be >= 0; delta = qty - current_qty.  v3-stg has
	no current_qty and treats qty itself as a signed delta."""
	return bool(frappe.get_meta("Stock Correction Item").get_field("current_qty"))


def _make_correction(branch, warehouse, sr_name, items, day, direction, rng):
	marker = f"{MARKER} {day} {direction}"
	v16 = _is_v16_correction()
	sc_meta = frappe.get_meta("Stock Correction")
	rem_filter = ["like", f"{marker}%"] if v16 else marker
	if frappe.db.exists(
		"Stock Correction",
		{"branch": branch, "posting_date": day, "remarks": rem_filter, "docstatus": ["<", 2]},
	):
		return None
	sign = -1 if direction == "S" else 1
	chosen = rng.sample(items, k=min(len(items), rng.randint(2, 4)))
	rows = []
	for c in chosen:
		meta = frappe.db.get_value("Item", c, ["item_name", "stock_uom"], as_dict=True)
		delta = sign * round(rng.uniform(0.25, 4.5), 2)
		if v16:
			from erpnext.stock.utils import get_stock_balance

			cur = flt_(get_stock_balance(c, warehouse, day, SC_TIME))
			if direction == "S" and cur <= 0:
				continue  # nothing to be short of
			# Short: counted below system (never below 0); Excess: counted above.
			qty = max(0.0, round(cur + delta, 3))
			if direction == "S" and qty >= cur:
				continue
			qty_field = {"qty": qty, "current_qty": cur}
		else:
			qty_field = {"qty": delta}
		rows.append(
			{
				"item_code": c,
				"item_name": meta.item_name,
				"warehouse": warehouse,
				"uom": meta.stock_uom,
				**qty_field,
			}
		)
	if not rows:
		return None
	reasons_s = ["Spoilage found at count", "Portioning loss", "Unrecorded staff meal", "Spillage in walk-in"]
	reasons_e = ["Supplier over-delivery", "Unposted receipt found", "Count correction (earlier undercount)"]
	reason_text = rng.choice(reasons_s if direction == "S" else reasons_e)
	reason_field = sc_meta.get_field("reason")
	reason_opts = [o for o in (reason_field.options or "").split("\n") if o] if reason_field else []
	if reason_field and reason_field.fieldtype == "Select" and reason_opts:
		# v16: restricted Select; descriptive text goes into remarks instead.
		reason = "Counting Mistake" if "Counting Mistake" in reason_opts and direction == "E" else (
			"Others" if "Others" in reason_opts else reason_opts[0]
		)
		remarks = f"{marker} | {reason_text}"
	else:
		reason, remarks = reason_text, marker
	data = {
		"doctype": "Stock Correction",
		"reference_stock_reconciliation": sr_name,
		"branch": branch,
		"posting_date": day,
		"posting_time": SC_TIME,
		"reason": reason,
		"remarks": remarks,
		"items": rows,
	}
	if v16:
		data["company"] = frappe.db.get_value("Branch", branch, "company")
		data["set_warehouse"] = warehouse
		data["edit_posting_date"] = 1
		data["period_end_date"] = f"{day} 23:59:59"
		data["cost_center"] = frappe.db.get_value("Company", data["company"], "cost_center")
	else:
		data["warehouse"] = warehouse
	doc = frappe.get_doc(data)
	doc.insert(ignore_permissions=True)
	doc.submit()
	if v16:
		# v16 swallows stock-entry failures into status="Failed"; surface them.
		doc.reload()
		if doc.status == "Failed":
			raise RuntimeError(f"Stock Correction {doc.name} failed: {doc.error}")
	return doc.name


def flt_(v):
	return float(v[0] if isinstance(v, (list, tuple)) else (v or 0))


def _make_yield_checks(branch, company, items, std_map, day, day_idx, rng):
	"""One check per item every other day (staggered), plus a spot-check."""
	created = []
	is_today = str(day) == nowdate()
	for i, code in enumerate(items):
		if (day_idx + i) % 2:
			continue
		if frappe.db.exists(
			"URY Yield Check",
			{"item": code, "branch": branch, "checked_on": ["between", [f"{day} 00:00:00", f"{day} 23:59:59"]]},
		):
			continue
		# Mix: ~35% under standard, ~45% near, ~20% over (all within 85-105).
		roll = rng.random()
		if roll < 0.35:
			actual = rng.uniform(85.0, max(85.5, std_map[code] - 2.0))
		elif roll < 0.80:
			actual = std_map[code] + rng.uniform(-2.0, 2.0)
		else:
			actual = rng.uniform(std_map[code] + 2.0, 105.0)
		actual = max(85.0, min(105.0, actual))
		input_qty = round(rng.uniform(8, 30), 2)
		output_qty = round(input_qty * actual / 100.0, 3)
		uom = frappe.db.get_value("Item", code, "stock_uom")
		checked_on = (
			f"{day} 00:{30 + i:02d}:00" if is_today else f"{day} {9 + (i * 2) % 10:02d}:{rng.randint(0, 59):02d}:00"
		)
		doc = frappe.get_doc(
			{
				"doctype": "URY Yield Check",
				"item": code,
				"branch": branch,
				"company": company,
				"input_qty": input_qty,
				"output_qty": output_qty,
				"stock_uom": uom,
				"check_type": rng.choice(["Routine", "Scheduled", "Spot-Check", "Manual"]),
				"checked_by": "Administrator",
				"checked_on": checked_on,
			}
		)
		doc.insert(ignore_permissions=True)
		# Back-date creation so creation-window queries line up with checked_on.
		frappe.db.set_value(
			"URY Yield Check", doc.name, {"creation": checked_on, "modified": checked_on}, update_modified=False
		)
		created.append(doc.name)
	return created


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def seed(branch=None):
	frappe.set_user("Administrator")
	branch, company, warehouse = _branch_ctx(branch)
	print(f"[variance_yield_demo] branch={branch} company={company} warehouse={warehouse}")

	draft = frappe.db.exists("Stock Reconciliation", {"branch": branch, "docstatus": 0})
	if draft:
		print(
			f"  ! draft Stock Reconciliation {draft} exists for branch; URY guard will block new "
			"reconciliations. Submit/delete it first -- falling back to existing submitted SRs."
		)

	items = _pick_items(branch, company)
	std_map = _ensure_yield_standards(items)
	frappe.db.commit()
	scope_note = _ensure_branch_scope_bom(branch, company, items)
	print(f"  items={items}\n  yield standards={std_map}\n  branch scope: {scope_note}")

	today = getdate(nowdate())
	summary = {"days_ok": 0, "days_failed": 0, "sr": 0, "short_docs": 0, "excess_docs": 0, "yield_checks": 0}

	for offset in range(DAYS, -1, -1):  # oldest -> newest (stock must exist before it is issued)
		day = add_days(today, -offset)
		day_idx = DAYS - offset
		rng = random.Random(f"{branch}:{day}")
		try:
			pattern = DAY_PATTERN[day_idx % len(DAY_PATTERN)]
			sr_name = None
			if pattern:
				try:
					sr_name, made = _ensure_stock_reconciliation(branch, company, warehouse, items, day, rng)
					summary["sr"] += 1 if made else 0
				except Exception as e:  # noqa: BLE001
					frappe.db.rollback()
					sr_name = frappe.db.get_value(
						"Stock Reconciliation",
						{"branch": branch, "docstatus": 1, "posting_date": ["<=", day]},
						"name",
						order_by="posting_date desc",
					)
					print(f"  {day}: SR create failed ({e}); fallback ref={sr_name}")
				if not sr_name:
					raise RuntimeError("no submitted Stock Reconciliation available to reference")
				# Excess first so a following short can never hit negative stock.
				for d in sorted(pattern, reverse=True):  # "S" > "E" => shorts first; fine, stock was just reset
					name = _make_correction(branch, warehouse, sr_name, items, day, d, rng)
					if name:
						summary["short_docs" if d == "S" else "excess_docs"] += 1
			yc = _make_yield_checks(branch, company, items, std_map, day, day_idx, rng)
			summary["yield_checks"] += len(yc)
			frappe.db.commit()
			summary["days_ok"] += 1
			print(f"  {day}: pattern={pattern or 'on-target'} yield_checks={len(yc)}")
		except Exception as e:  # noqa: BLE001
			frappe.db.rollback()
			summary["days_failed"] += 1
			print(f"  {day}: FAILED {type(e).__name__}: {e}")

	print(f"[variance_yield_demo] done: {summary}")
	return summary
