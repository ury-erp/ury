"""Meta (WhatsApp Cloud API) webhook signature guard for frappe_whatsapp.

frappe_whatsapp's webhook has no X-Hub-Signature-256 check. guard_whatsapp_webhook
is a before_request hook that closes that gap for the webhook path only.
The app secret is read from site config key `ury_whatsapp_app_secret`.
"""

import hashlib
import hmac

WEBHOOK_PATHS = frozenset(
	{
		"/api/method/frappe_whatsapp.utils.webhook.webhook",
		"/api/method/frappe_whatsapp.utils.webhook.webhook/",
	}
)
SECRET_CONFIG_KEY = "ury_whatsapp_app_secret"
_PREFIX = "sha256="


def verify_signature(raw_body: bytes, header: str | None, app_secret: str) -> bool:
	"""Pure check of `sha256=<hexdigest of HMAC-SHA256(app_secret, raw_body)>`."""
	if not app_secret or not header or not isinstance(header, str):
		return False
	if not header.startswith(_PREFIX):
		return False
	given = header[len(_PREFIX) :].strip().lower()
	if len(given) != 64:
		return False
	try:
		int(given, 16)
	except ValueError:
		return False
	if isinstance(raw_body, str):
		raw_body = raw_body.encode("utf-8")
	expected = hmac.new(app_secret.encode("utf-8"), raw_body or b"", hashlib.sha256).hexdigest()
	return hmac.compare_digest(expected.encode("ascii"), given.encode("ascii"))


def guard_whatsapp_webhook(*args, **kwargs):
	"""before_request hook. Raises frappe.PermissionError for bad POSTs to the webhook only."""
	import frappe

	request = getattr(frappe.local, "request", None)
	if request is None or request.path not in WEBHOOK_PATHS:
		return
	if request.method != "POST":
		return  # GET verify-token challenge untouched

	secret = frappe.conf.get(SECRET_CONFIG_KEY) or ""
	raw = request.get_data(cache=True) or b""  # cached so form parsing still works
	header = request.headers.get("X-Hub-Signature-256")
	if not verify_signature(raw, header, secret):
		frappe.throw("Invalid webhook signature", frappe.PermissionError)
