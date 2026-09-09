import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_item_execution_service import (
	IN_PREPARATION,
	ITEM_EXECUTION_DOCTYPE,
	KOT_EXECUTION_DOCTYPE,
	QUEUED,
	READY,
	SERVED,
	get_kot_execution_state,
	mark_item_ready,
	seed_kot_item_executions,
	serve_item_execution,
	start_item_execution,
)

MODULE = "ury.ury.api.ury_kot_item_execution_service"


class TestKotItemExecutionAuthorization(FrappeTestCase):
	def test_doctype_denies_direct_create_and_write(self):
		metadata = json.loads(
			(Path(__file__).parents[1] / "doctype" / "ury_kot_item_execution" / "ury_kot_item_execution.json").read_text()
		)
		for permission in metadata["permissions"]:
			self.assertFalse(permission.get("create", 0), permission["role"])
			self.assertFalse(permission.get("write", 0), permission["role"])

	def test_transition_is_service_owned_and_uses_permission_bypass(self):
		harness = _ExecutionHarness()
		with patch(f"{MODULE}.frappe.db.exists", side_effect=harness.exists), patch(
			f"{MODULE}.frappe.get_doc", side_effect=harness.get_doc
		), patch(f"{MODULE}.frappe.get_all", side_effect=harness.get_all), patch(
			f"{MODULE}.frappe.db.sql", side_effect=harness.sql
		), patch(f"{MODULE}.frappe.db.get_value", return_value=frappe._dict({"branch": "BR-1", "production": "PU-1"})), patch(
			f"{MODULE}.frappe.get_roles", return_value=["Chef"]
		), patch(f"ury.ury.api.ury_kot_execution_service._require_kot_branch_scope"), patch(
			f"{MODULE}.frappe.session"
		) as session:
			session.user = "chef@example.com"
			seed_kot_item_executions("URY KOT-1")
			start_item_execution("KOTITEM-1", "start-auth-1")
		doc = harness.docs[ITEM_EXECUTION_DOCTYPE]["ROW-1"]
		doc.save.assert_called_once_with(ignore_permissions=True)
		self.assertEqual(doc.state, IN_PREPARATION)
		self.assertTrue(doc.insert.called)
		self.assertTrue(doc.insert.call_args.kwargs.get("ignore_permissions"))


def _exists(doctype, name=None):
	if doctype == "DocType":
		return True
	if doctype in {"URY KOT", "URY KOT Items"}:
		return True
	return False


def _kot_doc(*args, **kwargs):
	arg = args[1] if len(args) > 1 else kwargs.get("name") or kwargs.get("arg1")
	if arg == "URY KOT-1":
		items = [frappe._dict({"name": "KOTITEM-1"}), frappe._dict({"name": "KOTITEM-2"})]
		doc = frappe._dict({"kot_items": items})
		doc.get = lambda key, default=None, _doc=doc: _doc[key] if key in _doc else default
		return doc
	raise AssertionError("unexpected get_doc lookup")


class _ExecutionHarness:
	def __init__(self):
		self.created = []
		self.docs = {}
		self.sequence = {
			ITEM_EXECUTION_DOCTYPE: 0,
			KOT_EXECUTION_DOCTYPE: 0,
		}

	def exists(self, doctype, name=None):
		if doctype == ITEM_EXECUTION_DOCTYPE and isinstance(name, dict):
			return bool(self._select(doctype, filters=name, limit=1))
		return _exists(doctype, name)

	def get_doc(self, *args, **kwargs):
		arg = args[0] if args else kwargs.get("arg1")
		if isinstance(arg, dict):
			doc = self._document(arg)
			self.created.append(doc)
			return doc
		if arg in {ITEM_EXECUTION_DOCTYPE, KOT_EXECUTION_DOCTYPE}:
			name = args[1] if len(args) > 1 else kwargs.get("name")
			return self.docs[arg][name]
		if arg == "URY KOT":
			return _kot_doc(*args, **kwargs)
		if arg == "System Settings":
			return frappe._dict({"time_zone": "UTC"})
		if arg == "User":
			return frappe._dict({"user_type": "System User"})
		raise AssertionError(f"unexpected get_doc lookup: {arg!r}")

	def get_all(self, doctype, filters=None, fields=None, order_by=None, limit=None):
		if doctype not in {ITEM_EXECUTION_DOCTYPE, KOT_EXECUTION_DOCTYPE}:
			return []
		return self._select(doctype, filters=filters, fields=fields, limit=limit)

	def sql(self, query, values=None, as_dict=False, pluck=None, **kwargs):
		if not values:
			return []
		if "kot_item" in values:
			rows = self._select(ITEM_EXECUTION_DOCTYPE, filters={"kot_item": values["kot_item"]}, limit=1)
			if pluck:
				return [row.get(pluck) for row in rows]
			return rows
		if "kot" in values:
			# _lock_sibling_item_execution_rows: locking read of every sibling
			# item-execution row for this KOT.
			rows = self._select(ITEM_EXECUTION_DOCTYPE, filters={"kot": values["kot"]})
			if pluck:
				return [row.get(pluck) for row in rows]
			return rows
		return []

	def _select(self, doctype, filters=None, fields=None, limit=None):
		rows = []
		for doc in self.docs.get(doctype, {}).values():
			if self._matches(doc, filters or {}):
				rows.append(doc)
		selected = rows[:limit] if limit else rows
		if fields:
			return [frappe._dict({field: row.get(field) for field in fields}) for row in selected]
		return [frappe._dict(dict(row)) for row in selected]

	def _matches(self, doc, filters):
		for field, expected in filters.items():
			if doc.get(field) != expected:
				return False
		return True

	def _document(self, data):
		doc = frappe._dict(dict(data))
		doctype = doc["doctype"]
		if not doc.get("name"):
			self.sequence[doctype] += 1
			prefix = "ROW" if doctype == ITEM_EXECUTION_DOCTYPE else "KOTEXEC"
			doc.name = f"{prefix}-{self.sequence[doctype]}"
		doc.set = lambda field, value, _doc=doc: _doc.__setitem__(field, value)
		doc.as_dict = lambda _doc=doc: dict(_doc)

		def _insert(ignore_permissions=False, _doc=doc):
			self.docs.setdefault(doctype, {})[_doc.name] = _doc
			return _doc

		def _save(ignore_permissions=False, _doc=doc):
			self.docs.setdefault(doctype, {})[_doc.name] = _doc
			return _doc

		doc.insert = MagicMock(side_effect=_insert)
		doc.save = MagicMock(side_effect=_save)
		return doc


