// Copyright (c) 2024, Tridots Tech and contributors
// For license information, please see license.txt

frappe.ui.form.on("Wastage Note", {
    setup: function(frm) {
        frm.set_query("source_warehouse", function() {
            return {
                filters: {
                    "company": frm.doc.company,
                    "is_group": 0
                }
            };
        });

        frm.set_query("waste_warehouse", function() {
            return {
                filters: {
                    "company": frm.doc.company,
                    "is_group": 0
                }
            };
        });

        frm.set_query("expense_account", function() {
            return {
                filters: {
                    "company": frm.doc.company,
                    "root_type": "Expense",
                    "is_group": 0
                }
            };
        });

        frm.set_query("cost_center", function() {
            return {
                filters: {
                    "company": frm.doc.company,
                    "is_group": 0
                }
            };
        });

        frm.set_query("pos_invoice", function() {
            return {
                filters: {
                    "company": frm.doc.company,
                    "docstatus": 1
                }
            };
        });

        frm.set_query("item_code", "items", function() {
            return {
                filters: {
                    "is_stock_item": 1,
                    "disabled": 0
                }
            };
        });

        frm.set_query("batch_no", "items", function(doc, cdt, cdn) {
            let row = locals[cdt][cdn];
            return {
                filters: {
                    "item": row.item_code,
                    "disabled": 0
                }
            };
        });
    },

    refresh: function(frm) {
        if (frm.doc.docstatus === 1 && frm.doc.stock_entry) {
            frm.add_custom_button(__("Stock Entry"), function() {
                frappe.set_route("Form", "Stock Entry", frm.doc.stock_entry);
            }, __("View"));
        }

        if (frm.doc.pos_invoice) {
            frm.add_custom_button(__("POS Invoice"), function() {
                frappe.set_route("Form", "POS Invoice", frm.doc.pos_invoice);
            }, __("View"));
        }
    },

    company: function(frm) {
        if (frm.doc.company) {
            // Fetch defaults when company is set
            frappe.call({
                method: "ury.ury.doctype.wastage_note.wastage_note.get_wastage_defaults",
                args: {
                    company: frm.doc.company
                },
                callback: function(r) {
                    if (r.message) {
                        if (r.message.source_warehouse && !frm.doc.source_warehouse) {
                            frm.set_value("source_warehouse", r.message.source_warehouse);
                        }
                        if (r.message.expense_account && !frm.doc.expense_account) {
                            frm.set_value("expense_account", r.message.expense_account);
                        }
                        if (r.message.cost_center && !frm.doc.cost_center) {
                            frm.set_value("cost_center", r.message.cost_center);
                        }
                    }
                }
            });
        }
    },

    pos_invoice: function(frm) {
        if (frm.doc.pos_invoice) {
            // Fetch items from POS Invoice
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "POS Invoice",
                    name: frm.doc.pos_invoice
                },
                callback: function(r) {
                    if (r.message) {
                        let invoice = r.message;

                        // Set company if not set
                        if (!frm.doc.company) {
                            frm.set_value("company", invoice.company);
                        }

                        // Ask if user wants to import items
                        frappe.confirm(
                            __("Do you want to import items from POS Invoice?"),
                            function() {
                                // Import items
                                frm.clear_table("items");
                                invoice.items.forEach(function(item) {
                                    if (item.is_stock_item || frappe.db.get_value("Item", item.item_code, "is_stock_item")) {
                                        let row = frm.add_child("items");
                                        row.item_code = item.item_code;
                                        row.item_name = item.item_name;
                                        row.qty = item.qty;
                                        row.uom = item.uom;
                                        row.batch_no = item.batch_no || "";
                                        row.serial_no = item.serial_no || "";
                                        row.reason = __("Imported from POS Invoice");
                                    }
                                });
                                frm.refresh_field("items");
                            }
                        );
                    }
                }
            });
        }
    }
});

frappe.ui.form.on("Wastage Note Item", {
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.item_code && frm.doc.source_warehouse) {
            // Fetch stock info for the item
            frappe.call({
                method: "ury.ury.doctype.wastage_note.wastage_note.get_item_stock_info",
                args: {
                    item_code: row.item_code,
                    warehouse: frm.doc.source_warehouse
                },
                callback: function(r) {
                    if (r.message) {
                        let info = r.message;
                        frappe.show_alert({
                            message: __("Available qty in {0}: {1}", [frm.doc.source_warehouse, info.qty_available]),
                            indicator: info.qty_available > 0 ? "green" : "red"
                        });
                    }
                }
            });
        }
    }
});
