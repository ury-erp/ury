// "Prepare Production" for one department Production Plan.
//
// See ongoing/production-plan-automation/PLAN.md, "Prepare Production, per
// department", D5, D6, D12, D17, and the "Agent 8" task section.
// Server side: ury.ury.api.ury_prepare_production (prepare_production,
// get_production_state, reset_stale_execution). This file owns only the
// desk form's UI: the action button, the confirmation, polling while
// Processing, the consolidated blocker list, generated document links, and
// the System-Manager-only stale-reset control. It never re-derives any of
// the readiness/locking/execution logic that module already owns.
//
// Registered alongside (not instead of) production_plan_cancel_guard.js --
// both call frappe.ui.form.on("Production Plan", {...}) independently and
// Frappe composes the handlers.

const URY_PREPARE_POLL_INTERVAL_MS = 4000;

// One poll timer per open form, keyed by Production Plan name, so
// navigating away/back or a stray double-refresh cannot stack timers.
const ury_prepare_poll_timers = {};

frappe.ui.form.on("Production Plan", {
	refresh(frm) {
		ury_stop_polling(frm.doc.name);

		if (!ury_is_eligible(frm)) {
			return;
		}

		ury_render_status(frm, null);
		ury_refresh_state(frm);
	},

	onload_post_render(frm) {
		// Nothing to do here beyond what refresh already does -- this hook
		// only guarantees timers are torn down if the form is discarded
		// before a refresh ever ran.
		frappe.ui.form.on("Production Plan", "before_load", () => ury_stop_polling(frm.doc.name));
	},
});

function ury_is_eligible(frm) {
	return !frm.is_new() && frm.doc.docstatus === 1 && !!frm.doc.custom_ury_sales_plan;
}

function ury_stop_polling(name) {
	if (ury_prepare_poll_timers[name]) {
		clearInterval(ury_prepare_poll_timers[name]);
		delete ury_prepare_poll_timers[name];
	}
}

function ury_refresh_state(frm) {
	frappe.call({
		method: "ury.ury.api.ury_prepare_production.get_production_state",
		args: { production_plan: frm.doc.name },
		callback(r) {
			if (!frm.doc || frm.is_dirty) return; // form navigated away/edited under us
			const state = r.message;
			ury_render_status(frm, state);
			ury_render_actions(frm, state);

			if (state && state.execution_state === "processing") {
				ury_start_polling(frm);
			} else {
				ury_stop_polling(frm.doc.name);
			}
		},
	});
}

function ury_start_polling(frm) {
	const name = frm.doc.name;
	if (ury_prepare_poll_timers[name]) return; // already polling
	ury_prepare_poll_timers[name] = setInterval(() => {
		if (!frm.doc || frm.doc.name !== name) {
			ury_stop_polling(name);
			return;
		}
		ury_refresh_state(frm);
	}, URY_PREPARE_POLL_INTERVAL_MS);
}

// --- status panel --------------------------------------------------------

function ury_render_status(frm, state) {
	frm.dashboard.clear_headline();

	if (!state) {
		frm.dashboard.set_headline(__("Checking Prepare Production status..."));
		return;
	}

	const label_by_state = {
		awaiting_materials: __("Awaiting Materials"),
		ready: __("Ready for Production"),
		processing: __("Processing"),
		completed: __("Production Completed"),
		failed: __("Production Failed"),
	};
	const indicator_by_state = {
		awaiting_materials: "orange",
		ready: "blue",
		processing: "yellow",
		completed: "green",
		failed: "red",
	};

	const label = label_by_state[state.execution_state] || state.production_state;
	const indicator = indicator_by_state[state.execution_state] || "gray";

	let headline = `<span class="indicator-pill ${indicator}">${frappe.utils.escape_html(label)}</span>`;
	if (state.execution_state === "processing" && state.step) {
		headline += ` &nbsp; <span class="text-muted">${frappe.utils.escape_html(state.step)}</span>`;
	}
	frm.dashboard.set_headline_alert(headline);

	if (state.blockers && state.blockers.length) {
		ury_render_blockers(frm, state.blockers);
	}

	if (state.execution_state === "completed" && state.result) {
		ury_render_result_links(frm, state.result);
	}
}

