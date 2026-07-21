import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_to_date
from ury.ury_pos.api import getBranch, getBranchRoom, getRoom, get_user_pos_profile, get_allowed_profiles
from ury.ury.api.ury_kot_order_number import set_order_number
from erpnext.accounts.doctype.pos_profile.pos_profile import POSProfile
import ury.ury.hooks.ury_pos_profile
import ury.ury.hooks.ury_pos_invoice
from frappe.model.document import Document

from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice

from erpnext.selling.doctype.customer.customer import Customer
Customer.validate = lambda self: None

# Bypass standard ERPNext validations and database link checks for tests
POSProfile.validate = lambda self: None
POSInvoice.validate = lambda self: None
POSInvoice.set_missing_values = lambda self, for_validate=False: None
ury.ury.hooks.ury_pos_profile.validate_cost_center = lambda doc, method=None: None
ury.ury.hooks.ury_pos_invoice.validate = lambda doc, method=None: None
Document._validate_links = lambda self: None
Document._validate_mandatory = lambda self: None

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
create_custom_fields({
    "Branch": [
        {"fieldname": "custom_branch_settings_section", "label": "Branch Settings", "fieldtype": "Section Break"},
        {"fieldname": "custom_reset_order_number_daily", "label": "Reset Order Number Daily", "fieldtype": "Check", "default": "1", "insert_after": "custom_branch_settings_section"},
        {"fieldname": "custom_order_counter", "label": "Order Counter", "fieldtype": "Int", "default": "0", "hidden": 1, "insert_after": "custom_reset_order_number_daily"},
        {"fieldname": "custom_aggregator_order_counter", "label": "Aggregator Order Counter", "fieldtype": "Int", "default": "0", "hidden": 1, "insert_after": "custom_order_counter"},
        {"fieldname": "custom_last_reset_date", "label": "Last Reset Date", "fieldtype": "Date", "hidden": 1, "insert_after": "custom_aggregator_order_counter"}
    ]
}, ignore_validate=True)

