frappe.ui.form.on('POS Invoice', {
    async onload(frm) {
        try {
            const fieldValue = await frappe.db.get_value('POS Profile', { 'name': frm.doc.pos_profile }, 'remove_items');

            if (fieldValue.message && fieldValue.message.remove_items === 0) {

                const items_details_section = document.querySelector(".item-details-container");
                if (!items_details_section) return;
                const item_observer = new MutationObserver(() => {
                    const computedStyle = window.getComputedStyle(items_details_section);
                    if (computedStyle.display === "flex") {
                        const fields = ['uom', 'warehouse'];
                        for (const field of fields) {
                            $(`input[type="text"][data-fieldname="${field}"]`).addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none')
                        }
                        if (frm.doc.restaurant_table && frm.selected_doc.invoice_printed == 1) {
                            $('input[type="text"][data-fieldname="qty"]').addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none');
                            const removeBtn = document.querySelector('div[class="numpad-btn col-span-2 remove-btn"][data-button-value="remove"]');
                            if (removeBtn) removeBtn.disabled = true;
                            const qtyBtn = document.querySelector('div[class="numpad-btn col-span-2"][data-button-value="qty"]');
                            if (qtyBtn) qtyBtn.disabled = true;
                            const deleteBtn = document.querySelector('div[class="numpad-btn "][data-button-value="delete"]');
                            if (deleteBtn) deleteBtn.disabled = true;
                        }
                    }
                    $(".item-details-container").off().click(function () {
                        const fields = ['uom', 'warehouse'];
                        for (const field of fields) {
                            $(`input[type="text"][data-fieldname="${field}"]`).addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none')
                        }
                        if (frm.doc.restaurant_table && frm.selected_doc.invoice_printed == 1) {
                            $('input[type="text"][data-fieldname="qty"]').addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none');
                        }
                    })
                    $(".customer-cart-container").off().click(function () {
                        const fields = ['uom', 'warehouse'];
                        for (const field of fields) {
                            $(`input[type="text"][data-fieldname="${field}"]`).addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none')
                        }
                        if (frm.doc.restaurant_table && frm.selected_doc.invoice_printed == 1) {
                            $('input[type="text"][data-fieldname="qty"]').addClass('like-disabled-input').removeClass('bold').css('pointer-events', 'none');
                        }
                    })
                });
                item_observer.observe(items_details_section, { attributes: true });
            }
        } catch (e) {
            console.error("Error in restrict_qty_edit_pos onload:", e);
        }
    }
});