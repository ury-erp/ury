from datetime import datetime as _datetime, timedelta as _timedelta

import frappe

from frappe.utils import get_datetime, add_to_date, today


@frappe.whitelist(methods=["GET"])
def get_service_line(branch=None):
	cache_key = f"ury_dashboard_service_line:{branch}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	table_filters = {"branch": branch} if branch else {}
	tables = frappe.get_all(
		"URY Table",
		filters=table_filters,
		fields=["name", "occupied", "latest_invoice_time", "is_take_away"],
		order_by="name",
	)

	now = get_datetime()
	result = []
	for t in tables:
		if t.is_take_away:
			continue

		if not t.occupied:
			result.append({"table": t.name, "stage": "open", "minutes": None})
			continue

		minutes = None
		if t.latest_invoice_time:
			# `URY Table.latest_invoice_time` is a **Time** field (confirmed
			# via ury_table.json), not Datetime -- Frappe's ORM returns Time
			# columns as `datetime.timedelta` (seconds since midnight), not
			# a full datetime. The previous code (`now - get_datetime(...)`,
			# and frappe.utils.time_diff_in_seconds, which does the same
			# thing internally) assumed a full datetime and broke: when one
			# operand of a `-` is already a timedelta, `datetime -
			# timedelta` returns a *datetime*, not a timedelta, so the
			# `.total_seconds()` call on the result raised AttributeError.
			# Fix: compare against "now" expressed the same way (seconds
			# since midnight today), so both sides of the subtraction are
			# real timedeltas.
			now_since_midnight = now - _datetime.combine(now.date(), _datetime.min.time())
			delta = now_since_midnight - t.latest_invoice_time
			if delta.total_seconds() < 0:
				# Order was placed before midnight and it's now past
				# midnight -- add a day so this still reads as "elapsed",
				# not a negative/nonsensical value.
				delta += _timedelta(days=1)
			minutes = int(delta.total_seconds() // 60)

		invoice = frappe.db.sql(
			"""
			SELECT name FROM `tabPOS Invoice`
			WHERE restaurant_table = %(table)s AND docstatus = 0
			ORDER BY creation DESC LIMIT 1
			""",
			{"table": t.name},
			as_dict=True,
		)

		stage = "seated"
		if invoice:
			kot = frappe.db.sql(
				"""
				SELECT order_status FROM `tabURY KOT`
				WHERE invoice = %(invoice)s
				ORDER BY creation DESC LIMIT 1
				""",
				{"invoice": invoice[0].name},
				as_dict=True,
			)
			if kot:
				stage = "served" if kot[0].order_status == "Served" else "fired"

		if minutes is not None and minutes > 75:
			stage = "over"

		result.append({"table": t.name, "stage": stage, "minutes": minutes})

	frappe.cache().set_value(cache_key, result, expires_in_sec=15)
	return result


@frappe.whitelist(methods=["GET"])
def get_running_low(branch=None):
	cache_key = f"ury_dashboard_running_low:{branch}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	warehouse = None
	if branch:
		pos_profile = frappe.db.get_value("POS Profile", {"branch": branch}, "warehouse")
		warehouse = pos_profile

	shift_start = get_datetime(f"{today()} 00:00:00")
	hours_elapsed = max((get_datetime() - shift_start).total_seconds() / 3600, 0.5)

	sold_conditions = "inv.`docstatus` = 1 AND inv.`posting_date` = CURDATE() AND item.`is_stock_item` = 1"
	sold_params = {}
	if branch:
		sold_conditions += " AND inv.`branch` = %(branch)s"
		sold_params["branch"] = branch

	sold_rows = frappe.db.sql(
		f"""
		SELECT ii.`item_code` AS item_code, ii.`item_name` AS item_name, SUM(ii.`qty`) AS qty_sold
		FROM `tabPOS Invoice Item` ii
		JOIN `tabPOS Invoice` inv ON inv.`name` = ii.`parent`
		JOIN `tabItem` item ON item.`name` = ii.`item_code`
		WHERE {sold_conditions}
		GROUP BY ii.`item_code`, ii.`item_name`
		HAVING qty_sold > 0
		ORDER BY qty_sold DESC
		LIMIT 20
		""",
		sold_params,
		as_dict=True,
	)

	result = []
	for row in sold_rows:
		bin_filters = {"item_code": row.item_code}
		if warehouse:
			bin_filters["warehouse"] = warehouse
		actual_qty = frappe.db.get_value("Bin", bin_filters, "sum(actual_qty)") or 0

		data_quality_issue = actual_qty < 0
		remaining = max(actual_qty, 0)

		sell_rate_per_hour = row.qty_sold / hours_elapsed
		eta_minutes = round((remaining / sell_rate_per_hour) * 60) if sell_rate_per_hour > 0 else None

		result.append({
			"item_code": row.item_code,
			"item_name": row.item_name,
			"remaining": remaining,
			"qty_sold_today": row.qty_sold,
			"eta_minutes": eta_minutes,
			"data_quality_issue": data_quality_issue,
		})

	result.sort(key=lambda r: (r["eta_minutes"] is None, r["eta_minutes"]))

	frappe.cache().set_value(cache_key, result[:6], expires_in_sec=60)
	return result[:6]
