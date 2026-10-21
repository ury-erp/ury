import frappe
from frappe.utils import getdate, get_time
from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import POSInvoiceMergeLog

class CustomPOSInvoiceMergeLog(POSInvoiceMergeLog):
	def validate(self):
		super().validate()
		self.set_sales_closing_date_and_time()

	def set_sales_closing_date_and_time(self):
		closing_time, closing_date = self.get_sales_closing_time_and_date()
		if closing_time:
			self.posting_time = closing_time
		if closing_date:
			self.posting_date = closing_date

	def get_sales_closing_time_and_date(self):
		"""Returns (closing_time, closing_date) from POS Profile/POS Closing Entry if configured,
		otherwise (None, None).
		"""
		pos_profile = None
		period_start_date = None

		if self.pos_closing_entry:
			closing_data = frappe.db.get_value(
				"POS Closing Entry",
				self.pos_closing_entry,
				["pos_profile", "period_start_date"],
				as_dict=True,
			)
			if closing_data:
				pos_profile = closing_data.get("pos_profile")
				period_start_date = closing_data.get("period_start_date")

		if not pos_profile and self.pos_invoices:
			first_inv = self.pos_invoices[0].pos_invoice
			if first_inv:
				pos_profile = frappe.db.get_value("POS Invoice", first_inv, "pos_profile")
				if not period_start_date:
					pos_opening = frappe.db.get_value("POS Invoice", first_inv, "pos_opening_entry")
					if pos_opening:
						period_start_date = frappe.db.get_value(
							"POS Opening Entry", pos_opening, "period_start_date"
						)

		if not pos_profile:
			return None, None

		profile_fields = []
		if frappe.db.has_column("POS Profile", "custom_sales_closing_time"):
			profile_fields.append("custom_sales_closing_time")
		if frappe.db.has_column("POS Profile", "custom_enable_opening_date"):
			profile_fields.append("custom_enable_opening_date")

		if not profile_fields:
			return None, None

		profile_data = frappe.db.get_value(
			"POS Profile",
			pos_profile,
			profile_fields,
			as_dict=True,
		)
		if not profile_data:
			return None, None

		closing_time = None
		sales_closing_time = profile_data.get("custom_sales_closing_time")
		if sales_closing_time:
			closing_time = get_time(sales_closing_time)

		closing_date = None
		if profile_data.get("custom_enable_opening_date") and period_start_date:
			closing_date = getdate(period_start_date)

		return closing_time, closing_date

	def process_merging_into_sales_invoice(self, data):
		sales_invoice = self.get_new_sales_invoice()
		sales_invoice = self.merge_pos_invoice_into(sales_invoice, data)

		closing_time, closing_date = self.get_sales_closing_time_and_date()
		posting_time = closing_time or get_time(self.posting_time)
		posting_date = closing_date or getdate(self.posting_date)

		sales_invoice.is_consolidated = 1
		sales_invoice.set_posting_time = 1

		sales_invoice.posting_date = posting_date
		sales_invoice.posting_time = posting_time

		sales_invoice.save()
		sales_invoice.submit()
		self.consolidated_invoice = sales_invoice.name

		return sales_invoice

	def process_merging_into_credit_notes(self, data):
		closing_time, closing_date = self.get_sales_closing_time_and_date()
		credit_notes = {}
		for key, value in data.items():
			if not value:
				continue

			credit_note = self.get_new_sales_invoice()
			credit_note.is_return = 1

			credit_note = self.merge_pos_invoice_into(credit_note, value)
			credit_note.return_against = key

			credit_note.is_consolidated = 1
			credit_note.set_posting_time = 1
			credit_note.posting_date = closing_date or getdate(self.posting_date)
			credit_note.posting_time = closing_time or get_time(self.posting_time)
			credit_note.save()
			credit_note.submit()
			credit_notes[key] = credit_note.name

		return credit_notes
