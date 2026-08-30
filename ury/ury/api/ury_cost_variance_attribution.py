"""Attribute posted, counted, and theoretical cost/variance for one fulfilled item.

Depends on V3-71/V3-72 (`URY Fulfilment Record`, read-only source of posted
quantities) and V3-41 (`ury.ury.api.ury_bom_compiler.compile_bom_vector`, the
BOM-exploded theoretical cost source). This module is a pure, read-only
reporting/attribution layer over those two data sources plus `Item.valuation_rate`.

It NEVER creates, updates, cancels, or reads for the purpose of mutating any
real ERPNext accounting/ledger document -- no ``GL Entry``, no ``Journal
Entry``, no ``Stock Entry``, no ``Stock Ledger Entry`` write, no ``Bin``
mutation. It only reads `Item.valuation_rate` via `frappe.db.get_value` (a
plain scalar read) and, optionally, persists its own attribution result to a
new storage-only doctype (`URY Cost Variance Snapshot`) that this task adds.

## Three cost figures, and why they collapse today

GOAL.md's "COGS: Posted, Counted, and ERPNext Truth" framing (see the V3-70
transition checklist, "V3-74 adds cost/variance attribution") distinguishes:

- **Theoretical cost**: what the BOM says a quantity of a menu item *should*
  cost -- BOM-exploded component quantities (V3-41's `compile_bom_vector`)
  multiplied by each component's current `Item.valuation_rate`, summed.
- **Posted cost**: what the fulfilment/accounting layer actually recorded as
  consumed. As of this task, `URY Fulfilment Record.posted_to_erpnext` is
  always False for every row (V3-71/V3-72 never post to a real ERPNext stock
  document, and V3-73's flag that would eventually flip this defaults off --
  see V3-73's own scope). There is therefore no real posted-cost source (no
  Stock Ledger Entry, no GL Entry) to read yet. `compute_posted_cost` computes
  the *same* qty * valuation_rate calculation as theoretical cost, and
  documents this explicitly rather than silently returning a number that
  looks like it came from a real posting.
  TODO(V3-73-flag-on / future task): once `posted_to_erpnext` is True for
  real fulfilment records (i.e. V3-73's flag is on and wired to an actual
  ERPNext stock posting), replace the body of `compute_posted_cost` with a
  read of the actual posted valuation from `Stock Ledger Entry` /
  `GL Entry` for the linked posting, instead of recomputing qty * rate here.
- **Counted cost**: what a physical/manual stock count says was actually
  consumed. No physical-count doctype exists in this codebase yet, so
  `counted_qty` is accepted as an explicit external input parameter to
  `compute_variance` (documented accepted-input pattern, same posture V3-33
  used for wastage valuation before a dedicated doctype existed).

## Persistence

`compute_variance` optionally persists its result dict to a new
storage-only doctype, `URY Cost Variance Snapshot`, mirroring the pattern
established by `URY Fulfilment Record` / `URY Issue Wastage`: a plain
`frappe.get_doc({...}).insert()` with no submit/cancel workflow, no ledger
side effects, and no controller logic beyond field storage. Persistence is
opt-in via `persist=True` so pure computation (e.g. in the fixture example
and tests) never touches the database.
"""

import frappe
from frappe import _

from ury.ury.api.ury_bom_compiler import compile_bom_vector
from ury.ury.report_api.utils import require_manager


COST_VARIANCE_SNAPSHOT_DOCTYPE = "URY Cost Variance Snapshot"
FULFILMENT_RECORD_DOCTYPE = "URY Fulfilment Record"


