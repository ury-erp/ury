let old_items = [];
frappe.ui.form.on("POS Invoice", {
  refresh: function (frm) {
    cur_frm.check = true;
  },
  after_save: function (frm) {
    let invoice_comment = cur_frm.order_comments;

    if (cur_frm.check == true) {
      old_items = cur_frm.old_items;
    }
    let invoice_id = frm.doc.name;

    frm.call({
      // Server validates POS Invoice write permission and branch access,
      // and derives the current items from the saved invoice itself.
      method: "ury.ury.api.ury_kot_generate.kot_execute_for_invoice",
      args: {
        invoice_id: invoice_id,
        restaurant_table: frm.doc.restaurant_table,
        previous_items: old_items || [],
        comments: invoice_comment,
      },
      callback: function (r) {
        cur_frm.order_comments = "";

        old_items = frm.doc.items.map((item) => ({
          item_code: item.item_code,
          qty: item.qty,
          item_name: item.item_name,
          name: item.name,
          comments: "",
        }));

        cur_frm.check = false;

        frappe.show_alert({ message: __("Order Updated"), indicator: "green" });
      },
    });
  },
});
