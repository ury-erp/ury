"""Optional URY features and what switching one off actually shuts.

Each feature lists the parts of the system it owns, so that turning it off
does more than hide a menu entry:

  api      - whitelisted methods (module prefixes or exact names) refused on
             the server for everyone while the feature is off
  api_soft - methods other screens call in passing; they stay callable so a
             disabled feature never breaks the POS (a table's reservation
             badge, the realtime site name)
  www      - website pages (first path segment) that return 404 while off
  nav      - management-dashboard routes hidden and guarded while off

The on/off state lives in the URY Feature Settings single doctype and is read
through a cache, because the API gate runs on every request.
"""

import frappe
from frappe import _

CACHE_KEY = "ury_feature_state"

FEATURES = [
	# Service
	{
		"key": "captain", "group": "service", "icon": "user-check",
		"label": "Captain ordering", "description": "Waiters take orders at the table from a phone or tablet.",
		"api": (), "www": (), "nav": (), "pos": ("captain",),
	},
	{
		"key": "kitchen_display", "group": "service", "icon": "monitor",
		"label": "Kitchen display (KDS)", "description": "Kitchen screens that show tickets live, and messages from the counter to the kitchen.",
		"api": ("ury.ury.api.ury_kitchen_message",), "api_soft": (), "www": ("mosaic",), "nav": (), "pos": ("kitchen_messages",),
	},
	{
		"key": "self_ordering", "group": "guests", "icon": "qr-code",
		"label": "Self ordering (QR & kiosk)", "description": "Guests order and call the waiter from a QR code at the table or a kiosk.",
		"api": ("ury.ury.api.self_ordering", "ury.ury.api.self_ordering_qr", "ury.ury.api.service_requests"),
		"www": ("order",), "nav": (), "pos": ("service_requests",),
	},
	{
		"key": "reservations", "group": "guests", "icon": "calendar-clock",
		"label": "Reservations", "description": "Book tables ahead and see bookings on the floor plan.",
		"api": ("ury.ury.api.reservations",), "api_soft": ("ury.ury.api.reservations.get_table_reservation_status",),
		"www": (), "nav": ("/reservations",),
	},
	{
		"key": "waitlist", "group": "guests", "icon": "hourglass",
		"label": "Waitlist", "description": "Queue walk-in guests with wait estimates and table suggestions.",
		"api": ("ury.ury.api.waitlist",), "www": (), "nav": ("/waitlist",),
	},
	{
		"key": "feedback", "group": "guests", "icon": "message-square-heart",
		"label": "Guest feedback", "description": "Collect ratings and comments from guests after their visit.",
		"api": ("ury.ury.api.feedback",), "www": ("feedback",), "nav": ("/feedback",),
	},
	{
		"key": "offers", "group": "guests", "icon": "tags",
		"label": "Offers, coupons & loyalty", "description": "Discount offers, coupon codes at the POS and loyalty points.",
		"api": ("ury.ury.api.promotions", "ury.ury.api.loyalty"), "www": (), "nav": ("/offers",), "pos": ("coupons", "loyalty"),
	},
	{
		"key": "delivery", "group": "guests", "icon": "bike",
		"label": "Delivery & drivers", "description": "Dispatch board, drivers app and delivery zones.",
		"api": ("ury.ury.api.delivery", "ury.ury.api.driver_app"), "www": ("driver",), "nav": ("/delivery",),
	},
	{
		"key": "website", "group": "guests", "icon": "globe",
		"label": "Restaurant website", "description": "A public website for the restaurant with its menu and opening hours.",
		"api": ("ury.ury.api.restaurant_website", "ury.ury.api.website_editor"), "www": ("restaurant",), "nav": ("/website",),
	},
	# Back office
	{
		"key": "purchases", "group": "back_office", "icon": "shopping-cart",
		"label": "Purchases", "description": "Supplier bills that receive goods into stock, and supplier payments.",
		"api": ("ury.ury.api.purchases",), "www": (), "nav": ("/purchases",),
	},
	{
		"key": "inventory", "group": "back_office", "icon": "warehouse",
		"label": "Warehouses dashboard", "description": "Stock across warehouses, with the 3D warehouse map.",
		"api": ("ury.ury.api.inventory",), "www": (), "nav": ("/inventory",),
	},
	{
		"key": "recipes", "group": "back_office", "icon": "book-open",
		"label": "Recipes & consumption", "description": "Ingredients per product, deducted from stock on every sale and costed from purchases.",
		"api": ("ury.ury.api.recipes", "ury.ury.api.consumption"), "www": (), "nav": ("/recipes",),
	},
	# System
	{
		"key": "custom_login", "group": "system", "icon": "log-in",
		"label": "Restaurant sign-in page", "description": "The restaurant's own sign-in page instead of the standard one.",
		"api": (), "www": (), "nav": (),
	},
]

GROUPS = [
	("service", "Service"),
	("guests", "Guests"),
	("back_office", "Back office"),
	("system", "System"),
]

BY_KEY = {f["key"]: f for f in FEATURES}


class FeatureDisabledError(frappe.PermissionError):
	"""Raised for a call into a feature that is switched off."""


def enabled_map():
	"""{feature key: enabled} for every known feature. Unknown to the settings = on."""
	state = frappe.cache.get_value(CACHE_KEY)
	if state is None:
		state = {f["key"]: True for f in FEATURES}
		if frappe.db.table_exists("URY Feature Flag"):
			for row in frappe.get_all(
				"URY Feature Flag",
				filters={"parenttype": "URY Feature Settings"},
				fields=["feature", "enabled"],
			):
				if row.feature in state:
					state[row.feature] = bool(row.enabled)
		frappe.cache.set_value(CACHE_KEY, state)
	return state


def is_enabled(key):
	return enabled_map().get(key, True)


def clear_cache():
	frappe.cache.delete_value(CACHE_KEY)


def feature_for_method(method):
	"""The disabled feature that owns this whitelisted method, if any."""
	if not method or not method.startswith("ury."):
		return None
	state = enabled_map()
	for f in FEATURES:
		if state.get(f["key"], True):
			continue
		if any(method == soft or method.startswith(soft + ".") for soft in f.get("api_soft", ())):
			continue
		if any(method == p or method.startswith(p + ".") for p in f.get("api", ())):
			return f
	return None


def feature_for_page(first_segment):
	"""The disabled feature that owns this website page, if any."""
	if not first_segment:
		return None
	state = enabled_map()
	for f in FEATURES:
		if not state.get(f["key"], True) and first_segment in f.get("www", ()):
			return f
	return None


def public_state():
	"""What the frontends need: which features are on, and which routes they hide."""
	state = enabled_map()
	return {
		"features": state,
		"hidden_routes": sorted({r for f in FEATURES if not state.get(f["key"], True) for r in f.get("nav", ())}),
		"pos_off": sorted({p for f in FEATURES if not state.get(f["key"], True) for p in f.get("pos", ())}),
	}


def describe():
	"""Features with their translated labels, for the control center."""
	state = enabled_map()
	return [
		{
			"key": f["key"],
			"group": f["group"],
			"icon": f["icon"],
			"label": _(f["label"]),
			"description": _(f["description"]),
			"enabled": state.get(f["key"], True),
			"pages": list(f.get("www", ())),
			"routes": list(f.get("nav", ())),
		}
		for f in FEATURES
	]
