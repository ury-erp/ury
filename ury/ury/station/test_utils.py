"""Helpers for tests that go through the real WSGI app, so cookies,
sessions, rate limits and request hooks all take part."""

import hashlib
import json
import secrets
from threading import Thread

import frappe
from frappe.utils import get_test_client

TEST_STATION = "TESTSTN1"
DEVICE_TOKEN = "test-device-token"
EMAIL_DOMAIN = "station-test.invalid"


class Browser:
	"""One browser: keeps its cookies between requests."""

	def __init__(self):
		self.client = get_test_client()
		self.site = frappe.local.site

	def _request(self, method, path, **kwargs):
		headers = {"X-Frappe-Site-Name": self.site, **kwargs.pop("headers", {})}
		result = {}

		def run():
			# The app re-initialises frappe.local, so it gets its own thread.
			result["response"] = getattr(self.client, method)(path, headers=headers, **kwargs)

		# Requests see only committed data.
		frappe.db.commit()
		thread = Thread(target=run)
		thread.start()
		thread.join()
		frappe.db.rollback()  # start a fresh snapshot to see what the request wrote
		return result["response"]

	def get(self, path, **kwargs):
		return self._request("get", path, **kwargs)

	def call(self, method, **args):
		response = self._request("post", f"/api/method/{method}", json=args)
		return response.status_code, (response.get_json() or {}).get("message")

	def sign_in(self, pin, station=TEST_STATION, device_token=DEVICE_TOKEN):
		return self.call("ury.ury.station.signin.sign_in", station=station, pin=pin, device_token=device_token)[1]

	def logged_user(self):
		response = self.get("/api/method/frappe.auth.get_logged_user")
		return (response.get_json() or {}).get("message") if response.status_code == 200 else None


def new_pin() -> str:
	"""A 6-digit PIN that no waiter on this site holds, so tests never
	collide with (or reveal) a real waiter's PIN."""
	from ury.ury.station import pin as pin_rules

	while True:
		candidate = f"{secrets.randbelow(10**6):06d}"
		if candidate not in _issued and not pin_rules.find_users(candidate):
			_issued.add(candidate)
			return candidate


_issued: set[str] = set()


def make_station(code=TEST_STATION):
	if frappe.db.exists("URY Station", code):
		frappe.delete_doc("URY Station", code, force=True)
	station = frappe.get_doc({"doctype": "URY Station", "code": code, "enabled": 1}).insert()
	station.db_set("device_token_hash", hashlib.sha256(DEVICE_TOKEN.encode()).hexdigest())
	return station


def make_user(name, roles=("URY Captain",)):
	email = f"{name}@{EMAIL_DOMAIN}"
	delete_user(email)
	for role in roles:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role}).insert()
	return frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": name,
			"send_welcome_email": 0,
			"roles": [{"role": role} for role in roles],
		}
	).insert()


def set_pin(user, pin):
	return frappe.get_doc({"doctype": "URY Waiter PIN", "user": user, "enabled": 1, "new_pin": pin}).insert()


def delete_user(email):
	if frappe.db.exists("URY Waiter PIN", email):
		frappe.delete_doc("URY Waiter PIN", email, force=True)
	frappe.db.delete("URY Station Sign-in Log", {"user": email})
	for child in ("URY User", "POS Profile User"):
		frappe.db.delete(child, {"user": email})
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, force=True)


def run_jobs_inline(test):
	"""Make Frappe run background jobs inline, as `bench run-tests` does.

	Creating and deleting users queues a job each. Under a plain unittest
	runner these would pile up in the queue, which nothing may be draining.
	"""
	previous = frappe.in_test
	frappe.in_test = True
	test.addCleanup(setattr, frappe, "in_test", previous)


def stored_settings():
	"""The site's saved station settings, exactly as stored."""
	return frappe.db.sql(
		"select field, value from `tabSingles` where doctype = 'URY Station Settings'", as_dict=True
	)


def restore_settings(rows):
	frappe.db.delete("Singles", {"doctype": "URY Station Settings"})
	for row in rows:
		frappe.db.sql(
			"insert into `tabSingles` (doctype, field, value) values ('URY Station Settings', %s, %s)",
			(row.field, row.value),
		)
	frappe.clear_document_cache("URY Station Settings", "URY Station Settings")
	frappe.db.commit()


def cleanup():
	for email in frappe.get_all("User", filters={"email": ["like", f"%@{EMAIL_DOMAIN}"]}, pluck="name"):
		delete_user(email)
	frappe.db.delete("URY Station Sign-in Log", {"station": ["like", "TESTSTN%"]})
	for station in frappe.get_all("URY Station", filters={"code": ["like", "TESTSTN%"]}, pluck="name"):
		frappe.cache.delete_value(f"ury_station:wrong_pins:{station}")
		frappe.delete_doc("URY Station", station, force=True)
	# Rate-limit counters from earlier runs must not fail this one.
	for key in frappe.cache.get_keys("rl:ury.ury.station.signin."):
		frappe.cache.delete(key)
	frappe.db.commit()


def as_json(value):
	return json.dumps(value, default=str)
