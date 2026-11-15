"""Wrong-PIN counting and station lock."""

import frappe
from frappe.utils import add_to_date, cint, get_datetime, now_datetime

from ury.ury.station.pin import get_settings


def _key(station: str) -> str:
	return f"ury_station:wrong_pins:{station}"


def seconds_locked(station: str) -> int:
	locked_until = frappe.db.get_value("URY Station", station, "locked_until")
	if not locked_until:
		return 0
	remaining = (get_datetime(locked_until) - now_datetime()).total_seconds()
	return max(int(remaining) + 1, 0) if remaining > 0 else 0


def record_failure(station: str) -> int:
	"""Count a wrong PIN. Returns attempts left; 0 means the station is now locked."""
	settings = get_settings()
	limit = cint(settings.max_wrong_pins) or 5
	lock_minutes = cint(settings.lock_minutes) or 5

	count = cint(frappe.cache.get_value(_key(station))) + 1
	if count >= limit:
		frappe.db.set_value(
			"URY Station",
			station,
			"locked_until",
			add_to_date(now_datetime(), minutes=lock_minutes),
			update_modified=False,
		)
		frappe.cache.delete_value(_key(station))
		return 0

	# Wrong PINs are forgotten after a quiet lock period.
	frappe.cache.set_value(_key(station), count, expires_in_sec=lock_minutes * 60)
	return limit - count


def clear(station: str):
	frappe.cache.delete_value(_key(station))
	if frappe.db.get_value("URY Station", station, "locked_until"):
		frappe.db.set_value("URY Station", station, "locked_until", None, update_modified=False)