def compute_theoretical_cost(item_code, qty, company):
	"""Theoretical cost = sum(BOM component qty * component valuation_rate).

	Pure, read-only, deterministic: explodes `item_code`'s active BOM for
	`qty` units via `compile_bom_vector` (V3-41), then reads each
	component's current `Item.valuation_rate` with a plain scalar
	`frappe.db.get_value` call (no ledger read, no Stock Ledger Entry
	involved). Fails closed the same way `compile_bom_vector` does: raises
	`frappe.ValidationError` if there is no active BOM or no exploded
	components.

	Returns:
		{
			"item_code", "qty", "company", "bom", "source",
			"components": [
				{"component_item", "qty", "stock_uom", "valuation_rate", "cost"},
				...
			],
			"theoretical_cost": <float total>,
		}
	"""
	_require_scope(company)

	vector = compile_bom_vector(item_code, qty, company)

	components = []
	total_cost = 0.0
	for component in vector["components"]:
		valuation_rate = _valuation_rate(component["component_item"], company)
		cost = component["qty"] * valuation_rate
		total_cost += cost
		components.append(
			{
				"component_item": component["component_item"],
				"qty": component["qty"],
				"stock_uom": component["stock_uom"],
				"valuation_rate": valuation_rate,
				"cost": cost,
			}
		)

	return {
		"item_code": item_code,
		"qty": qty,
		"company": company,
		"bom": vector["bom"],
		"source": vector["source"],
		"components": components,
		"theoretical_cost": total_cost,
	}


def compute_posted_cost(kot_or_fulfilment_ref, company):
	"""Posted cost for one `URY Fulfilment Record` (looked up by name or KOT).

	IMPORTANT (documented, see module docstring): as of this task
	`posted_to_erpnext` is always False for every fulfilment record (V3-71/
	V3-72 never post to a real ERPNext stock document, and V3-73's flag that
	would eventually flip this defaults off). So today "posted cost" is
	always theoretical-equivalent: this function reads the record's
	item_code/qty and computes qty * valuation_rate exactly like
	`compute_theoretical_cost`'s per-item calculation -- it does NOT read
	any real posting, because none exists yet.

	TODO(V3-73-flag-on / future task): once a fulfilment record's
	`posted_to_erpnext` is True for a real posting, source the real posted
	cost from `Stock Ledger Entry` / `GL Entry` for that posting instead of
	recomputing qty * rate here.

	`kot_or_fulfilment_ref` may be the `URY Fulfilment Record` document
	name, or a KOT name (in which case the most recently fulfilled matching
	record for that KOT/company is used).

	Returns:
		{
			"fulfilment_record", "kot", "item_code", "qty", "company",
			"valuation_rate", "posted_to_erpnext", "posted_cost",
			"is_theoretical_equivalent": True,
		}
	Fails closed (frappe.ValidationError) if no matching fulfilment record
	is found, or if it does not match `company`.
	"""
	_require_scope(company)

	record = _resolve_fulfilment_record(kot_or_fulfilment_ref, company)

	valuation_rate = _valuation_rate(record["item_code"], company)
	posted_cost = (record["qty"] or 0.0) * valuation_rate

	return {
		"fulfilment_record": record["name"],
		"kot": record["kot"],
		"item_code": record["item_code"],
		"qty": record["qty"],
		"company": company,
		"valuation_rate": valuation_rate,
		"posted_to_erpnext": bool(record["posted_to_erpnext"]),
		"posted_cost": posted_cost,
		"is_theoretical_equivalent": True,
	}


