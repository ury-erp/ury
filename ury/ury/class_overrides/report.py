from frappe.core.doctype.report.report import Report


class CustomReport(Report):
	def execute_query_report(self, filters):
		# The Query Report frontend omits filters left blank, but a query report's
		# SQL may still reference %(fieldname)s for optional filters. Supply the
		# missing keys from the report's filter definitions (blank when unset)
		# instead of letting frappe.db.sql raise KeyError on the missing param.
		if isinstance(filters, dict):
			for f in self.filters:
				if f.fieldname and f.fieldname not in filters:
					default = f.default or ""
					filters[f.fieldname] = default.strip() if isinstance(default, str) else default
		return super().execute_query_report(filters)
