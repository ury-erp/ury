import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_item_execution_service import (
	IN_PREPARATION,
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


def _exists(doctype, name=None):
	if doctype == "DocType":
		return True
	if doctype in {"URY KOT", "URY KOT Items"}:
		return True
	return False


def _kot_doc(*args, **kwargs):
	arg = args[0] if args else kwargs.get("arg1")
	if arg == "URY KOT-1":
		items = [frappe._dict({"name": "KOTITEM-1"}), frappe._dict({"name": "KOTITEM-2"})]
		doc = frappe._dict({"kot_items": items})
		doc.get = lambda key, default=None, _doc=doc: _doc[key] if key in _doc else default
		return doc
	raise AssertionError("unexpected get_doc lookup")


def _make_doc_recorder():
	created = []

	def _get_doc(*args, **kwargs):
		arg = args[0] if args else kwargs.get("arg1")
		if isinstance(arg, dict):
			doc = frappe._dict(dict(arg))
			doc.insert = MagicMock()
			doc.save = MagicMock()
			doc.set = lambda field, value, _doc=doc: _doc.__setitem__(field, value)
			doc.as_dict = lambda _doc=doc: dict(_doc)
			created.append(doc)
			return doc
		if arg == "URY KOT":
			return _kot_doc(*args, **kwargs)
		raise AssertionError(f"unexpected get_doc lookup: {arg!r}")

	return _get_doc, created


class TestKotItemExecution(FrappeTestCase):
	def setUp(self):
		patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		patcher.start()
		self.addCleanup(patcher.stop)

	def test_seed_creates_one_row_per_kot_item_and_is_idempotent(self):
		get_doc, created = _make_doc_recorder()
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_exists), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.get_all", return_value=[]), patch(
			f"{MODULE}.frappe.db.get_value", return_value=frappe._dict({"branch": "BR-1", "production": "PU-1"})
		), patch(f"{MODULE}.frappe.session") as session:
			session.user = "chef@example.com"
			rows = seed_kot_item_executions("URY KOT-1")
			rows_again = seed_kot_item_executions("URY KOT-1")
		self.assertEqual(len(rows), 2)
		self.assertEqual(len(rows_again), 2)
		self.assertEqual(len(created), 3)
		self.assertEqual(created[0]["state"], QUEUED)

	def test_item_transitions_update_aggregate_state(self):
		get_doc, created = _make_doc_recorder()
		item_rows = [
			frappe._dict({"name": "ROW-1", "kot": "URY KOT-1", "kot_item": "KOTITEM-1", "state": QUEUED, "idempotency_key": "seed-1", "started_by": None, "started_at": None, "ready_by": None, "ready_at": None, "served_by": None, "served_at": None}),
			frappe._dict({"name": "ROW-2", "kot": "URY KOT-1", "kot_item": "KOTITEM-2", "state": QUEUED, "idempotency_key": "seed-2", "started_by": None, "started_at": None, "ready_by": None, "ready_at": None, "served_by": None, "served_at": None}),
		]
		state_calls = {"count": 0}

		def _get_all(doctype, filters=None, fields=None, order_by=None, limit=None):
			if doctype != "URY KOT Item Execution":
				return []
			state_calls["count"] += 1
			if state_calls["count"] == 1:
				return []
			if state_calls["count"] == 2:
				return item_rows
			if state_calls["count"] == 3:
				return [item_rows[0]]
			return [item_rows[0], item_rows[1]]

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_exists), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.get_all", side_effect=_get_all), patch(
			f"{MODULE}.frappe.db.sql", return_value=[item_rows[0]]
		), patch(f"{MODULE}.frappe.db.get_value", return_value=frappe._dict({"branch": "BR-1", "production": "PU-1"})), patch(
			f"{MODULE}._attach_ready_posting_intent", side_effect=lambda result, actor: result
		) as mock_ready_posting, patch(
			f"{MODULE}.frappe.session"
		) as session:
			session.user = "chef@example.com"
			seed_kot_item_executions("URY KOT-1")
			start_item_execution("KOTITEM-1", idempotency_key="start-1")
			mark_item_ready("KOTITEM-1", idempotency_key="ready-1")
			serve_item_execution("KOTITEM-1", idempotency_key="serve-1")
		self.assertEqual(get_kot_execution_state("URY KOT-1"), READY)
		mock_ready_posting.assert_called_once()
		self.assertTrue(created)
		self.assertEqual(json.loads(created[0]["audit_log"])[0]["event"], "seed")
