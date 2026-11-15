"""What a session started at a station looks like to the rest of URY."""

import frappe
from frappe.utils import cint

from ury.ury.station.pin import get_settings

# Key in the session data that marks a session as started at a station.
SESSION_KEY = "ury_station"
STATION_PAGE = "/station"
DEFAULT_LANDING_PAGE = "/pos/order"


def current_station() -> str | None:
	"""Station code if this session was started with a PIN at a station."""
	try:
		if frappe.session.user == "Guest":
			return None
		return frappe.session.data.get(SESSION_KEY)
	except Exception:
		return None


def landing_page() -> str:
	"""Where a waiter goes after signing in. Only ever a path on this site."""
	path = get_settings().landing_page or ""
	return path if path.startswith("/") and not path.startswith("//") else DEFAULT_LANDING_PAGE


def boot_info() -> dict | None:
	"""Added to the POS boot so it shows Done and signs out when idle."""
	station = current_station()
	if not station:
		return None
	settings = get_settings()
	return {
		"station": station,
		"idle_seconds": cint(settings.idle_seconds) or 90,
		"warning_seconds": cint(settings.warning_seconds) or 15,
		"station_page": STATION_PAGE,
	}


def after_request(response=None, request=None):
	"""Keep station sessions in the POS: a PIN must not open the desk."""
	if response is None or request is None or request.method != "GET":
		return
	path = request.path.rstrip("/")
	if not (path in ("/desk", "/app") or path.startswith(("/desk/", "/app/"))):
		return
	if current_station() and cint(get_settings().block_desk):
		response.status_code = 302
		response.headers["Location"] = landing_page()
		response.set_data(b"")
