import hashlib
import hmac
import sys
import types
import unittest
from unittest import mock

from ury.ury.api import wa_signature as w

SECRET = "synthetic-secret"


def sign(body: bytes, secret=SECRET):
	return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


class TestVerify(unittest.TestCase):
	def test_valid(self):
		b = b'{"entry":[]}'
		self.assertTrue(w.verify_signature(b, sign(b), SECRET))

	def test_unicode_body(self):
		b = '{"text":"مرحبا café ☕"}'.encode()
		self.assertTrue(w.verify_signature(b, sign(b), SECRET))

	def test_tampered_body(self):
		self.assertFalse(w.verify_signature(b'{"a":2}', sign(b'{"a":1}'), SECRET))

	def test_wrong_secret(self):
		b = b"x"
		self.assertFalse(w.verify_signature(b, sign(b, "other"), SECRET))

	def test_wrong_prefix(self):
		b = b"x"
		self.assertFalse(w.verify_signature(b, sign(b).replace("sha256=", "sha1="), SECRET))
		self.assertFalse(w.verify_signature(b, sign(b)[len("sha256="):], SECRET))

	def test_missing_or_malformed(self):
		for h in (None, "", "sha256=", "sha256=zz", "sha256=abc"):
			self.assertFalse(w.verify_signature(b"x", h, SECRET))

	def test_empty_secret(self):
		b = b"x"
		self.assertFalse(w.verify_signature(b, sign(b, ""), ""))


class _PermErr(Exception):
	pass


def _fake_frappe(path, method, body, header, secret):
	f = types.ModuleType("frappe")
	f.PermissionError = _PermErr
	def throw(msg, exc=Exception):
		raise exc(msg)
	f.throw = throw
	req = mock.Mock(path=path, method=method)
	req.get_data.return_value = body
	req.headers = {"X-Hub-Signature-256": header} if header is not None else {}
	f.local = types.SimpleNamespace(request=req)
	f.conf = {w.SECRET_CONFIG_KEY: secret} if secret is not None else {}
	return f


class TestGuard(unittest.TestCase):
	P = "/api/method/frappe_whatsapp.utils.webhook.webhook"

	def run_guard(self, *a):
		with mock.patch.dict(sys.modules, {"frappe": _fake_frappe(*a)}):
			return w.guard_whatsapp_webhook()

	def test_valid_post_passes(self):
		b = b"{}"
		self.assertIsNone(self.run_guard(self.P, "POST", b, sign(b), SECRET))

	def test_bad_post_403(self):
		with self.assertRaises(_PermErr):
			self.run_guard(self.P, "POST", b"{}", "sha256=" + "0" * 64, SECRET)

	def test_missing_header_403(self):
		with self.assertRaises(_PermErr):
			self.run_guard(self.P, "POST", b"{}", None, SECRET)

	def test_no_secret_configured_403(self):
		with self.assertRaises(_PermErr):
			self.run_guard(self.P, "POST", b"{}", sign(b"{}"), None)

	def test_get_untouched(self):
		self.assertIsNone(self.run_guard(self.P, "GET", b"", None, None))

	def test_other_path_untouched(self):
		self.assertIsNone(self.run_guard("/api/method/ping", "POST", b"{}", None, None))


if __name__ == "__main__":
	unittest.main()
