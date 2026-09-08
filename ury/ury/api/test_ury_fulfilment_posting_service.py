import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_fulfilment_posting_service import (
	FAILED,
	POSTED,
	_authorize_posting,
	create_or_get_posting_intent_for_ready,
	process_posting_intent,
	recover_pending_posting_intents,
)


MODULE = "ury.ury.api.ury_fulfilment_posting_service"


def _doc(data):
	doc = frappe._dict(dict(data))
	doc.get = lambda key, default=None, _doc=doc: _doc[key] if key in _doc else default
	doc.set = lambda key, value, _doc=doc: _doc.__setitem__(key, value)
	doc.as_dict = lambda _doc=doc: dict(_doc)
	doc.insert = MagicMock()
	doc.save = MagicMock()
	doc.submit = MagicMock()
	return doc


def _execution_doc():
	return _doc(
		{
			"name": "EXEC-1",
			"kot": "KOT-1",
			"kot_item": "KOTITEM-1",
			"branch": "Branch A",
			"company": "Company A",
			"production_unit": "PU-1",
			"idempotency_key": "ready-1",
			"state": "READY",
			"ready_at": "2026-09-04 10:00:00",
		}
	)


def _audit_log(component_item, qty, warehouse="Kitchen WH", policy="MADE_TO_ORDER"):
	return json.dumps(
		[
			{
				"event": "create",
				"component_item": component_item,
				"qty": qty,
				"frozen_context": {
					"item_code": "PLATE-1",
					"branch": "Branch A",
					"company": "Company A",
					"warehouse": warehouse,
					"production_policy": policy,
					"production_unit": "PU-FROZEN",
					"department": "Kitchen",
					"production_configuration": "CFG-1",
				},
			}
		],
		sort_keys=True,
	)


def _reservation_rows(policy="MADE_TO_ORDER"):
	return [
		frappe._dict(
			{
				"name": "RES-1",
				"reservation_group": "GROUP-1",
				"policy": "DIRECT_RETAIL",
				"warehouse": "MUTATED WH",
				"top_level_item": "PLATE-1",
				"component_item": "MUTATED-COMP",
				"qty": 999,
				"audit_log": _audit_log("COMP-1", 2, policy=policy),
			}
		),
		frappe._dict(
			{
				"name": "RES-2",
				"reservation_group": "GROUP-1",
				"policy": "DIRECT_RETAIL",
				"warehouse": "MUTATED WH",
				"top_level_item": "PLATE-1",
				"component_item": "MUTATED-COMP",
				"qty": 999,
				"audit_log": _audit_log("COMP-2", 1, policy=policy),
			}
		),
	]


def _get_all_for_create(reservation_rows=None, existing_sequences=None, same_group_sequences=None):
	reservation_rows = reservation_rows if reservation_rows is not None else _reservation_rows()
	existing_sequences = existing_sequences or []
	same_group_sequences = same_group_sequences or []

	def get_all(doctype, *args, **kwargs):
		if doctype == "URY Stock Reservation":
			return reservation_rows
		if doctype == "URY Fulfilment Posting Intent":
			if (kwargs.get("filters") or {}).get("reservation_ref"):
				return same_group_sequences
			return existing_sequences
		raise AssertionError(doctype)

	return get_all


