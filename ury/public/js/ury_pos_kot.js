let old_items = [];
let new_items = [];
let finalarray = [];
frappe.ui.form.on("POS Invoice", {
  refresh: function (frm) {
    cur_frm.check = true;
  },
  after_save: function (frm) {
    let invoice_comment = cur_frm.order_comments;

    if (cur_frm.check == true) {
      old_items = cur_frm.old_items;
    }
    let newItems = frm.doc.items;
    let invoice_id = frm.doc.name;
    newItems.forEach((new_item) => {
      let json_newitem = {
        item_code: new_item.item_code,
        qty: new_item.qty,
        item_name: new_item.item_name,
        name: new_item.name,
        comments: "",
      };
      new_items.push(json_newitem);
    });

    frm.call({
      method: "ury.ury.api.ury_kot_generate.kot_execute",
      args: {
        invoice_id: invoice_id,
        customer: frm.doc.customer,
        current_items: new_items,
        previous_items: old_items,
        comments: invoice_comment,
      },
      callback: function (r) {
        cur_frm.order_comments = "";

        old_items = new_items;

        new_items = [];
        cur_frm.check = false;

        frappe.show_alert({ message: __("Order Updated"), indicator: "green" });
      },
    });
  },
});
