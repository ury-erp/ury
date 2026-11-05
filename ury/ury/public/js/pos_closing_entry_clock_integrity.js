// Sets POS Closing Entry's period_end_date/posting_date/posting_time from the
// Frappe server's own clock instead of the browser's local clock, so a
// tampered client system clock cannot be used to backdate a closing entry.
//
// Ported from grillax's `pos_closing_entry_hide_fields.js` `onload` trigger,
// which fetched https://worldtimeapi.org/api/ip for the same purpose. That
// external, third-party network dependency was intentionally excluded from
// the initial ury port (see PLAN.md Fix 6) as a risk to offline/self-hosted
// deployments. This version calls ury's own backend instead
// (`ury.ury.api.ury_server_time.get_server_time`), which the app already
// requires to be reachable for every other Desk interaction, so it adds no
// new failure mode.
//
// Note on fidelity: grillax's original has no drift-comparison/threshold
// logic — it unconditionally overwrites the three fields with the fetched
// time whenever the fetch succeeds, and silently leaves the fields
// untouched (falling back to the client-set defaults) if the fetch fails.
// This port preserves that exact behavior, only swapping the time source.
frappe.ui.form.on("POS Closing Entry", {
	onload: function (frm) {
		if (frm.doc.docstatus !== 0) {
			return;
		}
		frappe.call({
			method: "ury.ury.api.ury_server_time.get_server_time",
			callback: function (response) {
				if (!response || !response.message) {
					return;
				}
				// now_datetime().isoformat() on the server, e.g.
				// "2026-09-08T10:15:23.123456" — already in the site's
				// system timezone, same as every other datetime field
				// shown on this form, so no client-side tz conversion.
				const [datePart, timePartWithMicros] = response.message.split("T");
				const timePart = (timePartWithMicros || "00:00:00").split(".")[0];

				if (frm.doc.docstatus === 0) {
					frm.set_value("period_end_date", `${datePart} ${timePart}`);
					frm.set_value("posting_date", datePart);
					frm.set_value("posting_time", timePart);
				}
				frm.refresh_field("period_end_date");
				frm.refresh_field("posting_date");
				frm.refresh_field("posting_time");
			},
			error: function (error) {
				console.error("Error fetching server time for clock-integrity check:", error);
			},
		});
	},
});