class TestCreatePostingIntent(FrappeTestCase):
	def setUp(self):
		patcher = patch(f"{MODULE}.now", return_value="2026-09-04 10:00:00")
		patcher.start()
		self.addCleanup(patcher.stop)
		self.addCleanup(patch.stopall)
		patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]).start()
		patch(f"{MODULE}.frappe.has_permission", return_value=True).start()

	def test_end_users_can_read_and_report_but_cannot_directly_mutate_intents(self):
		metadata = json.loads(
			(Path(__file__).parents[1] / "doctype" / "ury_fulfilment_posting_intent" / "ury_fulfilment_posting_intent.json").read_text()
		)
		permissions = {row["role"]: row for row in metadata["permissions"]}
		for role in ("Stock Manager", "Production Manager", "Chef", "URY Captain"):
			self.assertEqual(permissions[role].get("read"), 1)
			self.assertEqual(permissions[role].get("report"), 1)
			self.assertNotIn("create", permissions[role])
			self.assertNotIn("write", permissions[role])

	def test_posting_service_rejects_actor_without_operational_role(self):
		with patch(f"{MODULE}.frappe.get_roles", return_value=[]):
			with self.assertRaises(frappe.PermissionError):
				_authorize_posting("customer@example.com", _execution_doc())

	def test_ready_creates_one_intent_with_frozen_payload(self):
		created = []

		def get_doc(arg, *args, **kwargs):
			if arg == "URY KOT Items":
				return _doc({"item": "PLATE-1", "quantity": 1})
			if isinstance(arg, dict):
				doc = _doc(arg)
				doc.name = "INTENT-1"
				created.append(doc)
				return doc
			raise AssertionError(arg)

		def get_value(doctype, *args, **kwargs):
			if doctype == "URY KOT":
				return "POS-INV-1"
			if doctype == "URY Fulfilment Posting Intent":
				return None
			raise AssertionError(doctype)

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.db.get_value", side_effect=get_value), patch(
			f"{MODULE}.frappe.get_all", side_effect=_get_all_for_create()
		), patch(f"{MODULE}.frappe.session") as session:
			session.user = "chef@example.com"
			result = create_or_get_posting_intent_for_ready(_execution_doc(), actor="chef@example.com")

		self.assertEqual(result["name"], "INTENT-1")
		self.assertFalse(result["idempotent_replay"])
		self.assertEqual(created[0]["production_policy"], "MADE_TO_ORDER")
		self.assertEqual(created[0]["reservation_ref"], "GROUP-1")
		self.assertEqual(created[0]["production_unit"], "PU-FROZEN")
		payload = json.loads(created[0]["frozen_payload_json"])
		self.assertEqual(payload["components"][0]["item_code"], "COMP-1")
		self.assertEqual(payload["components"][0]["s_warehouse"], "Kitchen WH")
		self.assertEqual(payload["components"][1]["qty"], 1)
		self.assertEqual(payload["production_configuration"], "CFG-1")
		created[0].insert.assert_called_once_with(ignore_permissions=False)

	def test_ready_uses_next_sequence_for_new_reservation_group(self):
		created = []

		def get_doc(arg, *args, **kwargs):
			if arg == "URY KOT Items":
				return _doc({"item": "PLATE-1", "quantity": 1})
			if isinstance(arg, dict):
				doc = _doc(arg)
				doc.name = "INTENT-2"
				created.append(doc)
				return doc
			raise AssertionError(arg)

		def get_value(doctype, *args, **kwargs):
			if doctype == "URY KOT":
				return "POS-INV-1"
			if doctype == "URY Fulfilment Posting Intent":
				return None
			raise AssertionError(doctype)

		existing_sequences = [frappe._dict({"fulfilment_sequence": 1})]
		with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.db.get_value", side_effect=get_value), patch(
			f"{MODULE}.frappe.get_all", side_effect=_get_all_for_create(existing_sequences=existing_sequences)
		), patch(f"{MODULE}.frappe.session") as session:
			session.user = "chef@example.com"
			result = create_or_get_posting_intent_for_ready(_execution_doc(), actor="chef@example.com")

		self.assertEqual(result["idempotency_key"], "Branch A:KOT-1:KOTITEM-1:ready-1:2")
		self.assertEqual(created[0]["fulfilment_sequence"], 2)

	def test_ready_reuses_sequence_for_same_reservation_group_replay(self):
		created = []

		def get_doc(arg, *args, **kwargs):
			if arg == "URY KOT Items":
				return _doc({"item": "PLATE-1", "quantity": 1})
			if isinstance(arg, dict):
				doc = _doc(arg)
				doc.name = "INTENT-1"
				created.append(doc)
				return doc
			raise AssertionError(arg)

		def get_value(doctype, *args, **kwargs):
			if doctype == "URY KOT":
				return "POS-INV-1"
			if doctype == "URY Fulfilment Posting Intent":
				return None
			raise AssertionError(doctype)

		same_group_sequences = [frappe._dict({"fulfilment_sequence": 1})]
		with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.db.get_value", side_effect=get_value), patch(
			f"{MODULE}.frappe.get_all", side_effect=_get_all_for_create(same_group_sequences=same_group_sequences)
		), patch(f"{MODULE}.frappe.session") as session:
			session.user = "chef@example.com"
			result = create_or_get_posting_intent_for_ready(_execution_doc(), actor="chef@example.com")

		self.assertEqual(result["idempotency_key"], "Branch A:KOT-1:KOTITEM-1:ready-1:1")
		self.assertEqual(created[0]["fulfilment_sequence"], 1)

	def test_ready_replay_returns_existing_intent(self):
		existing = _doc({"name": "INTENT-1", "status": "PENDING", "idempotency_key": "Branch A:KOT-1:KOTITEM-1:ready-1:1"})

		def get_doc(arg, *args, **kwargs):
			if arg == "URY KOT Items":
				return _doc({"item": "PLATE-1", "quantity": 1})
			if arg == "URY Fulfilment Posting Intent":
				return existing
			raise AssertionError(arg)

		def get_value(doctype, *args, **kwargs):
			if doctype == "URY KOT":
				return "POS-INV-1"
			if doctype == "URY Fulfilment Posting Intent":
				return "INTENT-1"
			raise AssertionError(doctype)

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.db.get_value", side_effect=get_value), patch(
			f"{MODULE}.frappe.get_all", side_effect=_get_all_for_create(existing_sequences=[frappe._dict({"fulfilment_sequence": 1})])
		), patch(f"{MODULE}.frappe.session") as session:
			session.user = "chef@example.com"
			result = create_or_get_posting_intent_for_ready(_execution_doc(), actor="chef@example.com")

		self.assertTrue(result["idempotent_replay"])
		self.assertEqual(result["name"], "INTENT-1")


