from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_chef_filter import get_filtered_kot_list

MODULE = "ury.ury.api.ury_kot_chef_filter"


class TestGetFilteredKotList(FrappeTestCase):
    """Static, mock-based tests for the additive V3-52 chef/manager KDS
    filter module.

    These do not require a running bench/site -- all `frappe.*` calls are
    mocked. Validated by hand-tracing the mocked call sequences against
    `get_filtered_kot_list()`'s logic (no bench available in this environment
    to execute pytest), per the same approach used by
    `test_ury_kot_routing.py` for V3-51.
    """

    def _base_fieldnames(self, doctype):
        if doctype == "URY Production Unit":
            return {"name", "branch", "lead_chef", "enabled"}
        return {"name"}

    def _no_assigned_employees_meta(self):
        # get_meta(...).fields with no `assigned_employees` field, so
        # `_assigned_employees_child_doctype` returns None cleanly.
        meta = MagicMock()
        meta.fields = []
        return meta

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_assigned_chef_sees_only_their_unit_kots(self, mock_frappe, mock_fieldnames):
        # assigned_employees present on schema this time, backed by a child
        # doctype that lists "Chef A" against "Unit A" only.
        def fieldnames(doctype):
            if doctype == "URY Production Unit":
                return {"name", "branch", "lead_chef", "enabled", "assigned_employees"}
            return {"name"}

        mock_fieldnames.side_effect = fieldnames
        mock_frappe.get_roles.return_value = ["Employee"]
        mock_frappe.db.exists.return_value = True

        meta = MagicMock()
        field = MagicMock()
        field.fieldname = "assigned_employees"
        field.options = "URY Production Unit Assignment"
        meta.fields = [field]
        mock_frappe.get_meta.return_value = meta

        def get_all(doctype, filters=None, fields=None, order_by=None, distinct=None):
            if doctype == "URY Production Unit":
                if "lead_chef" in (filters or {}):
                    return []
                # branch lookup for _branches_for_user_units / unit listing
                return [{"name": "Unit A", "branch": "Main"}, {"name": "Unit B", "branch": "Main"}]
            if doctype == "URY Production Unit Assignment":
                if filters.get("parenttype") == "URY Production Unit" and "employee" in filters and "parent" not in filters:
                    # _branches_for_user_units call: parent not restricted
                    return [{"parent": "Unit A"}]
                if filters.get("parent") == ["in", ["Unit A", "Unit B"]]:
                    return [{"parent": "Unit A"}]
                return []
            return []

        mock_frappe.get_all.side_effect = get_all
        mock_frappe.db.get_value.side_effect = lambda doctype, name, field: "Main" if field == "branch" else None
        mock_frappe.get_list.return_value = []

        result = get_filtered_kot_list(user="chef-a@example.com", branch="Main", company="URY Co")

        self.assertEqual(result["Branch"], "Main")
        self.assertEqual(result["ProductionUnits"], ["Unit A"])
        self.assertEqual(result["KOT"], [])

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_lead_chef_sees_their_unit_kots(self, mock_frappe, mock_fieldnames):
        mock_fieldnames.side_effect = self._base_fieldnames
        mock_frappe.get_roles.return_value = ["Employee"]
        mock_frappe.get_meta.return_value = self._no_assigned_employees_meta()

        def get_all(doctype, filters=None, fields=None, order_by=None, distinct=None):
            if doctype == "URY Production Unit":
                if filters == {"lead_chef": "lead-a@example.com"}:
                    # _branches_for_user_units() queries fields=["branch"];
                    # a bare 'name' row here means row.get("branch") is None
                    # and the user resolves to no permitted branch at all.
                    return [{"branch": "Main"}]
                if "lead_chef" in (filters or {}):
                    return [{"name": "Unit A"}]
                return [{"name": "Unit A"}, {"name": "Unit B"}]
            return []

        mock_frappe.get_all.side_effect = get_all
        mock_frappe.get_list.return_value = []

        result = get_filtered_kot_list(
            user="lead-a@example.com", branch="Main", company="URY Co"
        )

        self.assertEqual(result["ProductionUnits"], ["Unit A"])

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_branch_manager_sees_all_units_in_branch(self, mock_frappe, mock_fieldnames):
        mock_fieldnames.side_effect = self._base_fieldnames
        mock_frappe.get_roles.return_value = ["URY Manager"]
        mock_frappe.get_meta.return_value = self._no_assigned_employees_meta()
        mock_frappe.get_all.return_value = [{"name": "Unit A"}, {"name": "Unit B"}]
        mock_frappe.get_list.return_value = []

        result = get_filtered_kot_list(user="manager@example.com", branch="Main", company="URY Co")

        self.assertEqual(sorted(result["ProductionUnits"]), ["Unit A", "Unit B"])

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_cashier_with_no_assignment_gets_no_chef_visibility(self, mock_frappe, mock_fieldnames):
        mock_fieldnames.side_effect = self._base_fieldnames
        mock_frappe.get_roles.return_value = ["POS User"]
        mock_frappe.get_meta.return_value = self._no_assigned_employees_meta()

        # No lead_chef units, no assigned_employees doctype -> user has no
        # branch relationship at all.
        def get_all(doctype, filters=None, fields=None, order_by=None, distinct=None):
            if doctype == "URY Production Unit":
                return []
            return []

        mock_frappe.get_all.side_effect = get_all
        mock_frappe.get_list.return_value = []

        result = get_filtered_kot_list(user="cashier@example.com", branch="Main", company="URY Co")

        self.assertEqual(result["KOT"], [])
        self.assertEqual(result["ProductionUnits"], [])
        # A cashier must never be granted the manager branch-wide fallback.
        mock_frappe.get_list.assert_not_called()

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_client_production_unit_cannot_expose_another_branch(
        self, mock_frappe, mock_fieldnames
    ):
        mock_fieldnames.side_effect = self._base_fieldnames
        mock_frappe.get_roles.return_value = ["Employee"]
        mock_frappe.get_meta.return_value = self._no_assigned_employees_meta()

        def get_all(doctype, filters=None, fields=None, order_by=None, distinct=None):
            if doctype == "URY Production Unit":
                if filters == {"lead_chef": "chef-a@example.com"}:
                    return [{"name": "Unit A"}]
                if "lead_chef" in (filters or {}):
                    return [{"name": "Unit A"}]
                return [{"name": "Unit A"}]
            return []

        mock_frappe.get_all.side_effect = get_all
        mock_frappe.get_list.return_value = []

        # Chef is only permitted "Unit A" in "Main" branch, but the client
        # requests a foreign unit name as a hint.
        result = get_filtered_kot_list(
            user="chef-a@example.com",
            branch="Main",
            company="URY Co",
            production_unit="Other-Branch-Unit",
        )

        self.assertEqual(result["KOT"], [])
        self.assertEqual(result["ProductionUnits"], [])
        mock_frappe.get_list.assert_not_called()

    @patch(f"{MODULE}._doctype_fieldnames")
    @patch(f"{MODULE}.frappe")
    def test_order_type_filtering_applies_alongside_chef_filtering(
        self, mock_frappe, mock_fieldnames
    ):
        mock_fieldnames.side_effect = self._base_fieldnames
        mock_frappe.get_roles.return_value = ["URY Manager"]
        mock_frappe.get_meta.return_value = self._no_assigned_employees_meta()
        mock_frappe.get_all.return_value = [{"name": "Unit A"}]

        mock_frappe.get_list.return_value = [MagicMock(name="KOT-0001")]
        mock_frappe.get_list.return_value[0].name = "KOT-0001"

        kot_doc = MagicMock()
        kot_doc.production = "Unit A"
        kot_doc.invoice = "INV-0001"
        kot_doc.get = lambda key, default=None: {
            "enable_order_type_wise_display_on_mosaic": 1,
            "order_type": [MagicMock(order_type="Dine In")],
        }.get(key, default)

        prod_doc = MagicMock()
        prod_doc.get = kot_doc.get

        def get_doc(doctype, name):
            if doctype == "URY KOT":
                return kot_doc
            if doctype == "URY Production Unit":
                return prod_doc
            return MagicMock()

        mock_frappe.get_doc.side_effect = get_doc
        # Invoice order_type does not match the allowed "Dine In" list.
        mock_frappe.db.get_value.return_value = "Takeaway"
        mock_frappe.as_json.return_value = "{}"
        mock_frappe.utils.now.return_value = "2026-08-28 12:00:00"
        mock_frappe.utils.add_to_date.return_value = "2026-08-28 09:00:00"

        result = get_filtered_kot_list(user="manager@example.com", branch="Main", company="URY Co")

        # Order-type filter excludes the only KOT even though the manager is
        # otherwise permitted to see "Unit A".
        self.assertEqual(result["KOT"], [])
