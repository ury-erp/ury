"""Desk islands for the URY Insights dashboards (Frappe 17 / develop only).

On a site that has `frappe.utils.island`, the Insights app and the
`insights_dashboard` Custom Field on the desk `Dashboard` doctype, each URY
Insights dashboard can render INSIDE the desk. This module wires that up:

- one desk `Dashboard` doc per Insights dashboard (claim field `insights_dashboard`)
- Module Def "URY Analytics"
- a `Sidebar` "URY Analytics" with one Dashboard link per row
- one `Dock Item` in the `Dock` "frappe"

Everything is idempotent (get-or-create, update only changed fields, never
delete) and does nothing on Frappe 16 or on a site without Insights. It never
creates Insights content: a dashboard whose Insights title is not found is
skipped with a warning.

`frappe` is imported lazily, so the module imports without the ury app or even
frappe on the path. Run on a bench without ury installed:

    bench --site SITE execute ury.ury.desk_islands.setup   # if ury is installed
    # otherwise: bench --site SITE console, then
    #   import sys; sys.path.insert(0, "<ury app>/ury/ury"); import desk_islands; desk_islands.setup()
"""

MODULE_DEF = "URY Analytics"
SIDEBAR = "URY Analytics"
DOCK = "frappe"
DOCK_TITLE = "Analytics"
# Valid in the v17 lucide sprite (frappe/public/icons/lucide/icons.svg). The old
# "chart" has no symbol in either sprite and rendered as a blank dock tile.
ICON = "chart-column"
INSIGHTS_DASHBOARD_DOCTYPE = "Insights Dashboard v3"
CLAIM_FIELD = "insights_dashboard"

# (desk_name, sidebar label, Insights dashboard title, description)
_ROWS = [
	("ury-owner-overview", "DB01 Owner overview", "Owner overview",
		"Sales, bills, average bill value and covers for the owner across branches."),
	("ury-branch-daily", "DB02 Branch daily", "Branch daily",
		"One branch, one day: sales, bills, hourly pattern and service mix."),
	("ury-db03-sales-deep-dive", "DB03 Sales deep-dive", "Sales deep-dive",
		"Sales by order type, hour, weekday and waiter."),
	("ury-db04-menu-category", "DB04 Menu & category", "Menu and category",
		"Item and category sales, mix and trends."),
	("ury-db05-department-production", "DB05 Department & production", "Kitchen stations and production",
		"Production volumes per kitchen station and department."),
	("ury-db06-kitchen-timing", "DB06 Kitchen timing", "Kitchen timing",
		"KOT preparation and serving times."),
	("ury-db07-table-floor", "DB07 Tables & floor", "Tables and floor",
		"Table turnover, occupancy and floor performance."),
	("ury-db08-employee-performance", "DB08 Staff performance", "Staff performance",
		"Sales and service performance by staff member."),
	("ury-db09-payments-cashup", "DB09 Payments & cash-up", "Payments and cash-up",
		"Payment modes and cash-up differences."),
	("ury-db10-margin-cost", "DB10 Margin & cost", "Margin and cost",
		"Daily margin and cost of goods."),
	("ury-db11-wastage-shrinkage", "DB11 Wastage & shrinkage", "Stock count and wastage",
		"Stock count corrections, wastage and shrinkage."),
	("ury-db12-yield-recipe", "DB12 Yield & recipe", "Yield and recipe",
		"Recipe yield versus actual consumption."),
	("ury-db13-production-planning", "DB13 Production planning", "Production planning",
		"Sales plan items against production."),
	("ury-db14-data-quality", "DB14 Data readiness", "Data readiness",
		"Which dashboards have enough data to be trusted."),
	("ury-db15-leakage", "DB15 Leakage", "Leakage",
		"Cancellations, discounts, returns and other revenue leakage."),
	("ury-db16-chairman-crosscheck", "DB16 Chairman cross-check", "Chairman brief check",
		"Cross-check of the chairman brief figures against POS data."),
]

DASHBOARDS = [
	{"desk_name": n, "label": label, "insights_title": t, "description": d}
	for n, label, t, d in _ROWS
]


def _frappe():
	import frappe

	return frappe


def _log(msg):
	try:
		_frappe().logger("ury.desk_islands").info(msg)
	except Exception:
		pass
	print(f"[ury.desk_islands] {msg}")


def _warn(msg):
	try:
		_frappe().logger("ury.desk_islands").warning(msg)
	except Exception:
		pass
	print(f"[ury.desk_islands] WARNING {msg}")


def islands_supported():
	"""True only on a Frappe with desk islands, with Insights, and the claim field."""
	try:
		import importlib

		importlib.import_module("frappe.utils.island")
		frappe = _frappe()
		if "insights" not in (frappe.get_installed_apps() or []):
			return False
		return bool(frappe.get_meta("Dashboard").has_field(CLAIM_FIELD))
	except Exception:
		return False


def _apply(doc, values):
	"""Set only changed fields. Returns True when something changed."""
	changed = False
	for key, value in values.items():
		if doc.get(key) != value:
			doc.set(key, value)
			changed = True
	return changed


