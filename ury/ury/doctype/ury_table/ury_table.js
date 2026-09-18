//  Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
//  For license information, please see license.txt

const QR_METHOD = 'ury.ury.api.self_ordering_qr';

frappe.ui.form.on('URY Table', {
    refresh(frm) {
        frm.set_query('restaurant_room', function () {
            if (!frm.doc.branch) {
                return {
                    filters: {
                        name: ['=', '']
                    }
                };
            }
            return {
                filters: {
                    branch: frm.doc.branch
                }
            };
        });

        render_self_ordering_qr(frm);
    },

    branch(frm) {
        // Clear room when restaurant changes
        frm.set_value('restaurant_room', null);
    }
});

/**
 * Draws the table's self-ordering code into the Self Ordering tab.
 *
 * The code is fetched on every refresh rather than cached on the document.
 * The token is a pure function of the profile, the table and the profile's
 * signing secret, so a stored image survives a secret rotation as a picture
 * of a dead link — and nothing would tell the person holding the printed
 * card that it had stopped working.
 */
function render_self_ordering_qr(frm) {
    const wrapper = frm.get_field('self_ordering_qr');
    if (!wrapper) return;

    if (frm.is_new()) {
        wrapper.$wrapper.html(
            empty_state(__('Save this table first to generate its ordering code.'))
        );
        return;
    }

    wrapper.$wrapper.html(
        `<div class="text-muted" style="padding:2rem 0">${__('Loading…')}</div>`
    );

    frappe.call({
        method: `${QR_METHOD}.get_table_qr`,
        args: { table: frm.doc.name },
        callback(r) {
            const data = r.message;
            if (!data) return;

            if (!data.available) {
                wrapper.$wrapper.html(empty_state(data.reason));
                return;
            }

            wrapper.$wrapper.html(qr_panel(frm, data));
            bind_actions(frm, wrapper.$wrapper, data);
        },
        error() {
            wrapper.$wrapper.html(
                empty_state(__('Could not generate the ordering code for this table.'))
            );
        }
    });
}

function empty_state(message) {
    return `
        <div style="border:1px dashed var(--border-color);border-radius:var(--border-radius-md);
                    padding:2rem;text-align:center;color:var(--text-muted)">
            ${frappe.utils.escape_html(message || '')}
        </div>`;
}

function qr_panel(frm, data) {
    // The URL is shown beside the image on purpose. A site left on its
    // internal hostname still produces a perfectly valid code — one that no
    // customer phone can resolve. Seeing the address is the only way to
    // catch that before a few hundred cards are printed.
    const takeaway_note = data.is_take_away
        ? `<div class="text-muted" style="margin-top:.75rem;font-size:var(--text-sm)">
               ${__('This is a takeaway table. Customers scanning this code order against it as a seated table.')}
           </div>`
        : '';

    return `
        <div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start;
                    border:1px solid var(--border-color);border-radius:var(--border-radius-md);
                    padding:1.5rem;background:var(--card-bg)">

            <div style="flex:0 0 auto;text-align:center">
                <div class="ury-qr-image"
                     style="width:220px;height:220px;background:#fff;padding:12px;
                            border-radius:var(--border-radius-md);border:1px solid var(--border-color)">
                    ${data.svg}
                </div>
                <div class="text-muted" style="margin-top:.5rem;font-size:var(--text-sm)">
                    ${frappe.utils.escape_html(frm.doc.name)}
                </div>
            </div>

            <div style="flex:1 1 320px;min-width:280px">
                <div style="font-weight:600;margin-bottom:.25rem">${__('Ordering Link')}</div>
                <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:1rem">
                    <input type="text" class="form-control ury-qr-url" readonly
                           value="${frappe.utils.escape_html(data.url)}"
                           style="font-family:var(--font-stack-monospace);font-size:var(--text-sm)">
                    <button class="btn btn-default btn-sm ury-qr-copy" style="white-space:nowrap">
                        ${__('Copy')}
                    </button>
                </div>

                <div style="font-weight:600;margin-bottom:.25rem">${__('Profile')}</div>
                <div class="text-muted" style="margin-bottom:1.25rem">
                    ${frappe.utils.escape_html(data.profile)}
                </div>

                <div style="display:flex;gap:.5rem;flex-wrap:wrap">
                    <button class="btn btn-primary btn-sm ury-qr-download" data-fmt="png">
                        ${__('Download PNG')}
                    </button>
                    <button class="btn btn-default btn-sm ury-qr-download" data-fmt="svg">
                        ${__('Download SVG')}
                    </button>
                    <button class="btn btn-default btn-sm ury-qr-print">
                        ${__('Print Card')}
                    </button>
                </div>

                ${takeaway_note}
            </div>
        </div>`;
}

function bind_actions(frm, $wrapper, data) {
    $wrapper.find('.ury-qr-copy').on('click', () => {
        frappe.utils.copy_to_clipboard(data.url);
    });

    $wrapper.find('.ury-qr-download').on('click', function () {
        const fmt = $(this).data('fmt');
        // Navigating to the endpoint rather than fetching it: the response is
        // a file download, and letting the browser handle it keeps the
        // filename the server chose instead of inventing one client-side.
        const url =
            `/api/method/${QR_METHOD}.download_table_qr` +
            `?table=${encodeURIComponent(frm.doc.name)}&fmt=${encodeURIComponent(fmt)}`;
        window.open(url, '_blank');
    });

    $wrapper.find('.ury-qr-print').on('click', () => print_card(frm.doc.name, data));
}

/**
 * Opens a print-ready card for one table.
 *
 * Deliberately not frappe's print view: a print format renders a document,
 * and what has to reach the printer here is a physical object — one code,
 * sized so a phone reads it across a table, with the table's name under it.
 */
function print_card(table_name, data) {
    const win = window.open('', '_blank');
    if (!win) {
        frappe.msgprint(__('Allow pop-ups to print the card.'));
        return;
    }

    win.document.write(`
        <!doctype html>
        <html><head><meta charset="utf-8"><title>${frappe.utils.escape_html(table_name)}</title>
        <style>
            @page { margin: 12mm; }
            body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
                   display:flex; align-items:center; justify-content:center;
                   min-height:100vh; margin:0; }
            .card { text-align:center; border:2px solid #111; border-radius:8mm;
                    padding:14mm 12mm; }
            /* 60mm keeps a version-8 symbol at roughly 1.2mm per module —
               comfortably above the ~0.5mm where phone cameras start to fail
               at arm's length. */
            .qr { width:60mm; height:60mm; margin:0 auto; }
            .qr svg { width:100%; height:100%; display:block; }
            .title { font-size:7mm; font-weight:700; margin-top:6mm; }
            .hint { font-size:4mm; color:#444; margin-top:2mm; }
        </style></head>
        <body>
            <div class="card">
                <div class="qr">${data.svg}</div>
                <div class="title">${frappe.utils.escape_html(table_name)}</div>
                <div class="hint">${__('Scan to view the menu and order')}</div>
            </div>
            <script>window.onload = function () { window.print(); };<\/script>
        </body></html>`);
    win.document.close();
}
