import frappe

def execute():
	# Sync Custom Fields first to ensure they are created in the database
	frappe.reload_doc("setup", "doctype", "branch")
	
	restaurants = frappe.get_all(
		"URY Restaurant",
		fields=[
			"name",
			"branch",
			"company",
			"invoice_series_prefix",
			"aggregator_series_prefix",
			"active_menu",
			"default_tax_template",
			"default_room",
			"room_wise_menu",
			"order_type_wise_menu",
		]
	)
	
	for r in restaurants:
		if not r.branch or not frappe.db.exists("Branch", r.branch):
			continue
			
		branch_doc = frappe.get_doc("Branch", r.branch)
		
		# Copy fields
		branch_doc.custom_company = r.company
		branch_doc.custom_invoice_series_prefix = r.invoice_series_prefix
		branch_doc.custom_aggregator_series_prefix = r.aggregator_series_prefix
		branch_doc.custom_active_menu = r.active_menu
		branch_doc.custom_default_tax_template = r.default_tax_template
		branch_doc.custom_default_room = r.default_room
		branch_doc.custom_room_wise_menu = r.room_wise_menu
		branch_doc.custom_order_type_wise_menu = r.order_type_wise_menu
		
		# Copy Menu for Room child table
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
