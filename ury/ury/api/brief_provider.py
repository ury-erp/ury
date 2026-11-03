"""Data provider for the huf_brief app (hook: ``huf_brief_data_provider``).

Dispatches ``kind`` to the same query functions that back the chairman AI tools in
``chairman_tools.py`` and returns the dict those tools produce BEFORE the tool wrapper adds
cards. No role check here (huf_brief does that); data scoping is untouched because the
underlying functions read ``frappe.session.user`` themselves.

The chairman tools are wrapped by ``guarded`` (chairman role + chat-conversation context +
cards). We call the unwrapped function (``__wrapped__``) and re-apply only the pure parts of
the wrapper: ValueError -> ValidationError and output sanitising.
"""

import frappe

# kind -> (chairman_tools function name, accepted filter keys, in order)
KINDS = {
	"day_summary": ("get_day_summary", ("date",)),
	"month_to_date": ("get_month_to_date", ("date",)),
	"branch_ranking": ("get_branch_ranking", ("date",)),
	"leakage_week": ("get_leakage_week", ("date",)),
	"cashup_week": ("get_cashup_week", ("date",)),
	"sales_range": ("get_sales_range", ("start_date", "end_date")),
	"top_bottom_dishes": ("get_top_bottom_dishes", ("start_date", "end_date", "limit")),
	"order_type_payment_mix": ("get_order_type_and_payment_mix", ("start_date", "end_date")),
	"cancellations": ("get_cancellations", ("start_date", "end_date")),
	"kitchen_speed": ("get_kitchen_speed", ("start_date", "end_date")),
	"ideas_context": ("get_ideas_context", ("start_date", "end_date")),
}


def get_brief_data(kind, filters=None):
	if kind == "brief":
		# The full daily brief payload (slides, features) is built by ury's own function.
		from ury.ury.api import chairman

		f = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
		return chairman.get_brief(f.get("date") if isinstance(f, dict) else None)
	if kind not in KINDS:
		frappe.throw(f"Unknown brief data kind: {kind}", frappe.ValidationError)
	if isinstance(filters, str):
		filters = frappe.parse_json(filters)
	filters = filters or {}
	if not isinstance(filters, dict):
		frappe.throw("filters must be an object", frappe.ValidationError)

	from ury.ury.api import chairman_tools

	fn_name, keys = KINDS[kind]
	fn = getattr(chairman_tools, fn_name)
	fn = getattr(fn, "__wrapped__", fn)  # skip role/chat-context/cards wrapper
	kwargs = {k: filters[k] for k in keys if filters.get(k) is not None}
	try:
		out = fn(**kwargs)
	except TypeError as e:  # e.g. missing start_date/end_date
		frappe.throw(f"Invalid filters for {kind}: {e}", frappe.ValidationError)
	except ValueError as e:
		frappe.throw(str(e), frappe.ValidationError)
	if isinstance(out, dict):
		out = chairman_tools.sanitize(out)
		if "note" in out:
			out["context_note"] = out.pop("note")
	return out
