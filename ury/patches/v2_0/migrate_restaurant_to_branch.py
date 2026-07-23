import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def execute():
	# Ensure Custom Fields are created on Branch in the database
	create_custom_fields({
		"Branch": [
			{"fieldname": "custom_restaurant_details_section", "label": "Restaurant Details", "fieldtype": "Section Break"},
			{"fieldname": "custom_company", "label": "Company", "fieldtype": "Link", "options": "Company", "insert_after": "custom_restaurant_details_section"},
			{"fieldname": "custom_invoice_series_prefix", "label": "Invoice Series Prefix", "fieldtype": "Data", "insert_after": "custom_company"},
			{"fieldname": "custom_aggregator_series_prefix", "label": "Aggregator Series Prefix", "fieldtype": "Data", "insert_after": "custom_invoice_series_prefix"},
			{"fieldname": "custom_active_menu", "label": "Default Menu", "fieldtype": "Link", "options": "URY Menu", "insert_after": "custom_aggregator_series_prefix"},
			{"fieldname": "custom_default_tax_template", "label": "Default Tax Template", "fieldtype": "Link", "options": "Sales Taxes and Charges Template", "insert_after": "custom_active_menu"},
			{"fieldname": "custom_default_room", "label": "Default Room", "fieldtype": "Link", "options": "URY Room", "insert_after": "custom_default_tax_template"},
			{"fieldname": "custom_room_wise_menu", "label": "Room Wise Menu", "fieldtype": "Check", "default": "0", "insert_after": "custom_default_room"},
			{"fieldname": "custom_menu_for_room", "label": "Menu For Room", "fieldtype": "Table", "options": "Menu for Room", "depends_on": "eval:doc.custom_room_wise_menu", "insert_after": "custom_room_wise_menu"},
			{"fieldname": "custom_order_type_wise_menu", "label": "Order Type Wise Menu", "fieldtype": "Check", "default": "0", "insert_after": "custom_menu_for_room"},
			{"fieldname": "custom_order_type_menu", "label": "Order Type Menu", "fieldtype": "Table", "options": "Order Type Menu", "depends_on": "eval:doc.custom_order_type_wise_menu", "insert_after": "custom_order_type_menu"}
		]
	}, ignore_validate=True)
	frappe.reload_doc("setup", "doctype", "branch")
	
	restaurants = frappe.get_all("URY Restaurant", fields=["*"])
	branch_meta = frappe.get_meta("Branch")
	
	for r in restaurants:
		if not r.branch or not frappe.db.exists("Branch", r.branch):
			continue
			
		branch_doc = frappe.get_doc("Branch", r.branch)
		
		# Copy all field values from URY Restaurant to Branch
		branch_doc.custom_company = r.get("company")
		branch_doc.custom_invoice_series_prefix = r.get("invoice_series_prefix")
		branch_doc.custom_aggregator_series_prefix = r.get("aggregator_series_prefix")
		branch_doc.custom_active_menu = r.get("active_menu")
		branch_doc.custom_default_tax_template = r.get("default_tax_template")
		branch_doc.custom_default_room = r.get("default_room")
		branch_doc.custom_room_wise_menu = r.get("room_wise_menu")
		branch_doc.custom_order_type_wise_menu = r.get("order_type_wise_menu")

		
		# Copy Menu for Room child table
		if branch_doc.meta.has_field("custom_menu_for_room"):
			branch_doc.set("custom_menu_for_room", [])
			restaurant_rooms = frappe.get_all(
				"Menu for Room",
				filters={"parent": r.name, "parenttype": "URY Restaurant"},
				fields=["menu", "room"]
			)
			for room in restaurant_rooms:
				branch_doc.append("custom_menu_for_room", {
					"menu": room.menu,
					"room": room.room
				})
			
		# Copy Order Type Menu child table
		if branch_doc.meta.has_field("custom_order_type_menu"):
			branch_doc.set("custom_order_type_menu", [])
			order_menus = frappe.get_all(
				"Order Type Menu",
				filters={"parent": r.name, "parenttype": "URY Restaurant"},
				fields=["order_type", "menu"]
			)
			for om in order_menus:
				branch_doc.append("custom_order_type_menu", {
					"order_type": om.order_type,
					"menu": om.menu
				})
			
		branch_doc.save(ignore_permissions=True)
		print(f"Migrated restaurant {r.name} data to branch {r.branch}")

		# Migrate address field to POS Profile address
		if r.get("address"):
			pos_profiles = set()
			if r.branch:
				for p in frappe.get_all("POS Profile", filters={"branch": r.branch}, fields=["name"]):
					pos_profiles.add(p.name)
			if r.name:
				for p in frappe.get_all("POS Profile", filters={"restaurant": r.name}, fields=["name"]):
					pos_profiles.add(p.name)

			for pos_profile_name in pos_profiles:
				pos_doc = frappe.get_doc("POS Profile", pos_profile_name)
				pos_doc.company_address = r.address
				pos_doc.save(ignore_permissions=True)
				print(f"Migrated address {r.address} from restaurant {r.name} to POS Profile {pos_profile_name}")

