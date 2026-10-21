from frappe.model.document import Document
import frappe


def get_rule_tiers(rule):
	"""Tiers of a URY Commission Rule row.

	Rule is itself a child table of the Settings single, and Tier is its child.
	Frappe v16 does not load (or save) grandchild tables, so ``rule.tiers`` may
	be missing. Prefer rows set in memory, else query them explicitly.
	"""
	pending = rule.flags.get("pending_tiers")
	if pending is not None:
		return [frappe._dict(idx=i + 1, **t) for i, t in enumerate(pending)]
	tiers = rule.get("tiers")
	if tiers:
		return tiers
	if not rule.get("name") or rule.is_new():
		return []
	return frappe.get_all(
		"URY Commission Tier",
		filters={"parent": rule.name, "parenttype": "URY Commission Rule", "parentfield": "tiers"},
		fields=["name", "idx", "from_amount", "rate"],
		order_by="idx asc",
		ignore_permissions=True,
	)


class URYCommissionSettings(Document):
	def on_update(self):
		# v16 does not persist grandchild rows; sync tiers explicitly.
		names = [r.name for r in self.rules]
		# drop tiers of rules that no longer exist
		orphan = {"parenttype": "URY Commission Rule", "parentfield": "tiers"}
		if names:
			orphan["parent"] = ["not in", names]
		frappe.db.delete("URY Commission Tier", orphan)
		for rule in self.rules:
			pending = rule.flags.get("pending_tiers")
			tiers = get_rule_tiers(rule) if pending is not None else rule.get("tiers")
			if pending is None and not tiers:
				continue  # untouched in memory: keep what is stored
			frappe.db.delete("URY Commission Tier", {"parent": rule.name, "parenttype": "URY Commission Rule", "parentfield": "tiers"})
			for t in tiers:
				frappe.get_doc({
					"doctype": "URY Commission Tier",
					"parent": rule.name, "parenttype": "URY Commission Rule", "parentfield": "tiers",
					"idx": t.idx, "from_amount": t.from_amount, "rate": t.rate,
				}).db_insert()

	def validate(self):
		if self.default_rate is not None and not (0 <= float(self.default_rate) <= 100):
			frappe.throw("Default Rate must be between 0 and 100.")
		seen = set()
		for row in self.rules:
			key = (row.branch or "", row.designation or "", row.employee or "")
			if key in seen:
				frappe.throw(f"Row {row.idx}: duplicate branch/designation/employee combination.")
			seen.add(key)
			if row.rate_type == "Flat":
				if not (0 <= float(row.rate or 0) <= 100):
					frappe.throw(f"Row {row.idx}: Rate must be between 0 and 100.")
			else:
				tiers = get_rule_tiers(row)
				if not tiers:
					frappe.throw(f"Row {row.idx}: a Tiered rule needs at least one tier.")
				amounts = [float(t.from_amount or 0) for t in tiers]
				if amounts[0] != 0:
					frappe.throw(f"Row {row.idx}: the first tier must start at 0.")
				if amounts != sorted(amounts) or len(set(amounts)) != len(amounts):
					frappe.throw(f"Row {row.idx}: tier 'From Amount' must be strictly ascending.")
				for t in tiers:
					if not (0 <= float(t.rate or 0) <= 100):
						frappe.throw(f"Row {row.idx}, tier {t.idx}: Rate must be between 0 and 100.")
