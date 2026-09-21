# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import hashlib
import hmac

import frappe
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, now_datetime

# One-time enrollment code lifetime and lengths. The code is high entropy and
# single use; it is only the bootstrap that lets a device exchange it for a
# long-lived device credential, so a short window is deliberate.
ENROLLMENT_CODE_TTL_MINUTES = 10
ENROLLMENT_CODE_LENGTH = 24
CREDENTIAL_LENGTH = 40


def hash_secret(raw: str) -> str:
	return hashlib.sha256((raw or "").encode()).hexdigest()


class URYPOSTerminal(Document):
	def issue_enrollment_code(self) -> str:
		"""Mint a fresh single-use enrollment code, storing only its hash and
		expiry. Any previously issued (unused) code is invalidated."""
		raw_code = frappe.generate_hash(length=ENROLLMENT_CODE_LENGTH)
		self.db_set(
			{
				"enrollment_code_hash": hash_secret(raw_code),
				"enrollment_code_expiry": add_to_date(
					now_datetime(), minutes=ENROLLMENT_CODE_TTL_MINUTES
				),
			},
			update_modified=False,
		)
		return raw_code

	def verify_enrollment_code(self, code: str) -> bool:
		if not code or not self.enrollment_code_hash or not self.enrollment_code_expiry:
			return False
		if get_datetime(self.enrollment_code_expiry) < now_datetime():
			return False
		return hmac.compare_digest(self.enrollment_code_hash, hash_secret(code))

	def issue_credential(self) -> str:
		"""Exchange a verified enrollment code for a long-lived device
		credential. Returns the raw value once; only its hash is stored, and the
		enrollment code is consumed so it cannot be replayed."""
		raw_credential = frappe.generate_hash(length=CREDENTIAL_LENGTH)
		self.db_set(
			{
				"credential_hash": hash_secret(raw_credential),
				"enrollment_code_hash": None,
				"enrollment_code_expiry": None,
				"last_enrolled_at": now_datetime(),
			},
			update_modified=False,
		)
		return raw_credential

	def verify_credential(self, raw_credential: str) -> bool:
		if not raw_credential or not self.credential_hash:
			return False
		return hmac.compare_digest(self.credential_hash, hash_secret(raw_credential))

	def touch_last_seen(self) -> None:
		self.db_set("last_seen", now_datetime(), update_modified=False)
