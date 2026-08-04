# Desk UI (Client Scripts)

Frappe auto-generates Desk forms and list views for each DocType. Usually no custom UI code is needed.

## Client scripts

Add client-side logic to DocType forms:

File: `apps/<app>/<app>/<module>/doctype/<doctype>/<doctype>.js`

```javascript
frappe.ui.form.on("Expense", {
    // When form loads
    refresh(frm) {
        if (frm.doc.status === "Draft") {
            frm.add_custom_button("Submit", () => {
                frm.call("submit");
            });
        }
    },

    // When a field value changes
    amount(frm) {
        frm.set_value("tax", frm.doc.amount * 0.1);
    },

    // Before save
    validate(frm) {
        if (frm.doc.amount <= 0) {
            frappe.throw("Amount must be positive");
        }
    }
});
```

## Child table events

```javascript
frappe.ui.form.on("Expense Item", {
    // When a row field changes
    item_amount(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, "tax", row.item_amount * 0.1);
        calculate_total(frm);
    },

    // When a row is removed
    items_remove(frm) {
        calculate_total(frm);
    }
});

function calculate_total(frm) {
    let total = 0;
    frm.doc.items.forEach(row => { total += row.item_amount; });
    frm.set_value("total", total);
}
```

## Common client API

```javascript
// Call server method
frm.call("get_summary").then(r => console.log(r.message));

// Call whitelisted API
frappe.call({
    method: "myapp.api.get_expenses",
    args: { status: "Draft" },
    callback(r) { console.log(r.message); }
});

// Show dialog
frappe.prompt("Enter reason", (values) => {
    console.log(values.value);
});

// Show message
frappe.msgprint("Done!");
frappe.show_alert({ message: "Saved", indicator: "green" });

// Set field properties
frm.set_df_property("amount", "read_only", 1);
frm.toggle_display("notes", frm.doc.status === "Rejected");

// Set query filter for Link field
frm.set_query("category", () => {
    return { filters: { "enabled": 1 } };
});
```
