// Function to remove duplicate items from a form
function validate_duplicate(frm) {
  let items = frm.doc.items;
  let item_map = {};

  for (let i = 0; i < items.length; i++) {
      let item_code = items[i].item_code;
      let item_name = items[i].item_name;
      if (item_map[item_code]) {
          let existing_row = item_map[item_code];
          frappe.msgprint(__('Duplicate item found: {0} ( {1} ) at row {2} and {3}', [item_code,item_name,existing_row, i+1]), __("Validation"));
          frappe.validated = false;
          // return;
      } else {
          item_map[item_code] = i+1;
      }
  }
}

function removeDuplicates(frm, fields) {
  const items = frm.doc.items;
  const uniqueItems = [];

  items.forEach((item) => {
    // Check if the item is already in the uniqueItems array
    const duplicate = uniqueItems.find((x) => x.item_code === item.item_code);

    // If the item is a duplicate, update its quantity; otherwise, add it to uniqueItems
    if (duplicate) {
      duplicate.qty += item.qty;
    } else {
      uniqueItems.push(item);
    }
  });

  // Clear existing items in the form and refresh the fields
  frm.clear_table("items");
  frm.refresh_fields();

  // Loop through unique items and add them back to the form
  uniqueItems.forEach((uniqueItem) => {
    // Add a child row to the "items" table in the form
    let row = frm.add_child("items");

    // Set values for each field in the child row based on the unique item
    fields.forEach((field) => {
      frappe.model.set_value(row.doctype, row.name, field, uniqueItem[field]);
    });
  });

  // Refresh the "items" field in the form
  frm.refresh_field("items");
}

// Event handlers for before saving forms &  Call the removeDuplicates function with specific fields for the forms

frappe.ui.form.on("Purchase Order", {
  before_save: function (frm) {
    validate_duplicate(frm)
   },
});

frappe.ui.form.on("Purchase Receipt", {
  before_save: function (frm) {
    validate_duplicate(frm)
   },

});

frappe.ui.form.on("Purchase Invoice", {
  before_save: function (frm) {
    validate_duplicate(frm)
  },
});

frappe.ui.form.on("Material Request", {
  before_save: function (frm) {
    validate_duplicate(frm)
  },
});
