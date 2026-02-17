import frappe
from frappe import _
from frappe.utils import flt, getdate

@frappe.whitelist()
@frappe.whitelist()
def get_cashier_kpis(filters=None, section=None):
    if isinstance(filters, str):
        filters = frappe.parse_json(filters)

    conditions = get_conditions(filters)
    parent_conditions = get_conditions(filters, "parent")
    
    data = {}

    # 1. KPIs
    if not section or section == 'kpis':
        kpi_data = frappe.db.sql(f"""
            SELECT
                COUNT(name) as total_invoices,
                SUM(grand_total) as total_sales,
                SUM(outstanding_amount) as total_outstanding,
                SUM(paid_amount) as total_paid
            FROM `tabPOS Invoice`
            WHERE docstatus = 1 {conditions}
        """, filters, as_dict=1)[0]
        
        # Initialize KPIs
        kpis = {
            "total_invoices": flt(kpi_data.get("total_invoices")),
            "total_sales": flt(kpi_data.get("total_sales")),
            "total_outstanding": flt(kpi_data.get("total_outstanding")),
            "total_cash": 0.0,
            "total_card": 0.0,
            "total_upi": 0.0,
            "total_other": 0.0
        }

        # So we need to run payment_modes query if section is 'kpis' OR 'payment_modes'.
        pass 

    # 2. Payment Modes (Used for both KPIs and Payment Chart)
    if not section or section in ['kpis', 'payment_modes']:
        payment_modes = frappe.db.sql(f"""
            SELECT
                p.mode_of_payment,
                SUM(p.amount) as amount
            FROM `tabSales Invoice Payment` p
            INNER JOIN `tabPOS Invoice` i ON p.parent = i.name
            WHERE i.docstatus = 1 {conditions}
            GROUP BY p.mode_of_payment
        """, filters, as_dict=1)
        
        if not section or section == 'kpis':
             # Classify payments for KPI cards
            for mode in payment_modes:
                amount = flt(mode.get("amount"))
                mode_name = mode.get("mode_of_payment").lower()
                
                if "cash" in mode_name:
                    kpis["total_cash"] += amount
                elif "card" in mode_name or "credit" in mode_name or "debit" in mode_name:
                    kpis["total_card"] += amount
                elif "upi" in mode_name or "phonepe" in mode_name or "gpay" in mode_name or "paytm" in mode_name:
                    kpis["total_upi"] += amount
                else:
                    kpis["total_other"] += amount
            data['kpis'] = kpis

        if not section or section == 'payment_modes':
            data['payment_modes'] = payment_modes

    # 3. Daywise Sales Chart Data
    if not section or section == 'daywise_sales':
        data['daywise_sales'] = frappe.db.sql(f"""
            SELECT
                posting_date,
                SUM(grand_total) as total_sales
            FROM `tabPOS Invoice`
            WHERE docstatus = 1 {conditions}
            GROUP BY posting_date
            ORDER BY posting_date
        """, filters, as_dict=1)

    # 4. Best Selling Items
    if not section or section == 'best_selling_items':
        data['best_selling_items'] = frappe.db.sql(f"""
            SELECT
                item.item_code,
                item.item_name,
                SUM(item.qty) as total_qty,
                SUM(item.amount) as total_revenue,
                COUNT(DISTINCT parent.name) as invoice_count
            FROM
                `tabPOS Invoice Item` item
            INNER JOIN
                `tabPOS Invoice` parent ON item.parent = parent.name
            WHERE
                parent.docstatus = 1
                AND parent.is_return = 0
                {parent_conditions}
            GROUP BY
                item.item_code
            ORDER BY
                total_qty DESC
            LIMIT 10
        """, filters, as_dict=1)
    
    # 5. Sales by Category
    if not section or section == 'sales_by_category':
        data['sales_by_category'] = frappe.db.sql(f"""
            SELECT
                item.item_group,
                SUM(item.amount) as amount
            FROM
                `tabPOS Invoice Item` item
            INNER JOIN
                `tabPOS Invoice` parent ON item.parent = parent.name
            WHERE
                parent.docstatus = 1
                AND parent.is_return = 0
                {parent_conditions}
            GROUP BY
                item.item_group
            ORDER BY
                amount DESC
        """, filters, as_dict=1)

    # 6. Peak Hours
    if not section or section == 'peak_hours':
        data['peak_hours'] = frappe.db.sql(f"""
            SELECT
                HOUR(posting_time) as hour,
                COUNT(name) as invoice_count,
                SUM(grand_total) as total_sales
            FROM
                `tabPOS Invoice`
            WHERE
                docstatus = 1
                {conditions}
            GROUP BY
                HOUR(posting_time)
            ORDER BY
                hour ASC
        """, filters, as_dict=1)
    
    return data

def get_conditions(filters, alias=None):
    conditions = []
    prefix = f"{alias}." if alias else ""
    
    if filters.get("from_date"):
        conditions.append(f"AND {prefix}posting_date >= %(from_date)s")
    
    if filters.get("to_date"):
        conditions.append(f"AND {prefix}posting_date <= %(to_date)s")
        
    if filters.get("pos_profile"):
        conditions.append(f"AND {prefix}pos_profile = %(pos_profile)s")
        
    if filters.get("company"):
        conditions.append(f"AND {prefix}company = %(company)s")

    if filters.get("branch"):
         conditions.append(f"AND {prefix}branch = %(branch)s")

    return " ".join(conditions) if conditions else ""