class TestProcessPostingIntent(FrappeTestCase):
	def _intent(self):
		payload = {
			"idempotency_key": "KEY-1",
			"kot": "KOT-1",
			"kot_item": "KOTITEM-1",
			"order_ref": "POS-INV-1",
			"item_code": "PLATE-1",
			"accepted_qty": 1,
			"execution_state": "READY",
			"branch": "Branch A",
			"company": "Company A",
			"production_policy": "MADE_TO_ORDER",
			"reservation_group": "GROUP-1",
			"components": [{"item_code": "COMP-1", "qty": 2, "s_warehouse": "Kitchen WH"}],
			"actor": "chef@example.com",
		}
		from ury.ury.api.ury_fulfilment_posting_service import _hash_payload, _json_dumps

		return _doc(
			{
				"name": "INTENT-1",
				"status": "PENDING",
				"attempts": 0,
				"idempotency_key": "KEY-1",
				"frozen_payload_json": _json_dumps(payload),
				"frozen_payload_hash": _hash_payload(payload),
			}
		)

	def test_worker_submits_stock_then_fulfils_reservation_and_marks_posted(self):
		intent = self._intent()
		stock_entry = _doc({"name": "STE-1"})
		fulfilment = _doc({"name": "FUL-1"})
		docs_by_name = {"INTENT-1": intent}

		def get_doc(arg, name=None, *args, **kwargs):
			if arg == "URY Fulfilment Posting Intent":
				return docs_by_name[name]
			if arg == "URY Fulfilment Record":
				return fulfilment
			if isinstance(arg, dict) and arg.get("doctype") == "Stock Entry":
				return stock_entry
			if isinstance(arg, dict) and arg.get("doctype") == "URY Fulfilment Record":
				return fulfilment
			raise AssertionError(arg)

		with patch(f"{MODULE}.frappe.db.sql", return_value=[frappe._dict({"name": "INTENT-1", "status": "PENDING", "attempts": 0})]), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.get_all", side_effect=lambda doctype, **kwargs: []), patch(
			f"{MODULE}.frappe.db.get_value", return_value=None
		), patch(f"{MODULE}.fulfil_reservation") as fulfil, patch(
			f"{MODULE}.now", return_value="2026-09-04 10:00:00"
		), patch(f"{MODULE}.now_datetime", return_value=frappe.utils.get_datetime("2026-09-04 10:00:00")), patch(
			f"{MODULE}.frappe.session"
		) as session:
			session.user = "chef@example.com"
			result = process_posting_intent("INTENT-1")

		self.assertEqual(result["status"], POSTED)
		stock_entry.insert.assert_called_once_with(ignore_permissions=False)
		stock_entry.submit.assert_called_once()
		fulfil.assert_called_once_with("GROUP-1")
		self.assertEqual(intent.erpnext_stock_entry, "STE-1")
		self.assertEqual(intent.fulfilment_record, "FUL-1")
		self.assertEqual(intent.status, POSTED)
		self.assertGreaterEqual(intent.save.call_count, 2)

	def test_replay_after_reservation_fulfilled_does_not_fulfil_again(self):
		intent = self._intent()
		intent.erpnext_stock_entry = "STE-1"
		stock_entry = _doc({"name": "STE-1"})
		fulfilment = _doc({"name": "FUL-1", "posting_reference": "STE-1"})

		def get_doc(arg, name=None, *args, **kwargs):
			if arg == "URY Fulfilment Posting Intent":
				return intent
			if arg == "URY Fulfilment Record":
				return fulfilment
			if isinstance(arg, dict) and arg.get("doctype") == "URY Fulfilment Record":
				return fulfilment
			raise AssertionError(arg)

		with patch(f"{MODULE}.frappe.db.sql", return_value=[frappe._dict({"name": "INTENT-1", "status": "PENDING", "attempts": 0})]), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.get_all", return_value=[frappe._dict({"status": "Fulfilled"})]), patch(
			f"{MODULE}.frappe.db.get_value", return_value="FUL-1"
		), patch(f"{MODULE}.fulfil_reservation") as fulfil, patch(
			f"{MODULE}.now", return_value="2026-09-04 10:00:00"
		), patch(f"{MODULE}.now_datetime", return_value=frappe.utils.get_datetime("2026-09-04 10:00:00")), patch(
			f"{MODULE}.frappe.session"
		) as session:
			session.user = "chef@example.com"
			result = process_posting_intent("INTENT-1")

		self.assertEqual(result["status"], POSTED)
		fulfil.assert_not_called()

	def test_ready_or_served_is_required(self):
		execution = _execution_doc()
		execution.state = "QUEUED"
		with self.assertRaisesRegex(Exception, "requires READY or SERVED"):
			create_or_get_posting_intent_for_ready(execution, actor="chef@example.com")

	def test_stock_failure_marks_failed_and_does_not_fulfil_reservation(self):
		intent = self._intent()
		stock_entry = _doc({"name": "STE-1"})
		stock_entry.submit.side_effect = frappe.ValidationError("stock failed")
		docs_by_name = {"INTENT-1": intent}

		def get_doc(arg, name=None, *args, **kwargs):
			if arg == "URY Fulfilment Posting Intent":
				return docs_by_name[name]
			if isinstance(arg, dict) and arg.get("doctype") == "Stock Entry":
				return stock_entry
			raise AssertionError(arg)

		with patch(f"{MODULE}.frappe.db.sql", return_value=[frappe._dict({"name": "INTENT-1", "status": "PENDING", "attempts": 0})]), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}.frappe.get_all", return_value=[]), patch(
			f"{MODULE}.fulfil_reservation"
		) as fulfil, patch(f"{MODULE}.now", return_value="2026-09-04 10:00:00"), patch(
			f"{MODULE}.now_datetime", return_value=frappe.utils.get_datetime("2026-09-04 10:00:00")
		), patch(f"{MODULE}.frappe.session") as session:
			session.user = "chef@example.com"
			result = process_posting_intent("INTENT-1")

		self.assertEqual(result["status"], FAILED)
		fulfil.assert_not_called()
		self.assertEqual(intent.status, FAILED)
		self.assertEqual(intent.failure_class, "ValidationError")
		self.assertTrue(intent.retryable)

	def test_recovery_reenqueues_only_due_or_stale_intents(self):
		rows = [
			frappe._dict({"name": "PENDING-1", "status": "PENDING", "leased_until": None, "next_retry_at": None}),
			frappe._dict({"name": "POSTING-FRESH", "status": "POSTING", "leased_until": "2026-09-04 10:09:00", "next_retry_at": None}),
			frappe._dict({"name": "FAILED-DUE", "status": "FAILED", "leased_until": None, "next_retry_at": "2026-09-04 09:59:00"}),
		]

		with patch(f"{MODULE}.frappe.get_all", return_value=rows), patch(
			f"{MODULE}.now_datetime", return_value=frappe.utils.get_datetime("2026-09-04 10:00:00")
		), patch(f"{MODULE}.enqueue_posting_intent") as enqueue:
			result = recover_pending_posting_intents()

		self.assertEqual(result, ["PENDING-1", "FAILED-DUE"])
		self.assertEqual([call.args[0] for call in enqueue.call_args_list], ["PENDING-1", "FAILED-DUE"])
