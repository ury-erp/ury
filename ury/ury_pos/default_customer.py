"""Per-order-type default customer resolution for POS Profile.

Single source of truth used by:
  * ``getPosProfile`` / ``getPosProfileFull`` / ``get_captain_context`` (payload
    the POS, Captain and Serve clients preselect from), and
  * ``sync_order`` (server-side fallback when a client sends no customer for a
    new order), so every client behaves the same, including cached or legacy
    ones.

Resolution order for an order type:
  1. the matching row of ``POS Profile.custom_order_type_customers``
  2. the profile-level default customer (``POS Profile.customer``)
  3. ``None``

Aggregator orders are never resolved here; the aggregator flow owns its customer.
A missing or disabled customer is skipped (and logged) instead of raising.
"""

import frappe

AGGREGATORS = "Aggregators"


def _fetch_enabled_customers(names):
	"""One batched query: {customer name: {customer, customer_name, mobile_number}}."""
	names = sorted({n for n in names if n})
	if not names:
		return {}

	rows = frappe.get_all(
		"Customer",
		filters={"name": ["in", names]},
		fields=["name", "customer_name", "mobile_number", "disabled"],
	)
	return {
		row.name: {
			"customer": row.name,
			"customer_name": row.customer_name,
			"mobile_number": row.mobile_number,
		}
		for row in rows
		if not row.disabled
	}


def get_default_customer_config(profile):
	"""Return the default-customer payload for a POS Profile document.

	``order_type_customer_map`` is keyed by order type and holds the customer id,
	name and mobile so clients need no extra (permission-gated) Customer fetch.
	``default_customer`` is the profile-level default, or ``None``.
	"""
	rows = [
		row
		for row in (profile.get("custom_order_type_customers") or [])
		if row.order_type and row.customer
	]
	names = {row.customer for row in rows}
	profile_default = profile.get("customer")
	if profile_default:
		names.add(profile_default)

	customers = _fetch_enabled_customers(names)

	order_type_customer_map = {}
	for row in rows:
		entry = customers.get(row.customer)
		if entry is None:
			frappe.logger("ury").warning(
				"POS Profile %s: default customer %s for %s is missing or disabled; skipped",
				profile.name,
				row.customer,
				row.order_type,
			)
			continue
		order_type_customer_map[row.order_type] = entry

	default_customer = customers.get(profile_default) if profile_default else None
	if profile_default and default_customer is None:
		frappe.logger("ury").warning(
			"POS Profile %s: profile default customer %s is missing or disabled; skipped",
			profile.name,
			profile_default,
		)

	return {
		"order_type_customer_map": order_type_customer_map,
		"default_customer": default_customer,
	}


def resolve_default_customer(profile, order_type):
	"""Return the default customer id for ``order_type`` or ``None``."""
	if not order_type or order_type == AGGREGATORS:
		return None

	config = get_default_customer_config(profile)
	entry = config["order_type_customer_map"].get(order_type) or config["default_customer"]
	return entry["customer"] if entry else None


def validate_order_type_customers(doc, method=None):
	"""POS Profile validate hook: no duplicate order types, customer must be enabled."""
	rows = doc.get("custom_order_type_customers") or []
	seen = set()
	for row in rows:
		if row.order_type in seen:
			frappe.throw(
				frappe._("Row #{0}: Order Type {1} is already configured for this POS Profile.").format(
					row.idx, frappe.bold(row.order_type)
				),
				title=frappe._("Duplicate Order Type"),
			)
		seen.add(row.order_type)

	if not rows:
		return

	customers = frappe.get_all(
		"Customer",
		filters={"name": ["in", sorted({r.customer for r in rows if r.customer})]},
		fields=["name", "disabled"],
	)
	status = {c.name: c.disabled for c in customers}
	for row in rows:
		if not row.customer or row.customer not in status:
			frappe.throw(
				frappe._("Row #{0}: Default Customer {1} does not exist.").format(
					row.idx, frappe.bold(row.customer or "")
				)
			)
		if status[row.customer]:
			frappe.throw(
				frappe._("Row #{0}: Default Customer {1} is disabled.").format(
					row.idx, frappe.bold(row.customer)
				)
			)
