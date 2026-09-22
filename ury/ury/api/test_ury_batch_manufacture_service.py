from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_batch_manufacture_service import (
	BatchManufactureError,
	_authorize_batch_action,
	_load_and_validate_config,
	_submit_stock_entry,
	receive_batch,
	start_batch,
)


MODULE = "ury.ury.api.ury_batch_manufacture_service"


def _doc(data):
	doc = frappe._dict(dict(data))
	doc.get = lambda key, default=None, _doc=doc: _doc[key] if key in _doc else default
	doc.insert = MagicMock()
	doc.submit = MagicMock()
	doc.name = data.get("name", "SE-1")
	return doc


def _wo_doc(name="WO-1"):
	doc = frappe._dict({"name": name})
	doc.insert = MagicMock()
	doc.submit = MagicMock()
	return doc


class _Row:
	"""Mimics a Frappe child-table row: dict-like item row with attribute
	access, matching what `work_order.make_stock_entry` returns."""

	def __init__(self, **data):
		self.__dict__.update(data)

	def get(self, key, default=None):
		return getattr(self, key, default)


class _GeneratedStockEntryDoc:
	"""Stand-in for what `frappe.get_doc(stock_entry.as_dict())` returns: a
	real, bound (unsaved) Document whose `.items` is the child-table list of
	attribute-accessible rows -- as opposed to the plain dict
	`work_order.make_stock_entry` (`return stock_entry.as_dict()`) actually
	returns, whose `.items` would resolve to `dict.items` (the builtin bound
	method), not a child table."""

	def __init__(self, data):
		self.items = [_Row(**row) for row in data.get("items", [])]
		self.remarks = None
		self.custom_ury_batch_request = None
		self.name = "SE-1"
		self.insert = MagicMock()
		self.submit = MagicMock()


def _config_row(**overrides):
	row = frappe._dict(
		{
			"name": "UIPC-ITEM-1-BR1",
			"active": 1,
			"item": "BIRYANI-1",
			"branch": "Branch A",
			"department": "Kitchen",
			"production_unit": "PU-1",
			"production_policy": "PRE_PRODUCED",
			"sourcing_mode": "IN_HOUSE",
			"direct_retail_warehouse": "FG WH",
			"external_receiving_warehouse": "External WH",
		}
	)
	row.update(overrides)
	return row


def _sql_lock(config_row):
	def _sql(query, values=None, as_dict=False, **kwargs):
		if "tabURY Item Production Configuration" in query:
			return [config_row]
		if "tabStock Entry" in query:
			return []
		return []
	return _sql


class TestAuthorization(FrappeTestCase):
	def test_rejects_actor_without_batch_role(self):
		with patch(f"{MODULE}.frappe.get_roles", return_value=["Waiter"]):
			with self.assertRaises(frappe.PermissionError):
				_authorize_batch_action("waiter@example.com", "UIPC-1")

	def test_allows_actor_with_batch_role_and_read_permission(self):
		with patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		):
			_authorize_batch_action("chef@example.com", "UIPC-1")  # does not raise

	def test_rejects_actor_without_read_permission_on_config(self):
		with patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]), patch(
			f"{MODULE}.frappe.has_permission", return_value=False
		):
			with self.assertRaises(frappe.PermissionError):
				_authorize_batch_action("chef@example.com", "UIPC-1")

	def test_administrator_bypasses_role_check(self):
		with patch(f"{MODULE}.frappe.get_roles") as get_roles:
			_authorize_batch_action("Administrator", "UIPC-1")
			get_roles.assert_not_called()


