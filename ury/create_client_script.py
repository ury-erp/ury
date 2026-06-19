import frappe

def execute():
    script_name = "POS Invoice Bill Merge"
    
    script_text = """
frappe.ui.form.on('POS Invoice', {
    custom_merged_pos_invoice: function(frm) {
        if(frm.doc.custom_merged_pos_invoice) {
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "POS Invoice",
                    name: frm.doc.custom_merged_pos_invoice
                },
                callback: function(r) {
                    if(r.message) {
                        frm.clear_table('custom_merged_items');
                        let total = 0;
                        r.message.items.forEach(function(item) {
                            let row = frm.add_child('custom_merged_items');
                            row.item_code = item.item_code;
                            row.item_name = item.item_name;
                            row.qty = item.qty;
                            row.rate = item.rate;
                            row.amount = item.amount;
                            total += item.amount;
                        });
                        frm.set_value('custom_merged_total', r.message.grand_total || total);
                        frm.refresh_field('custom_merged_items');
                    }
                }
            });
        } else {
            frm.clear_table('custom_merged_items');
            frm.set_value('custom_merged_total', 0);
            frm.refresh_field('custom_merged_items');
        }
    }
});
"""
    
    if frappe.db.exists("Client Script", script_name):
        doc = frappe.get_doc("Client Script", script_name)
        doc.script = script_text
        doc.save()
        print(f"Updated Client Script: {script_name}")
    else:
        doc = frappe.get_doc({
            "doctype": "Client Script",
            "name": script_name,
            "dt": "POS Invoice",
            "module": "URY",
            "script": script_text,
            "enabled": 1
        })
        doc.insert()
        print(f"Created Client Script: {script_name}")
