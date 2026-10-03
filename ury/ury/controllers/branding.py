"""Smart Choice branding for every page Frappe renders on a Smart Restro site.

Frappe falls back to its own marks wherever a site has not set one: the
browser-tab icon (frappe-favicon.svg), the desk's loading splash and the desk
navbar logo. With several apps installed, the navbar logo is even picked from
the *first* app's hook, which is Frappe itself. Website Settings can also
point at a private file that a signed-out visitor cannot load, and the browser
then shows Frappe's icon or a broken image in its place.

These hooks run after Website Settings and every app's `website_context` have
been applied, so the Smart Choice mark wins on the website, on the sign-in,
password and error pages, and in the desk.
"""

from frappe import _

LOGO = "/assets/ury/Images/smart-restro-logo.png"
ICON = "/assets/ury/Images/smart-choice-icon.png"
FAVICON = "/assets/ury/Images/favicon.ico"


def update_website_context(context):
	"""Icon, splash, header mark and footer credit for every web page, desk included."""
	values = {
		"favicon": ICON,
		"splash_image": LOGO,
		# The website header: a public file, so signed-out visitors see it too.
		"brand_html": f'<img src="{LOGO}" alt="Smart Choice" style="height: 32px; width: auto;">',
		"banner_image": None,
	}
	# Only the stock "Powered by ERPNext" line; a site's own wording stays.
	if not context.get("footer_powered"):
		values["footer_powered"] = _("Powered by {0}").format("Smart Choice")
	return values


def extend_bootinfo(bootinfo):
	"""The logo in the desk navbar."""
	bootinfo.app_logo_url = LOGO
