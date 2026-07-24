import frappe

def get_production_units():
    return frappe.get_list(
        "URY Production Unit",
        fields=["name", "disable"],
        order_by="name asc",
    )

def get_kot_counts(production_name):
    active_orders = frappe.db.count(
        "URY KOT",
        {
            "production": production_name,
            "docstatus": 1,
            "order_status": "Ready For Prepare",
        },
    )
    served_orders = frappe.db.count(
        "URY KOT",
        {
            "production": production_name,
            "docstatus": 1,
            "order_status": "Served",
        },
    )
    total_orders = frappe.db.count(
        "URY KOT",
        {
            "production": production_name,
            "docstatus": 1,
        },
    )
    return {
        "active_orders": active_orders,
        "served_orders": served_orders,
        "total_orders": total_orders,
    }


@frappe.whitelist()
def get_production_dashboard():
    dashboard = []
    production_units = get_production_units()
    for unit in production_units:
        counts = get_kot_counts(unit["name"])
        dashboard.append(
            {
                "name": unit["name"],
                "disable": unit["disable"],
                "active_orders": counts["active_orders"],
                "served_orders": counts["served_orders"],
                "total_orders": counts["total_orders"],
                "last_updated": frappe.utils.now_datetime(),
            }
        )
    return dashboard