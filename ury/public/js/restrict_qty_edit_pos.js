frappe.ui.form.on('POS Invoice', {
    async onload(frm) {
        const fieldValue = await frappe.db.get_value('POS Profile', { 'name': frm.doc.pos_profile }, 'remove_items');

        if (fieldValue.message.remove_items === 0) {

            const items_details_section = document.querySelector(".item-details-container");
            const item_observer = new MutationObserver(() => {
                const computedStyle = window.getComputedStyle(items_details_section);
                if (computedStyle.display === "flex") {
                    const fields = ['uom', 'warehouse'];
                    for (const field of fields) {
                        $(`input[type="text"][data-fieldname="${field}"]`).addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none')
                    }
                    console.log(cur_frm.selected_doc.invoice_printed, "Selected")
                    if (cur_frm.doc.restaurant_table && cur_frm.selected_doc.invoice_printed == 1) {
                        $('input[type="text"][data-fieldname="qty"]').addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none');
                        document.querySelector('div[class="numpad-btn col-span-2 remove-btn"][data-button-value="remove"]').disabled = true;
                        document.querySelector('div[class="numpad-btn col-span-2"][data-button-value="qty"]').disabled = true;
                        document.querySelector('div[class="numpad-btn "][data-button-value="delete"]').disabled = true;
                    }
                }
                $(".item-details-container").click(function () {
                    const fields = ['uom', 'warehouse'];
                    for (const field of fields) {
                        $(`input[type="text"][data-fieldname="${field}"]`).addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none')
                    }
                    if (cur_frm.doc.restaurant_table && cur_frm.selected_doc.invoice_printed == 1) {
                        $('input[type="text"][data-fieldname="qty"]').addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none');
                    }
                })
                $(".customer-cart-container").click(function () {
                    const fields = ['uom', 'warehouse'];
                    for (const field of fields) {
                        $(`input[type="text"][data-fieldname="${field}"]`).addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none')
                    }
                    if (cur_frm.doc.restaurant_table && cur_frm.selected_doc.invoice_printed == 1) {
                        $('input[type="text"][data-fieldname="qty"]').addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none');
                    }
                })
            });
            item_observer.observe(items_details_section, { attributes: true });
        }
    }
});
