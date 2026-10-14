import frappe
from frappe.utils import getdate, get_time
from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import POSInvoiceMergeLog

class CustomPOSInvoiceMergeLog(POSInvoiceMergeLog):
	def process_merging_into_sales_invoice(self, data):
		sales_invoice = self.get_new_sales_invoice()
		sales_invoice = self.merge_pos_invoice_into(sales_invoice, data)

		sales_invoice.is_consolidated = 1
		sales_invoice.set_posting_time = 1

		sales_invoice.posting_date = getdate(self.posting_date)
		sales_invoice.posting_time = get_time(self.posting_time)

		# Do NOT set is_created_using_pos here: when POS Settings.invoice_type
		# is "POS Invoice", ERPNext.validate_created_using_pos throws
		# "Transactions using Sales Invoice in POS are disabled."
		# Cash expected at shift close is handled by URY's closing helpers
		# when custom_consolidate_on_payment is enabled.

		sales_invoice.save()
		sales_invoice.submit()
		self.consolidated_invoice = sales_invoice.name

		return sales_invoice