def _insights_name(title):
	frappe = _frappe()
	rows = frappe.get_all(
		INSIGHTS_DASHBOARD_DOCTYPE,
		filters={"title": title},
		pluck="name",
		order_by="creation asc",
	)
	if len(rows) > 1:
		_warn(f"{len(rows)} Insights dashboards titled {title!r}; using {rows[0]}")
	return rows[0] if rows else None


def _setup_dashboard(row, insights_name, has_description, summary):
	frappe = _frappe()
	values = {CLAIM_FIELD: insights_name, "is_standard": 0, "is_default": 0}
	if has_description:
		values["description"] = row["description"]
	name = row["desk_name"]
	if frappe.db.exists("Dashboard", name):
		doc = frappe.get_doc("Dashboard", name)
		if _apply(doc, values):
			doc.save(ignore_permissions=True)
			summary["dashboards_updated"].append(name)
		return
	doc = frappe.get_doc({"doctype": "Dashboard", "dashboard_name": name, **values})
	doc.insert(ignore_permissions=True)
	summary["dashboards_created"].append(name)


def _setup_module_def(summary):
	frappe = _frappe()
	if frappe.db.exists("Module Def", MODULE_DEF):
		return
	frappe.get_doc({"doctype": "Module Def", "module_name": MODULE_DEF, "custom": 1}).insert(
		ignore_permissions=True
	)
	summary["module_def_created"] = True


def _setup_sidebar(rows, summary):
	"""rows: the desk dashboards that were resolved (skipped ones get no link)."""
	frappe = _frappe()
	if frappe.db.exists("Sidebar", SIDEBAR):
		doc = frappe.get_doc("Sidebar", SIDEBAR)
		created = False
	else:
		doc = frappe.get_doc(
			{"doctype": "Sidebar", "title": SIDEBAR, "module": MODULE_DEF, "app": "frappe", "standard": 0}
		)
		created = True
	changed = created
	changed |= _apply(doc, {"header_icon": ICON})
	existing = {i.get("link_to"): i for i in (doc.get("items") or []) if i.get("link_type") == "Dashboard"}
	for row in rows:
		values = {
			"type": "Link",
			"label": row["label"],
			"link_type": "Dashboard",
			"link_to": row["desk_name"],
			"icon": ICON,
			"open_in_new_tab": 1,
		}
		item = existing.get(row["desk_name"])
		if item is None:
			doc.append("items", values)
			changed = True
		elif _apply(item, values):
			changed = True
	if changed:
		if created:
			doc.insert(ignore_permissions=True)
		else:
			doc.save(ignore_permissions=True)
		summary["sidebar"] = "created" if created else "updated"
	else:
		summary["sidebar"] = "unchanged"


def _setup_dock(summary):
	frappe = _frappe()
	if not frappe.db.exists("Dock", DOCK):
		_warn(f"Dock {DOCK!r} not found; dock item skipped")
		summary["dock"] = "missing"
		return
	doc = frappe.get_doc("Dock", DOCK)
	values = {"link_type": "Sidebar", "link_to": SIDEBAR, "title": DOCK_TITLE, "icon": ICON}
	item = next(
		(i for i in (doc.get("items") or []) if i.get("link_type") == "Sidebar" and i.get("link_to") == SIDEBAR),
		None,
	)
	if item is None:
		doc.append("items", values)
		changed, state = True, "created"
	else:
		changed, state = _apply(item, values), "updated"
	if changed:
		doc.save(ignore_permissions=True)
		summary["dock"] = state
	else:
		summary["dock"] = "unchanged"


def setup():
	"""Create/refresh the island wiring. Idempotent; returns a summary dict."""
	summary = {
		"supported": False,
		"dashboards_created": [],
		"dashboards_updated": [],
		"skipped": [],
		"module_def_created": False,
		"sidebar": None,
		"dock": None,
	}
	if not islands_supported():
		_log("desk islands not supported on this site (needs Frappe island support + Insights); skipped")
		return summary
	summary["supported"] = True
	frappe = _frappe()
	has_description = bool(frappe.get_meta("Dashboard").has_field("description"))

	resolved = []
	for row in DASHBOARDS:
		insights_name = _insights_name(row["insights_title"])
		if not insights_name:
			_warn(f"Insights dashboard {row['insights_title']!r} not found; skipping {row['desk_name']}")
			summary["skipped"].append(row["desk_name"])
			continue
		_setup_dashboard(row, insights_name, has_description, summary)
		resolved.append(row)

	if not resolved:
		_log("no Insights dashboards found; module def, sidebar and dock left alone")
		return summary

	_setup_module_def(summary)
	_setup_sidebar(resolved, summary)
	_setup_dock(summary)
	_log(f"done: {summary}")
	return summary


def after_migrate():
	"""Hook entry point. Never raises, so a failure here cannot break `bench migrate`."""
	try:
		setup()
	except Exception:
		try:
			import traceback

			_frappe().log_error(title="URY desk islands setup failed", message=traceback.format_exc())
		except Exception:
			pass