@frappe.whitelist()
def compute_variance(item_code, qty, company, counted_qty=None, persist=False):
	"""Structured cost/variance attribution for one item/qty/company.

	`counted_qty` is an accepted EXTERNAL INPUT (see module docstring: no
	physical-count doctype exists yet), not read from any document. When
	omitted, the counted-cost and variance-vs-counted fields are left out.

	Read-only by default. When `persist` is truthy, additionally writes one
	`URY Cost Variance Snapshot` row (storage-only doctype, no ledger side
	effects -- see module docstring) and includes its name in the result.

	Returns:
		{
			"item_code", "qty", "company",
			"theoretical_cost", "posted_cost",
			"counted_qty", "counted_cost"  (only if counted_qty given),
			"variance_vs_theoretical", "variance_vs_counted" (or None),
			"reason",
			"snapshot" (only if persist truthy),
		}
	"""
	require_manager()
	_require_scope(company)

	if qty is None or qty <= 0:
		frappe.throw(_("Quantity must be greater than zero"), frappe.ValidationError)

	theoretical = compute_theoretical_cost(item_code, qty, company)
	theoretical_cost = theoretical["theoretical_cost"]

	# Posted cost, computed the same way as theoretical for now (see
	# compute_posted_cost's docstring/TODO) -- no fulfilment record lookup
	# is required here since this entry point is item/qty/company scoped,
	# not fulfilment-record scoped.
	posted_cost = theoretical_cost

	result = {
		"item_code": item_code,
		"qty": qty,
		"company": company,
		"theoretical_cost": theoretical_cost,
		"posted_cost": posted_cost,
		"variance_vs_theoretical": posted_cost - theoretical_cost,
		"reason": (
			"posted_cost is currently theoretical-equivalent: no real ERPNext "
			"posting exists for this fulfilment path yet (V3-73's flag defaults "
			"off). See compute_posted_cost's TODO for the future GL/Stock Ledger "
			"Entry sourcing."
		),
	}

	if counted_qty is not None:
		if counted_qty < 0:
			frappe.throw(_("Counted quantity cannot be negative"), frappe.ValidationError)
		valuation_rate = theoretical_cost / qty if qty else 0.0
		counted_cost = counted_qty * valuation_rate
		result["counted_qty"] = counted_qty
		result["counted_cost"] = counted_cost
		result["variance_vs_counted"] = counted_cost - theoretical_cost
	else:
		result["counted_qty"] = None
		result["counted_cost"] = None
		result["variance_vs_counted"] = None

	if persist:
		doc = frappe.get_doc(
			{
				"doctype": COST_VARIANCE_SNAPSHOT_DOCTYPE,
				"item_code": item_code,
				"qty": qty,
				"company": company,
				"theoretical_cost": theoretical_cost,
				"posted_cost": posted_cost,
				"counted_qty": result["counted_qty"],
				"counted_cost": result["counted_cost"],
				"variance_vs_theoretical": result["variance_vs_theoretical"],
				"variance_vs_counted": result["variance_vs_counted"],
				"reason": result["reason"],
				"computed_at": frappe.utils.now(),
			}
		)
		doc.insert(ignore_permissions=False)
		result["snapshot"] = doc.name

	return result


# --- internal helpers -------------------------------------------------------


def _require_scope(company):
	"""Fail closed if company scope is missing, matching the established pattern."""
	if not company:
		frappe.throw(_("Company is required"), frappe.ValidationError)


def _valuation_rate(item_code, company):
	"""Read-only scalar lookup of an item's current valuation rate.

	Uses `frappe.db.get_value` -- no ledger read, no Stock Ledger Entry, no
	GL Entry involved. Returns 0.0 (not None) if the item has no valuation
	rate set, so callers can still compute a (zero) cost rather than crash
	on a missing rate for a low-value/free component.
	"""
	valuation_rate = frappe.db.get_value("Item", item_code, "valuation_rate")
	return valuation_rate or 0.0


def _resolve_fulfilment_record(kot_or_fulfilment_ref, company):
	"""Resolve `kot_or_fulfilment_ref` to one `URY Fulfilment Record` row.

	Tries an exact document-name match first (the record's own `name`),
	then falls back to treating the reference as a KOT and picking the most
	recently fulfilled matching record. Fails closed on no match or a
	company mismatch.
	"""
	record = frappe.db.get_value(
		FULFILMENT_RECORD_DOCTYPE,
		kot_or_fulfilment_ref,
		["name", "kot", "item_code", "qty", "company", "posted_to_erpnext"],
		as_dict=True,
	)

	if not record:
		candidates = frappe.get_all(
			FULFILMENT_RECORD_DOCTYPE,
			filters={"kot": kot_or_fulfilment_ref},
			fields=["name", "kot", "item_code", "qty", "company", "posted_to_erpnext"],
			order_by="fulfilled_at desc, creation desc",
			limit_page_length=1,
		)
		record = candidates[0] if candidates else None

	if not record:
		frappe.throw(
			_("No URY Fulfilment Record found for {0}").format(kot_or_fulfilment_ref),
			frappe.ValidationError,
		)

	if record.get("company") and company and record["company"] != company:
		frappe.throw(
			_("Fulfilment record {0} belongs to company {1}, not {2}").format(
				record["name"], record["company"], company
			),
			frappe.ValidationError,
		)

	return record
