frappe.provide('frappe.ui.form');
frappe.ui.form.CustomerQuickEntryForm = class POSQuickEntryForm extends frappe.ui.form.QuickEntryForm {
    constructor(doctype, after_insert, init_callback, doc, force) {
        super(doctype, after_insert, init_callback, doc, force);
        this.skip_redirect_on_error = true;
    }


    render_dialog() {

        this.mandatory = this.getfields();
        super.render_dialog();
    }

    getfields() {

        var variant_fields = [
            {
                label: __("Customer Name"),
                fieldname: "customer_name",
                fieldtype: "Data"
            },
            {
                label: __("Mobile Number"),
                fieldname: "mobile_number",
                fieldtype: "Int"
            },
            {
                label: __("Customer Group"),
                fieldname: "customer_group",
                fieldtype: "Link"
            },
            {
                label: __("Customer Territory"),
                fieldname: "territory",
                fieldtype: "Link"
            }
        ];

        return variant_fields;
    }
}
