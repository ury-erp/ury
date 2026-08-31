import frappe
from frappe.tests.utils import FrappeTestCase


class TestURYProductionUnit(FrappeTestCase):
	def test_production_unit_schema_extended(self):
		meta = frappe.get_meta("URY Production Unit")
		doc_fields = {field.fieldname: field for field in meta.fields}

		for fieldname in (
			"department",
			"unit_type",
			"enabled",
			"lead_chef",
			"assigned_employees",
			"workstation",
			"workstation_type",
		):
			self.assertIn(
				fieldname,
				doc_fields,
				f"Field {fieldname} is missing from URY Production Unit",
			)

		self.assertEqual(doc_fields["branch"].fetch_from, "pos_profile.branch")
		self.assertEqual(doc_fields["warehouse"].fetch_from, "pos_profile.warehouse")

	def test_assigned_employees_survives_insert_and_save(self):
		employee = self._get_existing_doc_name("Employee")
		department = self._get_existing_doc_name("URY Production Department")
		workstation = self._get_existing_doc_name("Workstation")
		workstation_type = self._get_existing_doc_name("Workstation Type")

		unit = frappe.get_doc(
			{
				"doctype": "URY Production Unit",
				"production": self._unique_name("V3-12 Production Unit"),
				"department": department,
				"enabled": 1,
				"unit_type": "Test Unit",
				"lead_chef": employee,
				"workstation": workstation,
				"workstation_type": workstation_type,
				"assigned_employees": [{"employee": employee}],
			}
		)
		unit.insert(ignore_permissions=True)
		self.addCleanup(self._cleanup_doc, "URY Production Unit", unit.name)

		self.assertEqual(len(unit.assigned_employees), 1)
		self.assertEqual(unit.assigned_employees[0].employee, employee)

		unit.save(ignore_permissions=True)
		reloaded = frappe.get_doc("URY Production Unit", unit.name)
		self.assertEqual(len(reloaded.assigned_employees), 1)
		self.assertEqual(reloaded.assigned_employees[0].employee, employee)

	def _get_existing_doc_name(self, doctype):
		name = frappe.get_all(doctype, limit=1, pluck="name")
		if not name:
			self.skipTest(f"No {doctype} exists on this site to use for V3-12 testing.")
		return name[0]

	def _cleanup_doc(self, doctype, name):
		if frappe.db.exists(doctype, name):
			frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)

	def _unique_name(self, prefix):
		return f"{prefix} {frappe.generate_hash(length=8)}"