class TestLoadAndValidateConfig(FrappeTestCase):
	def setUp(self):
		patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]).start()
		patch(f"{MODULE}.frappe.has_permission", return_value=True).start()
		self.addCleanup(patch.stopall)

	def test_rejects_inactive_configuration(self):
		row = _config_row(active=0)
		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)):
			with self.assertRaises(BatchManufactureError) as ctx:
				_load_and_validate_config("UIPC-1", "IN_HOUSE", "chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "CONFIGURATION_INACTIVE")

	def test_rejects_non_pre_produced_policy(self):
		row = _config_row(production_policy="MADE_TO_ORDER")
		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)):
			with self.assertRaises(BatchManufactureError) as ctx:
				_load_and_validate_config("UIPC-1", "IN_HOUSE", "chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "NOT_PRE_PRODUCED")

	def test_rejects_sourcing_mode_mismatch(self):
		row = _config_row(sourcing_mode="EXTERNAL_RECEIPT")
		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)):
			with self.assertRaises(BatchManufactureError) as ctx:
				_load_and_validate_config("UIPC-1", "IN_HOUSE", "chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "SOURCING_MODE_MISMATCH")

	def test_raises_when_configuration_missing(self):
		with patch(f"{MODULE}.frappe.db.sql", return_value=[]):
			with self.assertRaises(BatchManufactureError) as ctx:
				_load_and_validate_config("UIPC-MISSING", "IN_HOUSE", "chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "CONFIGURATION_NOT_FOUND")


class TestSubmitStockEntryIdempotency(FrappeTestCase):
	"""`_submit_stock_entry` (the plain, non-Work-Order path) is still used
	by `receive_batch` (Material Receipt, no BOM, unaffected by this
	migration)."""

	def test_replays_existing_stock_entry_for_same_idempotency_key(self):
		with patch(f"{MODULE}._find_existing_stock_entry", return_value="SE-EXISTING"), patch(
			f"{MODULE}.frappe.get_doc"
		) as get_doc:
			stock_entry, idempotent = _submit_stock_entry(
				company="Company A",
				stock_entry_type="Material Receipt",
				items=[{"item_code": "BIRYANI-1", "qty": 1, "t_warehouse": "External WH"}],
				config_name="UIPC-1",
				idempotency_key="KEY-1",
			)
		self.assertEqual(stock_entry, "SE-EXISTING")
		self.assertTrue(idempotent)
		get_doc.assert_not_called()

	def test_posts_a_new_stock_entry_when_no_existing_match(self):
		captured = {}

		def get_doc(arg):
			captured["doc"] = arg
			return _doc(arg)

		with patch(f"{MODULE}._find_existing_stock_entry", return_value=None), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(f"{MODULE}._service_mutation") as mock_mutation:
			mock_mutation.return_value.__enter__ = MagicMock()
			mock_mutation.return_value.__exit__ = MagicMock(return_value=False)
			stock_entry, idempotent = _submit_stock_entry(
				company="Company A",
				stock_entry_type="Material Receipt",
				items=[{"item_code": "BIRYANI-1", "qty": 5, "t_warehouse": "External WH"}],
				config_name="UIPC-1",
				idempotency_key="KEY-2",
			)

		self.assertFalse(idempotent)
		self.assertEqual(captured["doc"]["stock_entry_type"], "Material Receipt")
		self.assertEqual(captured["doc"]["purpose"], "Material Receipt")
		self.assertEqual(captured["doc"]["custom_ury_batch_request"], "KEY-2")
		self.assertEqual(stock_entry, "SE-1")


class TestStartBatch(FrappeTestCase):
	"""IN_HOUSE path: a real Work Order is created+submitted, and the
	Manufacture Stock Entry is generated via `work_order.make_stock_entry`
	(never hand-built) -- Track-Item N3."""

	def setUp(self):
		patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]).start()
		patch(f"{MODULE}.frappe.has_permission", return_value=True).start()
		self.addCleanup(patch.stopall)

	def test_rejects_zero_or_negative_qty(self):
		with self.assertRaises(BatchManufactureError) as ctx:
			start_batch("UIPC-1", 0, actor="chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "INVALID_QTY")

	def test_start_batch_creates_submitted_work_order_and_linked_stock_entry(self):
		row = _config_row()
		captured = {}

		def get_value(doctype, *args, **kwargs):
			if doctype == "Branch":
				return "Company A"
			if doctype == "URY Production Unit":
				return "Kitchen WH"
			# D13: the finished-goods target warehouse is the department
			# warehouse, not `direct_retail_warehouse` ("FG WH" on this row).
			if doctype == "URY Production Department":
				return "Department WH"
			raise AssertionError((doctype, args, kwargs))

		# What `work_order.make_stock_entry` really returns: a plain dict
		# (`stock_entry.as_dict()`), whose `items` is a list of plain dicts,
		# never a bound Document.
		generated_se_dict = {
			"doctype": "Stock Entry",
			"purpose": "Manufacture",
			"items": [
				{"item_code": "RICE", "qty": 4, "is_finished_item": 0, "s_warehouse": "Some WH", "t_warehouse": None},
				{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1, "s_warehouse": None, "t_warehouse": "Some WH"},
			],
		}

		def get_doc(arg):
			if isinstance(arg, dict) and arg.get("doctype") == "Work Order":
				captured["work_order_payload"] = arg
				return _wo_doc("WO-1")
			# The corrected code path wraps `make_stock_entry`'s raw dict with
			# `frappe.get_doc(...)` before treating it as a Document.
			captured["doc"] = arg
			se_doc = _GeneratedStockEntryDoc(arg)
			captured["se_doc"] = se_doc
			return se_doc

		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=get_value
		), patch(f"{MODULE}._resolve_active_bom", return_value="BOM-BIRYANI-001"), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc
		), patch(
			f"{MODULE}._wo_make_stock_entry", return_value=generated_se_dict
		) as mock_make_se, patch(
			f"{MODULE}._service_mutation"
		) as mock_mutation:
			mock_mutation.return_value.__enter__ = MagicMock()
			mock_mutation.return_value.__exit__ = MagicMock(return_value=False)
			result = start_batch("UIPC-1", 2, idempotency_key="KEY-1", actor="chef@example.com")

		# A real Work Order was created for the resolved BOM/item/qty and submitted.
		wo_payload = captured["work_order_payload"]
		self.assertEqual(wo_payload["production_item"], "BIRYANI-1")
		self.assertEqual(wo_payload["bom_no"], "BOM-BIRYANI-001")
		self.assertEqual(wo_payload["qty"], 2)
		self.assertEqual(wo_payload["wip_warehouse"], "Kitchen WH")
		self.assertEqual(wo_payload["fg_warehouse"], "Department WH")

		# The Stock Entry was generated via work_order.make_stock_entry (which
		# returns a raw dict), then wrapped via frappe.get_doc into a real
		# Document -- it's THAT object, not the raw dict, whose rows get
		# repointed and which gets inserted/submitted.
		mock_make_se.assert_called_once_with("WO-1", purpose="Manufacture", qty=2)
		se_doc = captured["se_doc"]
		component_row, finished_row = se_doc.items
		self.assertEqual(component_row.s_warehouse, "Kitchen WH")
		self.assertIsNone(component_row.t_warehouse)
		self.assertEqual(finished_row.t_warehouse, "Department WH")
		self.assertIsNone(finished_row.s_warehouse)
		se_doc.insert.assert_called_once()
		se_doc.submit.assert_called_once()

		self.assertEqual(result["work_order"], "WO-1")
		self.assertEqual(result["source_warehouse"], "Kitchen WH")
		self.assertEqual(result["target_warehouse"], "Department WH")
		self.assertFalse(result["idempotent_replay"])
		self.assertEqual(result["stock_entry"], "SE-1")

	def test_start_batch_idempotent_replay_skips_work_order_creation(self):
		row = _config_row()

		def get_value(doctype, *args, **kwargs):
			if doctype == "Branch":
				return "Company A"
			if doctype == "URY Production Unit":
				return "Kitchen WH"
			if doctype == "URY Production Department":
				return "Department WH"
			raise AssertionError((doctype, args, kwargs))

		def _sql_with_existing(query, values=None, as_dict=False, **kwargs):
			if "tabURY Item Production Configuration" in query:
				return [row]
			if "tabStock Entry" in query:
				return [{"name": "SE-EXISTING"}]
			return []

		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_with_existing), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=get_value
		), patch(f"{MODULE}._resolve_active_bom", return_value="BOM-BIRYANI-001"), patch(
			f"{MODULE}.frappe.get_doc"
		) as get_doc, patch(f"{MODULE}._wo_make_stock_entry") as mock_make_se:
			result = start_batch("UIPC-1", 2, idempotency_key="KEY-1", actor="chef@example.com")

		get_doc.assert_not_called()
		mock_make_se.assert_not_called()
		self.assertEqual(result["stock_entry"], "SE-EXISTING")
		self.assertTrue(result["idempotent_replay"])

	def test_start_batch_rejects_external_receipt_configuration(self):
		row = _config_row(sourcing_mode="EXTERNAL_RECEIPT")
		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)):
			with self.assertRaises(BatchManufactureError) as ctx:
				start_batch("UIPC-1", 1, actor="chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "SOURCING_MODE_MISMATCH")


class TestReceiveBatch(FrappeTestCase):
	def setUp(self):
		patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]).start()
		patch(f"{MODULE}.frappe.has_permission", return_value=True).start()
		self.addCleanup(patch.stopall)

	def test_rejects_in_house_configuration(self):
		row = _config_row(sourcing_mode="IN_HOUSE")
		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)):
			with self.assertRaises(BatchManufactureError) as ctx:
				receive_batch("UIPC-1", 1, actor="chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "SOURCING_MODE_MISMATCH")

	def test_rejects_missing_external_receiving_warehouse(self):
		row = _config_row(sourcing_mode="EXTERNAL_RECEIPT", external_receiving_warehouse=None)
		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)), patch(
			f"{MODULE}.frappe.db.get_value", return_value="Company A"
		):
			with self.assertRaises(BatchManufactureError) as ctx:
				receive_batch("UIPC-1", 1, actor="chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "EXTERNAL_RECEIVING_WAREHOUSE_NOT_CONFIGURED")

	def test_receive_batch_posts_material_receipt_with_no_components(self):
		row = _config_row(sourcing_mode="EXTERNAL_RECEIPT")
		captured = {}

		def get_doc(arg):
			captured["doc"] = arg
			return _doc(arg)

		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)), patch(
			f"{MODULE}.frappe.db.get_value", return_value="Company A"
		), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc), patch(
			f"{MODULE}._service_mutation"
		) as mock_mutation:
			mock_mutation.return_value.__enter__ = MagicMock()
			mock_mutation.return_value.__exit__ = MagicMock(return_value=False)
			result = receive_batch("UIPC-1", 10, idempotency_key="KEY-3", actor="chef@example.com")

		self.assertEqual(captured["doc"]["stock_entry_type"], "Material Receipt")
		self.assertEqual(captured["doc"]["items"], [{"item_code": "BIRYANI-1", "qty": 10, "t_warehouse": "External WH"}])
		self.assertEqual(result["target_warehouse"], "External WH")