function ury_render_blockers(frm, blockers) {
	const items = blockers
		.map((b) => `<li>${frappe.utils.escape_html(b.message || b.type || JSON.stringify(b))}</li>`)
		.join("");
	frm.dashboard.add_comment(
		`<div><strong>${__("Blocked")}:</strong><ul class="ury-prepare-blockers">${items}</ul></div>`,
		"orange",
		true
	);
}

function ury_render_result_links(frm, result) {
	const parts = [];
	if (result.work_orders && result.work_orders.length) {
		parts.push(
			`${__("Work Orders")}: ` +
				result.work_orders
					.map((wo) => `<a href="/app/work-order/${encodeURIComponent(wo)}">${frappe.utils.escape_html(wo)}</a>`)
					.join(", ")
		);
	}
	if (result.stock_entries && result.stock_entries.length) {
		parts.push(
			`${__("Transfer Stock Entries")}: ` +
				result.stock_entries
					.map((se) => `<a href="/app/stock-entry/${encodeURIComponent(se)}">${frappe.utils.escape_html(se)}</a>`)
					.join(", ")
		);
	}
	if (result.manufacture_stock_entries && result.manufacture_stock_entries.length) {
		parts.push(
			`${__("Manufacture Stock Entries")}: ` +
				result.manufacture_stock_entries
					.map((se) => `<a href="/app/stock-entry/${encodeURIComponent(se)}">${frappe.utils.escape_html(se)}</a>`)
					.join(", ")
		);
	}
	if (!parts.length) return;
	frm.dashboard.add_comment(`<div>${parts.join("<br>")}</div>`, "green", true);
}

// --- actions --------------------------------------------------------------

function ury_render_actions(frm, state) {
	frm.page.clear_actions_menu && frm.page.clear_actions_menu();
	frm.remove_custom_button(__("Prepare Production"));
	frm.remove_custom_button(__("Reset Stuck Execution"));

	if (!state) return;

	// Hidden/disabled once completed -- nothing left for this action to do.
	const can_prepare = ["awaiting_materials", "ready", "failed"].includes(state.execution_state);
	if (can_prepare) {
		frm.add_custom_button(__("Prepare Production"), () => ury_confirm_and_prepare(frm));
		frm.page.set_primary_action(__("Prepare Production"), () => ury_confirm_and_prepare(frm));
	} else if (state.execution_state === "processing") {
		frm.page.clear_primary_action();
	}

	if (state.can_reset) {
		frm.add_custom_button(__("Reset Stuck Execution"), () => ury_reset_stale(frm), __("Actions"));
	}
}

function ury_confirm_and_prepare(frm) {
	frappe.confirm(
		__(
			"This will validate stock, transfer materials from Store, create Work Orders, and post " +
				"Manufacture Stock Entries for {0} ({1}). Submitting a Manufacture Stock Entry declares " +
				"that physical production is complete. Continue?",
			[frm.doc.custom_ury_department || frm.doc.name, frm.doc.name]
		),
		() => ury_call_prepare_production(frm)
	);
}

function ury_call_prepare_production(frm) {
	frappe.call({
		method: "ury.ury.api.ury_prepare_production.prepare_production",
		args: { production_plan: frm.doc.name },
		freeze: true,
		freeze_message: __("Running preflight..."),
		callback(r) {
			const response = r.message;
			if (!response) return;

			if (response.status === "blocked") {
				frappe.msgprint({
					title: __("Prepare Production blocked"),
					indicator: "orange",
					message:
						"<ul>" +
						(response.blockers || [])
							.map((b) => `<li>${frappe.utils.escape_html(b.message || b.type)}</li>`)
							.join("") +
						"</ul>",
				});
			} else if (response.status === "already_processing") {
				frappe.show_alert({ message: __("Already processing."), indicator: "yellow" });
			} else {
				frappe.show_alert({ message: __("Prepare Production started."), indicator: "green" });
			}
			ury_refresh_state(frm);
		},
	});
}

function ury_reset_stale(frm) {
	frappe.confirm(
		__(
			"Reset this stuck execution back to Awaiting Materials? Only do this once you are sure " +
				"the background job is no longer running."
		),
		() => {
			frappe.call({
				method: "ury.ury.api.ury_prepare_production.reset_stale_execution",
				args: { production_plan: frm.doc.name },
				freeze: true,
				callback() {
					frappe.show_alert({ message: __("Reset."), indicator: "green" });
					ury_refresh_state(frm);
				},
			});
		}
	);
}
