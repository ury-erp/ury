from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_batch_manufacture_service import (
	BatchManufactureError,
	_authorize_batch_action,
	_in_house_stock_entry_items,
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


class TestInHouseStockEntryItems(FrappeTestCase):
	"""Regression for the same class of bug TestStockEntryType in
	test_ury_fulfilment_posting_service.py guards against: a hand-built
	Manufacture Stock Entry must include a t_warehouse finished-item row
	with is_finished_item=1, or ERPNext rejects the submit."""

	def test_components_and_finished_item_rows(self):
		vector = {
			"bom": "BOM-BIRYANI-001",
			"components": [
				{"component_item": "RICE", "qty": 4, "stock_uom": "Kg", "qty_per_unit": 2},
				{"component_item": "CHICKEN", "qty": 2, "stock_uom": "Kg", "qty_per_unit": 1},
			],
		}
		with patch(f"{MODULE}.compile_bom_vector", return_value=vector):
			items, bom_no = _in_house_stock_entry_items("BIRYANI-1", 2, "Company A", "Kitchen WH", "FG WH")

		self.assertEqual(bom_no, "BOM-BIRYANI-001")
		component_rows = [row for row in items if row["item_code"] != "BIRYANI-1"]
		self.assertEqual(len(component_rows), 2)
		for row in component_rows:
			self.assertEqual(row["s_warehouse"], "Kitchen WH")
			self.assertNotIn("t_warehouse", row)

		finished_rows = [row for row in items if row["item_code"] == "BIRYANI-1"]
		self.assertEqual(len(finished_rows), 1)
		self.assertEqual(finished_rows[0]["t_warehouse"], "FG WH")
		self.assertEqual(finished_rows[0]["qty"], 2)
		self.assertEqual(finished_rows[0]["is_finished_item"], 1)

	def test_rejects_incomplete_component_row(self):
		vector = {
			"bom": "BOM-1",
			"components": [{"component_item": "", "qty": 1, "stock_uom": "Kg", "qty_per_unit": 1}],
		}
		with patch(f"{MODULE}.compile_bom_vector", return_value=vector):
			with self.assertRaises(BatchManufactureError) as ctx:
				_in_house_stock_entry_items("BIRYANI-1", 1, "Company A", "Kitchen WH", "FG WH")
		self.assertEqual(ctx.exception.reason_code, "INVALID_BOM_COMPONENT")


class TestSubmitStockEntryIdempotency(FrappeTestCase):
	def test_replays_existing_stock_entry_for_same_idempotency_key(self):
		with patch(f"{MODULE}._find_existing_stock_entry", return_value="SE-EXISTING"), patch(
			f"{MODULE}.frappe.get_doc"
		) as get_doc:
			stock_entry, idempotent = _submit_stock_entry(
				company="Company A",
				stock_entry_type="Manufacture",
				items=[{"item_code": "BIRYANI-1", "qty": 1, "t_warehouse": "FG WH", "is_finished_item": 1}],
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
	def setUp(self):
		patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]).start()
		patch(f"{MODULE}.frappe.has_permission", return_value=True).start()
		self.addCleanup(patch.stopall)

	def test_rejects_zero_or_negative_qty(self):
		with self.assertRaises(BatchManufactureError) as ctx:
			start_batch("UIPC-1", 0, actor="chef@example.com")
		self.assertEqual(ctx.exception.reason_code, "INVALID_QTY")

	def test_start_batch_posts_manufacture_entry_into_direct_retail_warehouse(self):
		row = _config_row()
		vector = {
			"bom": "BOM-BIRYANI-001",
			"components": [{"component_item": "RICE", "qty": 4, "stock_uom": "Kg", "qty_per_unit": 2}],
		}
		captured = {}

		def get_doc(arg):
			captured["doc"] = arg
			return _doc(arg)

		def get_value(doctype, *args, **kwargs):
			if doctype == "Branch":
				return "Company A"
			if doctype == "URY Production Unit":
				return "Kitchen WH"
			raise AssertionError((doctype, args, kwargs))

		with patch(f"{MODULE}.frappe.db.sql", side_effect=_sql_lock(row)), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=get_value
		), patch(f"{MODULE}._resolve_active_bom", return_value="BOM-BIRYANI-001"), patch(
			f"{MODULE}.compile_bom_vector", return_value=vector
		), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc), patch(
			f"{MODULE}._service_mutation"
		) as mock_mutation:
			mock_mutation.return_value.__enter__ = MagicMock()
			mock_mutation.return_value.__exit__ = MagicMock(return_value=False)
			result = start_batch("UIPC-1", 2, idempotency_key="KEY-1", actor="chef@example.com")

		self.assertEqual(captured["doc"]["stock_entry_type"], "Manufacture")
		finished_rows = [row for row in captured["doc"]["items"] if row["item_code"] == "BIRYANI-1"]
		self.assertEqual(finished_rows[0]["t_warehouse"], "FG WH")
		self.assertEqual(finished_rows[0]["is_finished_item"], 1)
		self.assertEqual(result["source_warehouse"], "Kitchen WH")
		self.assertEqual(result["target_warehouse"], "FG WH")
		self.assertFalse(result["idempotent_replay"])

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
