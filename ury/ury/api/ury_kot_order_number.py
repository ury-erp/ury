import frappe


def set_order_number(doc, event):
    pos_profile = doc.pos_profile
    if doc.order_type == "Aggregators":
        last_invoice = frappe.db.get_value(
            "POS Opening Entry",
            {"pos_profile": pos_profile, "status": "Open"},
            "custom_ury_last_aggregator_invoice",
        )
    else:
        last_invoice = frappe.db.get_value(
            "POS Opening Entry",
            {"pos_profile": pos_profile, "status": "Open"},
            "custom_ury_last_invoice",
        )
    if last_invoice:
        last_invoice_str = str(last_invoice)
        suffix = last_invoice_str[-5:]
        last_invoice_number = int(suffix) if suffix.isdigit() else 0

        current_invoice = doc.name

        current_suffix = str(current_invoice)[-5:]
        current_invoice_number = int(current_suffix) if current_suffix.isdigit() else 0

        order_number = current_invoice_number - last_invoice_number
        if order_number > 0:
            if doc.order_type == "Aggregators":
                order_number = "AGR - " + str(order_number)
            frappe.db.set_value(
                "POS Invoice",
                doc.name,
                "custom_ury_order_number",
                order_number,
                update_modified=False,
            )
        else:
            frappe.db.set_value(
                "POS Invoice",
                doc.name,
                "custom_ury_order_number",
                current_invoice_number,
                update_modified=False,
            )
    else:
        pos_open_name = frappe.db.get_value(
            "POS Opening Entry",
            {"pos_profile": pos_profile, "status": "Open"},
            "name",
        )

        if doc.order_type == "Aggregators":
            try:
                aggregator_invoice = frappe.get_last_doc(
                    "POS Invoice", filters={"pos_profile": doc.pos_profile, "order_type": "Aggregators"}
                )
                agg_suffix = aggregator_invoice.name[-5:]
                aggregator_invoice_number = int(agg_suffix) if agg_suffix.isdigit() else 0
                aggregator_last_order_number = aggregator_invoice_number - 1
            except frappe.DoesNotExist:
                aggregator_last_order_number = 0
            frappe.db.set_value(
                "POS Opening Entry", pos_open_name, "custom_ury_last_aggregator_invoice", aggregator_last_order_number
            )
        else:
            try:
                invoice = frappe.get_last_doc(
                    "POS Invoice", filters={"pos_profile": doc.pos_profile, "order_type": ["!=", "Aggregators"]}
                )
                inv_suffix = invoice.name[-5:]
                invoice_number = int(inv_suffix) if inv_suffix.isdigit() else 0
                last_order_number = invoice_number - 1
            except frappe.DoesNotExist:
                last_order_number = 0

            frappe.db.set_value(
                "POS Opening Entry", pos_open_name, "custom_ury_last_invoice", last_order_number
            )

        default_value = "AGR - 1" if doc.order_type == "Aggregators" else "1"
        frappe.db.set_value(
            "POS Invoice",
            doc.name,
            "custom_ury_order_number",
            default_value,
            update_modified=False,
        )


def set_last_invoice_in_pos_open(doc, event):
    try:
        invoice = frappe.get_last_doc(
            "POS Invoice", filters={"pos_profile": doc.pos_profile, "order_type": ["!=", "Aggregators"]}
        )
        doc.custom_ury_last_invoice = invoice.name
    except Exception:
        frappe.log_error(f"Failed to set last invoice in POS opening: {frappe.get_traceback()}", "Order Number Error")
    try:
        aggregator_invoice = frappe.get_last_doc(
            "POS Invoice", filters={"pos_profile": doc.pos_profile, "order_type": "Aggregators"}
        )
        doc.custom_ury_last_aggregator_invoice = aggregator_invoice.name
    except Exception:
        frappe.log_error(f"Failed to set last aggregator invoice in POS opening: {frappe.get_traceback()}", "Order Number Error")