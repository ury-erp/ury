from frappe.model.document import Document


class ChairmanWhatsAppAudit(Document):
	"""Per-message audit row for the WhatsApp channel. Holds ids, intent, outcome and a card hash,
	never message content. Purged after 90 days by ury.chairman_jobs.purge_chairman_whatsapp."""
