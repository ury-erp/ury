from frappe.model.document import Document
import frappe


class URYCommissionSettings(Document):
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
				if not row.tiers:
					frappe.throw(f"Row {row.idx}: a Tiered rule needs at least one tier.")
				amounts = [float(t.from_amount or 0) for t in row.tiers]
				if amounts[0] != 0:
					frappe.throw(f"Row {row.idx}: the first tier must start at 0.")
				if amounts != sorted(amounts) or len(set(amounts)) != len(amounts):
					frappe.throw(f"Row {row.idx}: tier 'From Amount' must be strictly ascending.")
				for t in row.tiers:
					if not (0 <= float(t.rate or 0) <= 100):
						frappe.throw(f"Row {row.idx}, tier {t.idx}: Rate must be between 0 and 100.")
