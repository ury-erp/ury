/**
 * Round Off Limit Exceed Guard
 * Validates that the difference between payment total and rounded_total
 * does not exceed the configured threshold from Alert Settings.
 */

frappe.ui.form.on("POS Invoice", {
	validate(frm) {
		// Check customer_name is set
		if (!frm.doc.customer_name) {
			frappe.throw(__("Customer name is required."));
		}

		// Check round-off limit tolerance
		if (frm.doc.rounded_total && frm.doc.paid_amount) {
			const difference = Math.abs(frm.doc.paid_amount - frm.doc.rounded_total);

			frappe.call({
				method: "ury.ury.doctype.alert_settings.alert_settings.get_alert_rule",
				args: {
					alert_type: "Round Off Limit",
					branch: frm.doc.branch
				},
				async: false,
				callback(r) {
					if (r.message && r.message.threshold_minutes) {
						// threshold_minutes field is being reused for threshold currency units
						const tolerance = r.message.threshold_minutes;
						if (difference > tolerance) {
							frappe.throw(
								__("Round off limit exceeded. Difference between payment and rounded total ({0}) exceeds threshold ({1}).",
									[difference.toFixed(2), tolerance])
							);
						}
					}
				}
			});
		}
	}
});
