frappe.require([
    '/assets/ury/js/qz-tray.js',
    '/assets/ury/js/jsrsasign-all-min.js',
    '/assets/ury/js/sign-message.js'
]);

frappe.ui.form.on('POS Invoice', {

    before_save: function (frm) {
        if (frm.doc.customer_name === null || frm.doc.customer_name === "") {
            frappe.throw({
                message: __("Failed to load data . Please refresh the page")
            });
        }
    },

    print: function (frm) {
        let invoice = frm.doc.name
        frappe.db.get_doc('POS Invoice', invoice).then(pos_invoice => {
            if (pos_invoice.invoice_printed == 1) {
                frappe.throw({
                    title: __("Invoice Already Billed"),
                    message: __("This order has already been billed. Please reload the page."),
                    indicator: 'red'
                });
            }
            frappe.dom.freeze(__('Printing Invoice'));
            frappe.db.get_doc('POS Profile', frm.doc.pos_profile).then(profile => {

                if (profile.qz_print == 1) {
                    // To fetch qz_key from site config
                    frappe.call({
                        method: "ury.ury.api.ury_print.qz_certificate",
                        callback: function (response) {
                            if (response.message) {
                                var qzKey = response.message;
                                qz.security.setCertificatePromise(function (resolve, reject) {
                                    //Preferred method - from server
                                    fetch("/private/" + qzKey, { cache: 'no-store', headers: { 'Content-Type': 'text/plain' } })
                                        .then(function (data) { data.ok ? resolve(data.text()) : reject(data.text()); });
                                });

                            }
                        }
                    });

                    frappe.call({
                        method: "frappe.www.printview.get_html_and_style",
                        args: {
                            doc: "POS Invoice",
                            name: invoice,
                            print_format: profile.print_format,
                            _lang: 'en',
                        },
                        callback: function (r) {

                            if (qz.websocket.isActive()) {
                                // Use the existing connection to print
                                printWithQZTray();
                            } else {
                                // Establish a new connection and then print
                                qz.websocket.connect({ host: profile.qz_host })
                                    .then(() => {
                                        // test();
                                        printWithQZTray();
                                    })
                                    .catch((error) => {
                                        // Handle connection error
                                        console.error("Error connecting to QZ Tray:", error);
                                        frappe.dom.unfreeze();
                                        frappe.throw({
                                            message: __("Printing Failed: Error connecting to QZ Tray")
                                        });
                                    });
                            }
                            function printWithQZTray() {
                                qz.printers.getDefault()
                                    .then((printer) => {
                                        var htmlcontent = r.message.html;
                                        var data = [{
                                            type: 'html',
                                            format: 'plain',
                                            data: htmlcontent
                                        }];

                                        var config = qz.configs.create(printer);
                                        qz.print(config, data)
                                            .then(function () {
                                                frappe.call({
                                                    method: `ury.ury.api.ury_print.qz_print_update`,
                                                    args: {
                                                        invoice: invoice
                                                    },
                                                    callback: function (r) {
                                                    }
                                                });
                                                cur_frm.set_value('invoice_printed', 1);
                                                frappe.dom.unfreeze();
                                                frappe.show_alert({ message: __('Invoice Printed'), indicator: 'green' });
                                            })
                                            .catch(function (error) {
                                                // Handle printing error
                                                console.error("Error printing with QZ Tray:", error);
                                                frappe.dom.unfreeze();
                                                frappe.throw({
                                                    message: __("Printing Failed: Error printing with QZ Tray")
                                                });
                                            });
                                    })
                                    .catch(function (error) {
                                        // Handle printer lookup error
                                        console.error("Error looking up printer:", error);
                                        frappe.dom.unfreeze();
                                        frappe.throw({
                                            message: __("Printing Failed: Error looking up printer")
                                        });
                                    });
                            }
                        },
                    });
                }
                else if (profile.printer_settings.some(e => e.bill == 1)) {
                    profile.printer_settings.forEach(print => {
                        frappe.call({
                            method: `ury.ury.api.ury_print.network_printing`,
                            args: {
                                doctype: "POS Invoice",
                                name: invoice,
                                printer_setting: print.printer,
                                print_format: profile.print_format
                            },
                            callback: function (r) {
                                if (r.message == "Success") {
                                    $('.standard-actions').addClass('hidden-xs hidden-md');
                                    frappe.show_alert({ message: __('Invoice Printed'), indicator: 'green' });
                                    cur_frm.set_value('invoice_printed', 1);
                                    frappe.dom.unfreeze();
                                    cur_frm.reload_doc();
                                }
                                else {
                                    console.error(r.message);
                                    frappe.dom.unfreeze();
                                    frappe.throw({
                                        message: __("Printing Failed")
                                    });
                                }
                            },
                            error: function (xhr, textStatus, error) {
                                console.error("AJAX Error:", error); // Log the AJAX error
                                frappe.dom.unfreeze();
                                frappe.throw({
                                    message: __("An error occurred while printing")
                                });
                            }
                        })
                    })
                }
                else {
                    frappe.call({
                        method: `ury.ury.api.ury_print.print_pos_page`,
                        args: {
                            doctype: "POS Invoice",
                            name: invoice,
                            print_format: profile.print_format
                        },
                        callback: function (r) {
                            $('.standard-actions').addClass('hidden-xs hidden-md');
                            cur_frm.set_value('invoice_printed', 1);
                            frappe.show_alert({ message: __('Invoice Printed'), indicator: 'green' });
                            frappe.ui.toolbar.clear_cache()
                            frappe.dom.unfreeze();
                        }
                    });
                }
            })
        })
    }

})

