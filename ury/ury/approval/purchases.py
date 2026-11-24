import json

import frappe
from erpnext.setup.utils import get_exchange_rate
from frappe import _
from frappe.utils import flt, getdate, nowdate

from ury.ury.approval.config import control_enabled, get_approval_levels
from ury.ury.approval.documents import approval_branch, validate_mixed_branch
from ury.ury.approval.service import assert_approved, invalidate_requests, request_approval

WARNING_FIELDS = (
	"custom_ury_warning_price_limit",
	"custom_ury_warning_percentage_limit",
)
APPROVAL_LIMIT_FIELDS = ("approval_price_limit", "approval_percentage_limit")


def validate_item(doc, method=None):
	if not doc.get("custom_ury_enable_price_control"):
		return
	for fieldname in WARNING_FIELDS:
		_require_limit(doc.get(fieldname), doc.meta.get_label(fieldname))
	rows = doc.get("custom_ury_price_approval_limits") or []
	if not rows:
		frappe.throw(_("At least one Item price approval limit is required when Price Control is enabled"))
	seen = set()
	for row in rows:
		if not row.level or row.level < 1:
			frappe.throw(_("Item price approval levels must be positive integers"))
		if row.level in seen:
			frappe.throw(_("Duplicate Item price approval level {0}").format(row.level))
		seen.add(row.level)
		for fieldname in APPROVAL_LIMIT_FIELDS:
			_require_limit(row.get(fieldname), row.meta.get_label(fieldname), row.level)


def _require_limit(value, label, level=None):
	if value in (None, ""):
		frappe.throw(
			_("{0} is mandatory when Item Price Control is enabled{1}").format(
				label, _(" at level {0}").format(level) if level else ""
			)
		)
	if flt(value) < 0:
		frappe.throw(_("{0} cannot be negative").format(label))


def before_validate(doc, method=None):
	branch = approval_branch(doc)
	if branch and not doc.flags.ury_mixed_branches and control_enabled(branch, "purchase_price"):
		_capture_price_snapshot(doc, branch)


def validate(doc, method=None):
	doc.flags.ury_purchase_price_approval_required = False
	branch = approval_branch(doc)
	if not branch or doc.flags.ury_mixed_branches or not control_enabled(branch, "purchase_price"):
		return
	levels = get_approval_levels(branch, "purchase_price", doc)
	if not hasattr(doc.flags, "ury_purchase_price_snapshot"):
		_capture_price_snapshot(doc, branch)
	snapshots = doc.flags.ury_purchase_price_snapshot
	violations = []
	warnings = []
	for row in doc.get("items") or []:
		if not row.get("item_code"):
			continue
		item = frappe.get_cached_doc("Item", row.item_code)
		if not item.get("custom_ury_enable_price_control"):
			continue
		result = _evaluate_row(row, item, levels, snapshots.get(row.name) or {})
		if result.get("warning"):
			warnings.append(result["warning"])
		if result.get("approval_level"):
			violations.append(result)
	if not violations:
		for warning in warnings:
			frappe.msgprint(warning, indicator="orange")
		invalidate_requests(
			doc, "purchase_price", remarks="Purchase price no longer requires approval", force=True
		)
		return
	target_level = max(row["approval_level"] for row in violations)
	selected_levels = [level for level in levels if level["level"] == target_level]
	if not selected_levels:
		frappe.throw(_("No approver is configured for purchase price level {0}").format(target_level))
	for warning in warnings:
		frappe.msgprint(warning, indicator="orange")
	amount = (
		doc.get("base_grand_total")
		or doc.get("grand_total")
		or sum(flt(row.get("base_amount") or row.get("amount")) for row in doc.get("items") or [])
	)
	request_approval(
		doc,
		"purchase_price",
		branch,
		levels=selected_levels,
		amount=amount,
		details=json.dumps(violations, sort_keys=True),
	)
	doc.flags.ury_purchase_price_approval_required = True


def before_submit(doc, method=None):
	validate_mixed_branch(doc)
	branch = approval_branch(doc)
	if (
		branch
		and control_enabled(branch, "purchase_price")
		and doc.flags.ury_purchase_price_approval_required
	):
		assert_approved(doc, "purchase_price")


def on_cancel(doc, method=None):
	branch = approval_branch(doc)
	if branch and control_enabled(branch, "purchase_price"):
		invalidate_requests(doc, "purchase_price", remarks="Source document cancelled", force=True)


def _capture_price_snapshot(doc, branch):
	raw_snapshot = "{}"
	if doc.name and not doc.get("__islocal") and frappe.db.exists(doc.doctype, doc.name):
		raw_snapshot = frappe.db.get_value(doc.doctype, doc.name, "custom_ury_price_control_snapshot") or "{}"
	try:
		existing = json.loads(raw_snapshot)
	except (TypeError, ValueError):
		existing = {}
	price_list = _branch_price_list(doc, branch)
	posting_date = getdate(doc.get("posting_date") or doc.get("transaction_date") or nowdate())
	snapshots = {}
	for row in doc.get("items") or []:
		if not row.get("item_code"):
			continue
		item = frappe.get_cached_doc("Item", row.item_code)
		if not item.get("custom_ury_enable_price_control"):
			continue
		identity = {
			"branch": branch,
			"item_code": row.item_code,
			"uom": row.get("uom"),
			"conversion_factor": flt(row.get("conversion_factor")) or 1,
			"supplier": doc.get("supplier"),
			"price_list": price_list,
			"posting_date": str(posting_date),
			"currency": doc.get("currency"),
			"conversion_rate": flt(doc.get("conversion_rate")),
		}
		previous = existing.get(row.name) or {}
		if previous.get("identity") == identity:
			snapshots[row.name] = previous
			continue
		price = _price_list_price(doc, row, branch)
		reference_rate = _document_currency_rate(doc, price) if price else 0
		if price and reference_rate and price.uom != row.get("uom"):
			reference_rate *= flt(row.get("conversion_factor")) or 1
		snapshots[row.name] = {
			"identity": identity,
			"price_list": price_list,
			"price_list_rate": flt(price.price_list_rate) if price else 0,
			"reference_rate": reference_rate,
		}
	doc.custom_ury_price_control_snapshot = json.dumps(snapshots, sort_keys=True)
	doc.flags.ury_purchase_price_snapshot = snapshots


