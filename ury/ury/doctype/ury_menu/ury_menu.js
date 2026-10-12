//  Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
//  For license information, please see license.txt

const MENU_METHOD = 'ury.ury.doctype.ury_menu.ury_menu';

frappe.ui.form.on('URY Menu', {
	setup: function (frm) {
		frm.add_fetch('item', 'standard_rate', 'rate');
	},

	refresh: function (frm) {
		if (frm.is_new()) return;

		frm.add_custom_button(__('Sync Prices'), () => sync_prices(frm));
		show_price_sync_status(frm);
	},
});

/**
 * Republish the menu's rates into its price list.
 *
 * The rates on this form are what the POS grid and the self-ordering page
 * show, but an order is priced from the Item Price rows this publishes. When
 * the two drift apart nothing on screen looks wrong — the prices are right
 * there — so the repair needs a button of its own rather than living only in
 * the save hook.
 */
function sync_prices(frm) {
	frappe.call({
		method: `${MENU_METHOD}.sync_menu_prices`,
		args: { menu: frm.doc.name },
		freeze: true,
		freeze_message: __('Publishing prices…'),
		callback(r) {
			if (!r.message) return;
			frappe.show_alert({
				message: __('Published {0} prices to {1}', [
					r.message.published,
					r.message.price_list,
				]),
				indicator: 'green',
			});
			show_price_sync_status(frm);
		},
	});
}

function show_price_sync_status(frm) {
	frappe.call({
		method: `${MENU_METHOD}.get_menu_price_sync_status`,
		args: { menu: frm.doc.name },
		callback(r) {
			const status = r.message;
			if (!status) return;

			frm.dashboard.clear_headline();

			if (!status.price_list) {
				frm.dashboard.set_headline(
					__('This menu has no price list yet. Save it, or press Sync Prices, to create one.'),
					'orange'
				);
				return;
			}

			const broken = status.missing.length + status.stale.length;
			if (!broken) {
				frm.dashboard.set_headline(
					__('{0} prices published to {1}.', [status.published, status.price_list]),
					'green'
				);
				return;
			}

			// Named rather than counted: the person fixing this needs to know
			// which dish will be charged wrong, not how many.
			const parts = [];
			if (status.missing.length) {
				parts.push(__('no published price: {0}', [status.missing.join(', ')]));
			}
			if (status.stale.length) {
				parts.push(__('published price differs from the rate here: {0}', [status.stale.join(', ')]));
			}
			frm.dashboard.set_headline(
				__('Press Sync Prices — {0}', [parts.join('; ')]),
				'red'
			);
		},
	});
}
