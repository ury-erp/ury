from ury.ury.api.ury_fulfilment_posting_service import ensure_auto_manufacture_entry_type


def execute():
	"""Create the Stock Entry Type used for automated Manufacture entries."""
	ensure_auto_manufacture_entry_type()