def _evaluate_row(row, item, levels, snapshot):
	reference_rate = flt(snapshot.get("reference_rate"))
	if reference_rate <= 0:
		return {
			"warning": _(
				"No Price List price exists for Item {0} in {1}; purchase price approval was not applied."
			).format(row.item_code, snapshot.get("price_list") or _("the configured buying price list"))
		}
	rate = flt(row.get("rate"))
	difference = max(rate - reference_rate, 0)
	if difference <= 0:
		return {}
	percentage = difference / reference_rate * 100
	warning = _("Item {0}: rate {1} exceeds the {2} price {3} by {4} ({5:.2f}%).").format(
		row.item_code, rate, snapshot.get("price_list"), reference_rate, difference, percentage
	)
	warning_crossed = _crosses(
		difference,
		percentage,
		item.custom_ury_warning_price_limit,
		item.custom_ury_warning_percentage_limit,
	)
	limits = {limit.level: limit for limit in item.custom_ury_price_approval_limits}
	first_level = levels[0]["level"]
	if first_level not in limits:
		frappe.throw(
			_("Item {0} has no approval limits for branch level {1}").format(row.item_code, first_level)
		)
	if not _crosses_limit(difference, percentage, limits[first_level]):
		return {"warning": warning} if warning_crossed else {}
	approval_level = levels[-1]["level"]
	for level in levels[1:]:
		if level["level"] not in limits:
			frappe.throw(
				_("Item {0} has no approval limits for branch level {1}").format(
					row.item_code, level["level"]
				)
			)
		if not _crosses_limit(difference, percentage, limits[level["level"]]):
			approval_level = level["level"]
			break
	return {
		"item_code": row.item_code,
		"item_row": row.name,
		"price_list": snapshot.get("price_list"),
		"price_list_rate": flt(snapshot.get("price_list_rate")),
		"reference_rate": reference_rate,
		"rate": rate,
		"difference": difference,
		"percentage": percentage,
		"approval_level": approval_level,
		"warning": warning,
	}


def _crosses_limit(difference, percentage, limit):
	return _crosses(difference, percentage, limit.approval_price_limit, limit.approval_percentage_limit)


def _crosses(difference, percentage, amount_limit, percentage_limit):
	return difference > flt(amount_limit) or percentage > flt(percentage_limit)


def _branch_price_list(doc, branch):
	return frappe.db.get_value("Branch", branch, "custom_ury_buying_price_list") or doc.get(
		"buying_price_list"
	)


def _price_list_price(doc, row, branch):
	price_list = _branch_price_list(doc, branch)
	if not price_list:
		return None
	posting_date = getdate(doc.get("posting_date") or doc.get("transaction_date") or nowdate())
	stock_uom = frappe.db.get_value("Item", row.item_code, "stock_uom")
	uoms = list(dict.fromkeys(uom for uom in (row.get("uom"), stock_uom) if uom))
	candidates = frappe.get_all(
		"Item Price",
		filters={"item_code": row.item_code, "price_list": price_list, "buying": 1, "uom": ["in", uoms]},
		fields=[
			"name",
			"price_list",
			"price_list_rate",
			"currency",
			"uom",
			"supplier",
			"valid_from",
			"valid_upto",
			"creation",
		],
		order_by="valid_from desc, creation desc",
	)
	valid = []
	for candidate in candidates:
		if candidate.supplier and candidate.supplier != doc.get("supplier"):
			continue
		if candidate.valid_from and getdate(candidate.valid_from) > posting_date:
			continue
		if candidate.valid_upto and getdate(candidate.valid_upto) < posting_date:
			continue
		valid.append(candidate)
	if not valid:
		return None
	preferred_uom = row.get("uom") or stock_uom
	valid.sort(
		key=lambda price: (
			price.uom == preferred_uom,
			price.supplier == doc.get("supplier") and bool(doc.get("supplier")),
			getdate(price.valid_from or "1900-01-01"),
			price.creation,
		),
		reverse=True,
	)
	return valid[0]


def _document_currency_rate(doc, price):
	document_currency = doc.get("currency") or frappe.get_cached_value(
		"Company", doc.company, "default_currency"
	)
	if price.currency == document_currency:
		return flt(price.price_list_rate)
	company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
	if price.currency == company_currency and flt(doc.get("conversion_rate")):
		return flt(price.price_list_rate) / flt(doc.conversion_rate)
	posting_date = getdate(doc.get("posting_date") or doc.get("transaction_date") or nowdate())
	exchange_rate = get_exchange_rate(price.currency, document_currency, posting_date, "for_buying")
	return flt(price.price_list_rate) * flt(exchange_rate) if exchange_rate else 0