class TestKotItemExecution(FrappeTestCase):
	def setUp(self):
		patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		patcher.start()
		self.addCleanup(patcher.stop)

	def test_seed_creates_one_row_per_kot_item_and_is_idempotent(self):
		harness = _ExecutionHarness()
		with patch(f"{MODULE}.frappe.db.exists", side_effect=harness.exists), patch(
			f"{MODULE}.frappe.get_doc", side_effect=harness.get_doc
		), patch(f"{MODULE}.frappe.get_all", side_effect=harness.get_all), patch(
			f"{MODULE}.frappe.db.sql", side_effect=harness.sql
		), patch(
			f"{MODULE}.frappe.db.get_value", return_value=frappe._dict({"branch": "BR-1", "production": "PU-1"})
		), patch(f"{MODULE}.frappe.session") as session:
			session.user = "chef@example.com"
			rows = seed_kot_item_executions("URY KOT-1")
			rows_again = seed_kot_item_executions("URY KOT-1")
		self.assertEqual(len(rows), 2)
		self.assertEqual(rows_again, [])
		self.assertEqual(len(harness.docs[ITEM_EXECUTION_DOCTYPE]), 2)
		self.assertEqual(len(harness.docs[KOT_EXECUTION_DOCTYPE]), 1)
		self.assertEqual(harness.created[0]["state"], QUEUED)

	def test_item_transitions_update_aggregate_state(self):
		harness = _ExecutionHarness()
		with patch(f"{MODULE}.frappe.db.exists", side_effect=harness.exists), patch(
			f"{MODULE}.frappe.get_doc", side_effect=harness.get_doc
		), patch(f"{MODULE}.frappe.get_all", side_effect=harness.get_all), patch(
			f"{MODULE}.frappe.db.sql", side_effect=harness.sql
		), patch(f"{MODULE}.frappe.db.get_value", return_value=frappe._dict({"branch": "BR-1", "production": "PU-1"})), patch(
			f"{MODULE}._attach_ready_posting_intent", side_effect=lambda result, actor: result
		) as mock_ready_posting, patch(
			f"{MODULE}.frappe.get_roles", return_value=["Chef"]
		), patch(
			"ury.ury.api.ury_kot_execution_service._require_kot_branch_scope"
		), patch(
			f"{MODULE}.frappe.session"
		) as session:
			session.user = "chef@example.com"
			seed_kot_item_executions("URY KOT-1")
			start_item_execution("KOTITEM-1", idempotency_key="start-1")
			mark_item_ready("KOTITEM-1", idempotency_key="ready-1")
			serve_item_execution("KOTITEM-1", idempotency_key="serve-1")
			self.assertEqual(get_kot_execution_state("URY KOT-1"), READY)
		mock_ready_posting.assert_called_once()
		self.assertEqual(harness.docs[KOT_EXECUTION_DOCTYPE]["KOTEXEC-1"]["state"], READY)
		self.assertEqual(json.loads(harness.created[0]["audit_log"])[0]["event"], "seed")