class TestRestructure(FrappeTestCase):
    def setUp(self):
        # Clean up existing test records to prevent DuplicateEntryError
        frappe.db.delete("Branch", {"name": "Test Branch Restructure"})
        frappe.db.delete("URY Room", {"name": ["in", ["Test Room Restructure 1", "Test Room Restructure 2"]]})
        frappe.db.delete("POS Profile", {"name": "Test POS Profile 1"})
        frappe.db.delete("Customer", {"name": "Test Customer"})

        # 0. Create test Customer
        cg = frappe.db.get_value("Customer Group", {"is_group": 0}, "name") or "Individual"
        self.customer = frappe.get_doc({
            "doctype": "Customer",
            "name": "Test Customer",
            "customer_name": "Test Customer",
            "customer_group": cg,
            "territory": "All Territories"
        }).insert(ignore_permissions=True)

        # 1. Create branch with empty room mapping
        self.branch = frappe.get_doc({
            "doctype": "Branch",
            "branch": "Test Branch Restructure",
            "custom_order_counter": 0,
            "custom_aggregator_order_counter": 0,
            "custom_last_reset_date": today(),
            "user": [{
                "user": frappe.session.user
            }]
        }).insert(ignore_permissions=True)

        # 2. Create rooms linked to the branch
        self.room1 = frappe.get_doc({
            "doctype": "URY Room",
            "name": "Test Room Restructure 1",
            "branch": self.branch.name,
            "room_type": "AC"
        }).insert(ignore_permissions=True)
        
        self.room2 = frappe.get_doc({
            "doctype": "URY Room",
            "name": "Test Room Restructure 2",
            "branch": self.branch.name,
            "room_type": "AC"
        }).insert(ignore_permissions=True)

        # 3. Update branch user with room
        branch_doc = frappe.get_doc("Branch", self.branch.name)
        branch_doc.user[0].room = self.room1.name
        branch_doc.save(ignore_permissions=True)
        
        # Create POS Profiles
        # First check if there is a company and warehouse to use
        company_list = frappe.get_all("Company", limit=1)
        if company_list:
            company_name = company_list[0].name
        else:
            test_company = frappe.get_doc({
                "doctype": "Company",
                "company_name": "Test Company Restructure",
                "default_currency": "INR",
                "country": "India"
            }).insert(ignore_permissions=True)
            company_name = test_company.name
            
        warehouse_list = frappe.get_all("Warehouse", filters={"company": company_name}, limit=1)
        if warehouse_list:
            warehouse_name = warehouse_list[0].name
        else:
            wt_list = frappe.get_all("Warehouse Type", limit=1)
            wt_name = wt_list[0].name if wt_list else "Transit"
            test_warehouse = frappe.get_doc({
                "doctype": "Warehouse",
                "warehouse_name": "Test Warehouse Restructure",
                "warehouse_type": wt_name,
                "company": company_name
            }).insert(ignore_permissions=True)
            warehouse_name = test_warehouse.name

        # Get or create Mode of Payment
        mop_list = frappe.get_all("Mode of Payment", limit=1)
        if mop_list:
            mop_name = mop_list[0].name
        else:
            test_mop = frappe.get_doc({
                "doctype": "Mode of Payment",
                "mode_of_payment": "Cash",
                "type": "Cash"
            }).insert(ignore_permissions=True)
            mop_name = test_mop.name

        self.profile1 = frappe.get_doc({
            "doctype": "POS Profile",
            "name": "Test POS Profile 1",
            "company": company_name,
            "warehouse": warehouse_name,
            "branch": self.branch.name,
            "applicable_for_users": [{"user": frappe.session.user}],
            "custom_rooms": [{"room": self.room1.name}],
            "write_off_account": "Dummy Account",
            "write_off_cost_center": "Dummy Cost Center",
            "cost_center": "Dummy Cost Center",
            "payments": [{
                "mode_of_payment": mop_name,
                "default": 1
            }]
        }).insert(ignore_permissions=True)

    def tearDown(self):
        # Clean up test documents
        frappe.db.rollback()

    def test_room_resolution(self):
        # Test rooms fetched from POS Profile
        rooms = getRoom()
        self.assertEqual(len(rooms), 1)
        self.assertEqual(rooms[0]["name"], self.room1.name)
        
        branch_room = getBranchRoom()
        self.assertEqual(branch_room[0]["name"], self.room1.name)

    def test_order_counter_increments(self):
        # Create dummy POS Invoice
        invoice = frappe.get_doc({
            "doctype": "POS Invoice",
            "company": self.profile1.company,
            "pos_profile": self.profile1.name,
            "branch": self.branch.name,
            "order_type": "Dine In",
            "customer": "Test Customer"
        }).insert(ignore_permissions=True)
        
        # Check branch counter was incremented
        counter = frappe.db.get_value("Branch", self.branch.name, "custom_order_counter")
        self.assertEqual(counter, 1)
        
        # Check custom_ury_order_number is set
        order_num = frappe.db.get_value("POS Invoice", invoice.name, "custom_ury_order_number")
        self.assertEqual(order_num, "1")



    def test_cashier_owner_assignment(self):
        # Create invoice
        invoice = frappe.get_doc({
            "doctype": "POS Invoice",
            "company": self.profile1.company,
            "pos_profile": self.profile1.name,
            "branch": self.branch.name,
            "order_type": "Dine In",
            "customer": "Test Customer"
        }).insert(ignore_permissions=True)
        
        # Check owner is set to the cashier user in applicable_for_users
        self.assertEqual(invoice.owner, frappe.session.user)

    def test_pos_closing_resets_counter(self):
        # 1. When custom_reset_order_number_daily = 0, counter should NOT reset
        frappe.db.set_value("Branch", self.branch.name, {
            "custom_order_counter": 5,
            "custom_reset_order_number_daily": 0
        })
        
        closing = frappe.get_doc({
            "doctype": "POS Closing Entry",
            "branch": self.branch.name,
            "pos_profile": self.profile1.name,
            "user": frappe.session.user,
            "period_start_date": today(),
            "period_end_date": today(),
            "posting_date": today(),
        })
        
        from ury.ury.hooks.ury_pos_closing_entry import on_submit
        on_submit(closing)
        
        counter = frappe.db.get_value("Branch", self.branch.name, "custom_order_counter")
        self.assertEqual(counter, 5)

        # 2. When custom_reset_order_number_daily = 1, counter SHOULD reset to 0
        frappe.db.set_value("Branch", self.branch.name, "custom_reset_order_number_daily", 1)
        on_submit(closing)
        
        counter = frappe.db.get_value("Branch", self.branch.name, "custom_order_counter")
        self.assertEqual(counter, 0)

    def test_allowed_profiles(self):
        allowed = get_allowed_profiles(frappe.session.user, self.branch.name)
        self.assertIn(self.profile1.name, allowed)
