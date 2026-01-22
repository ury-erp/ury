frappe.provide("erpnext.PointOfSale");
frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __("Point of Sale"),
    single_column: true,
  });

  frappe.require("point-of-sale.bundle.js", function () {
    erpnext.PointOfSale.PastOrderList = class MyPastOrder extends (
      erpnext.PointOfSale.PastOrderList
    ) {
      constructor(wrapper) {
        super(wrapper);
      }

      make_filter_section() {
        const me = this;
        this.search_field = frappe.ui.form.make_control({
          df: {
            label: ('Search'),
            fieldtype: 'Data',
            placeholder:('Search by invoice id or customer name')
          },
          parent: this.$component.find(".search-field"),
          render_input: true,
        });

        this.status_field = frappe.ui.form.make_control({
          df: {
            label: ('Invoice Status'),
            fieldtype: 'Select',
            options: `Draft\nTo Bill`,
            placeholder: ('Filter by invoice status'),
            onchange: function () {
              if (me.$component.is(":visible")) me.refresh_list();
            },
          },
          parent: this.$component.find(".status-field"),
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

        this.$invoices_container.html("");

        return frappe.call({
          method: "ury.ury.api.pos_extend.overrided_past_order_list",
          freeze: true,
          args: { search_term, status },
          callback: (response) => {
            frappe.dom.unfreeze();
            response.message.forEach((invoice) => {
              const invoice_html = this.get_invoice_html(invoice);
              this.$invoices_container.append(invoice_html);
            });
          },
        });
      }
    };

    erpnext.PointOfSale.Controller = class MyPosController extends (
      erpnext.PointOfSale.Controller
    ) {
      constructor(wrapper) {
        super(wrapper);
      }
      prepare_menu() {
        this.page.clear_menu();

        this.page.add_menu_item(
          __("Toggle Recent Orders"),
          this.toggle_recent_order.bind(this),
          false,
          "Ctrl+O"
        );

        this.page.add_menu_item(
          __("Cancel Order"),
          this.cancel_order.bind(this),
          false,
          "Ctrl+I"
        );
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

    erpnext.PointOfSale.PastOrderList = class MyPastOrderList extends (
      erpnext.PointOfSale.PastOrderList
    ) {
      constructor(wrapper) {
        super(wrapper);
      }
      get_invoice_html(invoice) {
        const posting_datetime = moment(
          invoice.posting_date + " " + invoice.posting_time
        ).format("Do MMMM, h:mma");
        return `<div class="invoice-wrapper" data-invoice-name="${escape(
          invoice.name
        )}">
						<div class="invoice-name-date">
							<div class="invoice-name">${invoice.name}</div>
							<div class="invoice-date">
								<svg class="mr-2" width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
									<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
								</svg>
								${frappe.ellipsis(invoice.customer, 20)}
							</div>
						</div>
						<div class="invoice-table" style="display:flex; text-align:center; align-items: center; font-weight: 600; font-size: 14px;">${
              invoice.restaurant_table ? invoice.restaurant_table : ""
            }</div>
						<div class="invoice-total-status">
							<div class="invoice-total">${
                format_currency(invoice.grand_total, invoice.currency, 0) || 0
              }</div>
							<div class="invoice-date">${posting_datetime}</div>
						</div>
					</div>
					<div class="seperator"></div>`;
      }
    };

    erpnext.PointOfSale.PastOrderSummary = class MyPastOrderSummary extends (
      erpnext.PointOfSale.PastOrderSummary
    ) {
      constructor(wrapper) {
        super(wrapper);
      }
      bind_events() {
        this.$summary_container.on("click", ".return-btn", () => {
          this.events.process_return(this.doc.name);
          this.toggle_component(false);
          this.$component
            .find(".no-summary-placeholder")
            .css("display", "flex");
          this.$summary_wrapper.css("display", "none");
        });

        this.$summary_container.on("click", ".edit-btn", () => {
          var addCommentWrapper = document.querySelector(
            ".add-comment-wrapper"
          );
          addCommentWrapper.style.display = "flex";
          this.events.edit_order(this.doc.name);
          // this.check();
          this.toggle_component(false);
          this.$component
            .find(".no-summary-placeholder")
            .css("display", "flex");
          this.$summary_wrapper.css("display", "none");

          let items = this.doc.items;
          cur_frm.old_items = [];

          items.forEach((old_item) => {
            let json_olditem = {
              item_code: old_item.item_code,
              qty: old_item.qty,
              item_name: old_item.item_name,
              name: old_item.name,
            };
            cur_frm.old_items.push(json_olditem);
          });
          cur_frm.check = true;
        });

        this.$summary_container.on("click", ".delete-btn", () => {
          this.events.delete_order(this.doc.name);
          this.show_summary_placeholder();
        });

        this.$summary_container.on("click", ".delete-btn", () => {
          this.events.delete_order(this.doc.name);
          this.show_summary_placeholder();
          // this.toggle_component(false);
          // this.$component.find('.no-summary-placeholder').removeClass('d-none');
          // this.$summary_wrapper.addClass('d-none');
        });

        this.$summary_container.on("click", ".new-btn", () => {
          var addCommentWrapper = document.querySelector(
            ".add-comment-wrapper"
          );
          addCommentWrapper.style.display = "flex";

          this.events.new_order();
          this.toggle_component(false);
          this.$component
            .find(".no-summary-placeholder")
            .css("display", "flex");
          this.$summary_wrapper.css("display", "none");
          cur_frm.check = true;
          cur_frm.old_items = [];
        });

        this.$summary_container.on("click", ".email-btn", () => {
          this.email_dialog.fields_dict.email_id.set_value(this.customer_email);
          this.email_dialog.show();
        });

        this.$summary_container.on("click", ".print-btn", () => {
          this.print_receipt();
        });
      }
    };
    erpnext.PointOfSale.ItemCart = class MyItemCart extends (
      erpnext.PointOfSale.ItemCart
    ) {
      constructor(wrapper) {
        super(wrapper);
      }
      init_cart_components() {
        this.$component.append(
          `<div class="cart-container">
						<div class="abs-cart-container">
							<div class="cart-label">${__("Item Cart")}</div>
							<div class="cart-header">
								<div class="name-header">${__("Item")}</div>
								<div class="qty-header">${__("Quantity")}</div>
								<div class="rate-amount-header">${__("Amount")}</div>
							</div>
							<div class="cart-items-section"></div>
							<div class="cart-totals-section"></div>
							<div class="numpad-section"></div>
						</div>
					</div>`
        );
        this.$cart_container = this.$component.find(".cart-container");

        this.make_cart_totals_section();
        this.make_cart_items_section();
        this.make_cart_numpad();
        const commentButton = this.$component.find(
          ".add-comment-wrapper button"
        );
        commentButton.on("click", () => {
          let d = new frappe.ui.Dialog({
            title: "Enter Comment",
            fields: [
              {
                label: "Comment",
                fieldname: "comment",
                fieldtype: "Data",
                default: cur_frm.order_comments,
              },
            ],
            primary_action_label: "Add",
            primary_action: (values) => {
              cur_frm.order_comments = values.comment;
              d.hide();
            },
          });
          d.show();
          $(document).on("shown.bs.modal", ".modal", function () {
            let modal = $(this);
            modal.find('input[data-fieldname="comment"]').focus();
          });
        });
      }
      make_cart_totals_section() {
        this.$totals_section = this.$component.find(".cart-totals-section");

        this.$totals_section.append(
          `<div class="add-comment-wrapper" style="display: flex; justify-content: center; align-items: center;">
						<button class="btn btn-primary btn-sm primary-action" style="width: 300px; height: 40px; font-size: 16px; background-color: #428bca; color: #fff; border: none; border-radius: 4px;">Add Comment</button>
					</div>
					<div class="add-discount-wrapper">
						${this.get_discount_icon()} ${__("Add Discount")}
					</div>
					<div class="item-qty-total-container">
						<div class="item-qty-total-label">${__("Total Items")}</div>
						<div class="item-qty-total-value">0.00</div>
					</div>
					<div class="net-total-container">
						<div class="net-total-label">${__("Net Total")}</div>
						<div class="net-total-value">0.00</div>
					</div>
					<div class="taxes-container"></div>
					<div class="grand-total-container">
						<div>${__("Grand Total")}</div>
						<div>0.00</div>
					</div>
					<div class="checkout-btn">${__("Checkout")}</div>
					<div class="edit-cart-btn">${__("Edit Cart")}</div>`
        );

        this.$add_discount_elem = this.$component.find(".add-discount-wrapper");
      }
      toggle_checkout_btn(show_checkout) {
        if (show_checkout) {
          this.$totals_section
            .find(".add-comment-wrapper")
            .css("display", "flex");
          this.$totals_section.find(".checkout-btn").css("display", "flex");
          this.$totals_section.find(".edit-cart-btn").css("display", "none");
        } else {
          this.$totals_section
            .find(".add-comment-wrapper")
            .css("display", "none");
          this.$totals_section.find(".checkout-btn").css("display", "none");
          this.$totals_section.find(".edit-cart-btn").css("display", "flex");
        }
      }
    };

    wrapper.pos = new erpnext.PointOfSale.Controller(wrapper);
    window.cur_pos = wrapper.pos;
  });
};
