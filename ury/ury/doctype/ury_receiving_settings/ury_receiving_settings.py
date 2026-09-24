from frappe.model.document import Document
import frappe


class URYReceivingSettings(Document):
	def validate(self):
		for fieldname in ("default_tolerance_lower_pct", "default_tolerance_upper_pct"):
			value = self.get(fieldname)
			if value is not None and not (0 <= float(value) <= 100):
				frappe.throw(f"{self.meta.get_label(fieldname)} must be between 0 and 100.")
