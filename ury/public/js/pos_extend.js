
frappe.provide('erpnext.PointOfSale');
frappe.pages['point-of-sale'].on_page_load = function (wrapper) {
    frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Point of Sale'),
        single_column: true

    });

    frappe.require('point-of-sale.bundle.js', function () {


        erpnext.PointOfSale.PastOrderList = class MyPastOrder extends erpnext.PointOfSale.PastOrderList {
            constructor(wrapper) {
                super(wrapper);
            }

            make_filter_section() {
                const me = this;
                this.search_field = frappe.ui.form.make_control({
                    df: {
                        label: ('Search'),
                        fieldtype: 'Data',
                        placeholder: ('Search by invoice id or customer name')
                    },
                    parent: this.$component.find('.search-field'),
                    render_input: true,
                });

                this.status_field = frappe.ui.form.make_control({
                    df: {
                        label: ('Invoice Status'),
                        fieldtype: 'Select',
                        options: `Draft\nTo Bill`,
                        placeholder: ('Filter by invoice status'),
                        onchange: function () {
                            if (me.$component.is(':visible')) me.refresh_list();
                        }
                    },
                    parent: this.$component.find('.status-field'),
                    render_input: true,
                });
                this.search_field.toggle_label(false);
                this.status_field.toggle_label(false);
                this.status_field.set_value('Draft');
            }
            refresh_list() {
                frappe.dom.freeze();
                this.events.reset_summary();
                const search_term = this.search_field.get_value();
                const status = this.status_field.get_value();

                this.$invoices_container.html('');

                return frappe.call({
                    method: "ury.ury.api.pos_extend.overrided_past_order_list",
                    freeze: true,
                    args: { search_term, status },
                    callback: (response) => {
                        frappe.dom.unfreeze();
                        response.message.forEach(invoice => {
                            const invoice_html = this.get_invoice_html(invoice);
                            this.$invoices_container.append(invoice_html);
                        });
                    }
                });
            }

        }

        erpnext.PointOfSale.Controller = class MyPosController extends erpnext.PointOfSale.Controller {
            constructor(wrapper) {
                super(wrapper);
            }
            prepare_menu() {
                this.page.clear_menu();

                this.page.add_menu_item(__("Toggle Recent Orders"), this.toggle_recent_order.bind(this), false, 'Ctrl+O');

                this.page.add_menu_item(__("Cancel Order"), this.cancel_order.bind(this), false, 'Ctrl+I');

            }
            cancel_order() {
                if (!this.$components_wrapper.is(":visible")) return;

                if (this.frm.doc.name.startsWith("new-pos")) {
                    frappe.show_alert({
                        message: __("You must save document as draft to cancel."),
                        indicator: 'red'
                    });
                    frappe.utils.play_sound("error");
                    return;
                }
                if (this.frm.doc.restaurant_table) {
                    frappe.throw({
                        message: __("Not allowed to cancel table orders through PoS")
                    });
                }
                else {
                    if (this.frm.doc.invoice_printed == 1) {
                        frappe.throw({
                            title: __("Invoice Already Billed"),
                            message: __("Not allowed to cancel billed orders."),
                            indicator: 'red'
                        });
                    }
                    else {
                        let cancel_flag = false;
                        var dialog = new frappe.ui.Dialog({
                            title: __("Confirm Cancellation"),
                            fields: [
                                {
                                    fieldname: 'reason',
                                    fieldtype: 'Data',
                                    label: __('Reason'),
                                    reqd: 1
                                }
                            ],
                            primary_action: function () {
                                var reason = dialog.get_value('reason');
                                if (!cancel_flag) {
                                    cancel_flag = true;
                                    this.frm.reason = reason;
                                    this.frm.cancel_reason = reason;
                                    this.cancel(this.frm.cancel_reason);
                                    dialog.hide();
                                }
                            }.bind(this),
                            primary_action_label: __('Cancel'),
                        });
                        dialog.show();
                    }
                }

            }
            cancel() {

                frappe.call({
                    method: 'ury.ury.doctype.ury_order.ury_order.cancel_order',
                    args: {
                        invoice_id: this.frm.doc.name,
                        reason: this.frm.cancel_reason
                    },
                    callback: function (r) {
                        frappe.show_alert({ message: __('Cancelled'), indicator: 'red' });
                        setTimeout(function () {
                            window.location.reload();
                        }, 1000)
                    }
                });
            }
        };

        erpnext.PointOfSale.PastOrderList = class MyPastOrderList extends erpnext.PointOfSale.PastOrderList {
            constructor(wrapper) {
                super(wrapper);
            }
            get_invoice_html(invoice) {
                const posting_datetime = moment(invoice.posting_date + " " + invoice.posting_time).format("Do MMMM, h:mma");
                return (
                    `<div class="invoice-wrapper" data-invoice-name="${escape(invoice.name)}">
						<div class="invoice-name-date">
							<div class="invoice-name">${invoice.name}</div>
							<div class="invoice-date">
								<svg class="mr-2" width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
									<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
								</svg>
								${frappe.ellipsis(invoice.customer, 20)}
							</div>
						</div>
						<div class="invoice-table" style="display:flex; text-align:center; align-items: center; font-weight: 600; font-size: 14px;">${invoice.restaurant_table ? invoice.restaurant_table : ''}</div>
						<div class="invoice-total-status">
							<div class="invoice-total">${format_currency(invoice.grand_total, invoice.currency, 0) || 0}</div>
							<div class="invoice-date">${posting_datetime}</div>
						</div>
					</div>
					<div class="seperator"></div>`
                );
            }
        };


        wrapper.pos = new erpnext.PointOfSale.Controller(wrapper);
        window.cur_pos = wrapper.pos;
    });
};

