"""Pre-authorised PWA link for the Chairman Brief (WP5).

mint_link() is server-side only (NOT whitelisted). The token is 32 random bytes;
only its sha256 is stored in redis (TTL 10 min, single use via atomic GETDEL).
exchange() is the one guest endpoint: POST only, rate limited, creates a normal
session flagged ury_scope="brief". guard_brief_only_session() is the
before_request hook that confines such a session to the Brief PWA.

Pure helpers take a redis-like `cache` so they are testable with a fake.
"""

import hashlib
import hmac
import json
import posixpath
import secrets
import time
from urllib.parse import unquote

LINK_TTL_SECONDS = 600
SCOPE_KEY = "ury_scope"
SCOPE_BRIEF = "brief"
SESSION_END = "08:00:00"  # scoped sessions last 8 h
RATE_PER_IP = 10  # exchanges per minute per IP
RATE_GLOBAL = 120  # exchanges per minute, all IPs
RATE_WINDOW = 60
REDIRECT = "/ury/brief/"
KEY_PREFIX = "ury:brief_link:"
FORBIDDEN_USERS = ("Administrator", "Guest")
CHAIRMAN_ROLE = "URY Chairman"

ALLOWED_PREFIXES = ("/ury/brief/", "/assets/")
ALLOWED_EXACT = ("/ury/brief", "/api/method/logout")
ALLOWED_METHOD_PREFIXES = (
	"/api/method/ury.ury.api.chairman.",
	"/api/method/ury.ury.api.chairman_chat.",
)


# ---------------------------------------------------------------- pure helpers
def new_token():
	return secrets.token_urlsafe(32)  # 32 random bytes


def hash_token(token):
	return hashlib.sha256(str(token or "").encode()).hexdigest()


def redis_key(token_hash):
	return KEY_PREFIX + token_hash


def store_token(cache, token, user, purpose, now=None, ttl=LINK_TTL_SECONDS):
	th = hash_token(token)
	rec = {"user": user, "purpose": purpose, "iat": int(now or time.time()), "h": th}
	cache.set(redis_key(th), json.dumps(rec), ex=ttl)
	return th


def consume_token(cache, token):
	"""Atomically fetch and delete. Returns the record dict or None. Constant-time check of the hash."""
	if not token or not isinstance(token, str) or len(token) > 128:
		return None
	th = hash_token(token)
	raw = cache.getdel(redis_key(th))
	if not raw:
		return None
	try:
		rec = json.loads(raw if isinstance(raw, str) else raw.decode())
	except Exception:
		return None
	if not hmac.compare_digest(str(rec.get("h", "")), th):
		return None
	return rec


def rate_hit(cache, bucket, limit, now=None, window=RATE_WINDOW):
	"""Fixed-window counter. Returns True when the call is still within limit."""
	win = int((now if now is not None else time.time()) // window)
	key = f"ury:brief_link_rl:{bucket}:{win}"
	n = cache.incr(key)
	if n == 1:
		cache.expire(key, window + 5)
	return n <= limit


def check_rate(cache, ip, now=None):
	ok_ip = rate_hit(cache, f"ip:{ip or 'unknown'}", RATE_PER_IP, now)
	ok_all = rate_hit(cache, "all", RATE_GLOBAL, now)
	return ok_ip and ok_all


def exchange_refusal(user, enabled, roles):
	"""Reason string if this user may not get a brief_only session, else None."""
	if not user or user in FORBIDDEN_USERS:
		return "forbidden_user"
	if not enabled:
		return "disabled"
	if CHAIRMAN_ROLE not in (roles or ()):
		return "no_role"
	return None


def is_path_allowed(path):
	"""Allow-list for a brief_only session. Default deny."""
	p = unquote(path or "")
	if "\\" in p or "\x00" in p:
		return False
	norm = posixpath.normpath(p)
	if not norm.startswith("/") or norm.startswith("//"):
		return False
	if ".." in p.split("/"):
		return False
	if norm in ALLOWED_EXACT:
		return True
	if p.endswith("/") and norm + "/" in ALLOWED_PREFIXES:
		return True
	if any(norm.startswith(x) for x in ALLOWED_PREFIXES):
		return True
	return any(norm.startswith(x) and len(norm) > len(x) for x in ALLOWED_METHOD_PREFIXES)


# ------------------------------------------------------------ frappe-bound
def mint_link(user, purpose="brief"):
	"""Server-side only. Returns the plaintext token (to put in a URL). Never whitelist."""
	import frappe

	from ury.ury.api import chairman_wa_identity as ident

	enabled, roles = ident.user_facts(user)
	if exchange_refusal(user, enabled, roles):
		frappe.throw("User not allowed", frappe.PermissionError)
	token = new_token()
	store_token(frappe.cache, token, user, purpose)
	return token


def _no_store_headers():
	import frappe

	h = frappe.local.response_headers
	h.set("Cache-Control", "no-store, max-age=0")
	h.set("Pragma", "no-cache")
	h.set("Referrer-Policy", "no-referrer")


def exchange(token=None):
	"""Trade a single-use token for a brief_only session. POST only; guests allowed."""
	import frappe

	from ury.ury.api import chairman_wa_identity as ident

	_no_store_headers()
	req = getattr(frappe.local, "request", None)
	if req is None or req.method != "POST":
		frappe.throw("POST required", frappe.PermissionError)
	if not check_rate(frappe.cache, getattr(frappe.local, "request_ip", None)):
		frappe.local.response["http_status_code"] = 429
		frappe.throw("Too many attempts", getattr(frappe, "TooManyRequestsError", frappe.ValidationError))
	token = token or frappe.form_dict.get("token")
	rec = consume_token(frappe.cache, token)
	user = rec and rec.get("user")
	enabled, roles = ident.user_facts(user) if user else (None, [])
	if not rec or exchange_refusal(user, enabled, roles):
		# one generic answer for unknown, used, expired and refused tokens
		frappe.local.response["http_status_code"] = 403
		frappe.throw("This link is invalid or has expired.", frappe.PermissionError)
	lm = frappe.local.login_manager
	lm.login_as(user, session_end=SESSION_END)
	sess = frappe.local.session_obj
	sess.data.data[SCOPE_KEY] = SCOPE_BRIEF
	sess.update(force=True)
	frappe.db.commit()
	return {"redirect": REDIRECT}


def guard_brief_only_session(*args, **kwargs):
	"""before_request hook: confine a brief_only session to the Brief PWA (403 elsewhere)."""
	import frappe

	sess = getattr(frappe.local, "session", None)
	if not sess or sess.get("user") in (None, "Guest"):
		return
	data = sess.get("data") or {}
	if data.get(SCOPE_KEY) != SCOPE_BRIEF:
		return
	request = getattr(frappe.local, "request", None)
	if request is None or is_path_allowed(request.path):
		return
	raise frappe.PermissionError("This session is limited to the Chairman Brief.")


try:  # frappe is absent in the pure unit-test environment
	import frappe as _frappe

	exchange = _frappe.whitelist(allow_guest=True, methods=["POST"])(exchange)
except ImportError:
	pass
