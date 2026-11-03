// Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("URY Wastage", {
    refresh: function(frm) {
        if (frm.doc.wastage_source === "Physical Audit" && frm.doc.posting_time) {
            frm.dashboard.add_comment(
                __("Posting time ({0}) is set from the configured Wastage Time in POS Profile.",
                   [frm.doc.posting_time]),
                "blue"
            );
        }
        if (frm.doc.wastage_source === "KOT Cancellation") {
            frm.dashboard.add_comment(
                __("This wastage was recorded during KOT cancellation. Posting time reflects the actual recording time."),
                "orange"
            );
        }
        frm.set_df_property("posting_date", "read_only", !frm.doc.edit_posting_date);
        frm.set_df_property("posting_time", "read_only", !frm.doc.edit_posting_date);
        frm.refresh_fields(["posting_date", "posting_time"]);
        calculate_total_cost(frm);
    },

    edit_posting_date: function(frm) {
        frm.set_df_property("posting_date", "read_only", !frm.doc.edit_posting_date);
        frm.set_df_property("posting_time", "read_only", !frm.doc.edit_posting_date);
        frm.refresh_fields(["posting_date", "posting_time"]);
    },

    department: function(frm) {
        if (frm.doc.department) {
            // Fetch default warehouse associated with the selected department
            frappe.db.get_value("URY Production Department", frm.doc.department, "department_warehouse", (r) => {
                if (r && r.department_warehouse) {
                    frm.set_value("warehouse", r.department_warehouse);
                }
            });
        }
    },

    warehouse: function(frm) {
        if (frm.doc.warehouse && frm.doc.items && frm.doc.items.length) {
            frm.doc.items.forEach(row => {
                if (row.item_code) {
                    fetch_item_valuation_rate(frm, "Wastage Item", row.name);
                }
            });
        }
    }
});

frappe.ui.form.on("Wastage Item", {
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.item_code) return;

        if (!row.qty) {
            frappe.model.set_value(cdt, cdn, "qty", 1.0);
        }

        fetch_item_valuation_rate(frm, cdt, cdn);
    },

    qty: function(frm, cdt, cdn) {
        calculate_row_amount(frm, cdt, cdn);
    },

    rate: function(frm, cdt, cdn) {
        calculate_row_amount(frm, cdt, cdn);
    },

    items_remove: function(frm) {
        calculate_total_cost(frm);
    }
});

function fetch_item_valuation_rate(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    if (!row || !row.item_code) return;

    if (!frm.doc.warehouse) {
        return;
    }

    frappe.call({
        method: "ury.ury.doctype.ury_wastage.ury_wastage.get_item_valuation_rate",
        args: {
            item_code: row.item_code,
            warehouse: frm.doc.warehouse,
            company: frm.doc.company,
            posting_date: frm.doc.posting_date,
            posting_time: frm.doc.posting_time
        },
        callback: function(r) {
            let rate = flt(r.message || 0);
            frappe.model.set_value(cdt, cdn, "rate", rate);
            calculate_row_amount(frm, cdt, cdn);
        }
    });
}

function calculate_row_amount(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    if (!row) return;

    let amount = flt(row.qty) * flt(row.rate);
    frappe.model.set_value(cdt, cdn, "amount", amount);
    calculate_total_cost(frm);
}

function calculate_total_cost(frm) {
    let total = 0;
    (frm.doc.items || []).forEach(item => {
        total += flt(item.amount);
    });
    frm.set_value("total_cost", total);
}
