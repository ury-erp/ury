import frappe


@frappe.whitelist()
def check_table_reservation(table):
    reservation = frappe.db.get_value(
        "URY Table Reservation",
        {
            "reserved_table": table,
            "status": "Active"
        },
        [
            "name",
            "customer",
            "reserved_at"
        ],
        as_dict=True
    )

    return reservation

@frappe.whitelist()
def create_table_reservation(table, customer, reserved_at, notes=None):
    if "T" in reserved_at:
        reserved_at = reserved_at.replace("T", " ")

    doc = frappe.get_doc({
        "doctype": "URY Table Reservation",
        "reserved_table": table,
        "customer": customer,
        "reserved_at": reserved_at,
        "comments": notes,
        "status": "Active",
    })

    doc.insert(ignore_permissions=True, ignore_links=True)
    frappe.db.commit()
    return doc.name

@frappe.whitelist()
def update_reservation_status(reservation_name, status):
    frappe.db.set_value("URY Table Reservation", reservation_name, "status", status)
    frappe.db.commit()
    return True

@frappe.whitelist()
def get_active_reservations():
    reservations = frappe.db.get_all(
        "URY Table Reservation",
        filters={"status": "Active"},
        fields=["reserved_table"]
    )
    return [r.reserved_table for r in reservations]