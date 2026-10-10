// URY Control Center: switch optional features on and off, and decide which
// restaurant roles may open Desk and where each lands after signing in.
//
// Nothing is applied until Save, and Save first shows exactly what will
// change. The server enforces everything shown here (API gate, page guard),
// so this page is the switchboard, not the lock.

const API = "ury.ury.api.control_center";

const ICONS = {
	"user-check": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
	monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
	"qr-code": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
	"calendar-clock": '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4M8 2v4M3 10h5"/><circle cx="16" cy="16" r="6"/><path d="M16 14v2l1 1"/>',
	hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
	"message-square-heart": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M14.8 7.5a1.84 1.84 0 0 0-2.6 0l-.2.3-.3-.3a1.84 1.84 0 1 0-2.4 2.8L12 13l2.7-2.7c.9-.9.8-2.1.1-2.8"/>',
	tags: '<path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z"/><path d="M6 9.01V9"/><path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19"/>',
	bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
	globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
	"shopping-cart": '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
	warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12M6 14h12M6 10h12"/>',
	"book-open": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
	"log-in": '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
	shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};

const icon = (name, size = 20) =>
	`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.shield}</svg>`;

const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));

frappe.pages["ury-control-center"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("URY Control Center"),
		single_column: true,
	});
	new URYControlCenter(page, wrapper);
};

class URYControlCenter {
	constructor(page, wrapper) {
		this.page = page;
		this.$root = $('<div class="ury-cc"></div>').appendTo(page.main);
		this.tab = "features";
		this.page.set_primary_action(__("Save"), () => this.confirm_save(), "check");
		this.page.set_secondary_action(__("Discard"), () => this.reset());
		this.page.add_inner_button(__("Open restaurant dashboard"), () => window.open("/restro/dashboard", "_blank", "noopener"));
		$(wrapper).on("show", () => this.load());
		this.load();
	}

	async load() {
		this.$root.html(`<div class="ury-cc-loading">${__("Loading...")}</div>`);
		try {
			const r = await frappe.call({ method: `${API}.get_state` });
			this.state = r.message;
			this.reset(true);
		} catch (e) {
			this.$root.html(`<div class="ury-cc-error">${__("Could not load the settings.")}</div>`);
		}
	}

	reset(silent) {
		if (!this.state) return;
		this.draft = {
			features: Object.fromEntries(this.state.features.map((f) => [f.key, f.enabled])),
			enforce: this.state.enforce,
			roles: this.state.roles.map((r) => ({ ...r })),
		};
		this.render();
		if (!silent) frappe.show_alert({ message: __("Changes discarded"), indicator: "blue" });
	}

	// ------------------------------------------------------------------ changes

	changes() {
		const out = [];
		for (const f of this.state.features) {
			if (this.draft.features[f.key] !== f.enabled) {
				out.push({ off: !this.draft.features[f.key], text: (this.draft.features[f.key] ? __("Enable {0}", [f.label]) : __("Disable {0}", [f.label])), feature: f });
			}
		}
		if (this.draft.enforce !== this.state.enforce) {
			out.push({ off: false, text: this.draft.enforce ? __("Keep restaurant staff out of Desk") : __("Let restaurant staff open Desk") });
		}
		const before = JSON.stringify(this.state.roles.map((r) => [r.role, +r.block_desk, r.landing || ""]));
		const after = JSON.stringify(this.draft.roles.map((r) => [r.role, +r.block_desk, r.landing || ""]));
		if (before !== after) out.push({ off: false, text: __("Update role access and landing pages") });
		return out;
	}

	update_dirty() {
		const dirty = this.changes().length > 0;
		this.page.btn_primary.prop("disabled", !dirty || !this.state.can_edit);
		this.page.btn_secondary.toggle(dirty);
		this.$root.find(".ury-cc-dirty").toggle(dirty);
	}

	confirm_save() {
		const changes = this.changes();
		if (!changes.length) return;
		const list = changes
			.map((c) => {
				const extra = c.off && c.feature
					? `<div class="ury-cc-note">${__("Its screens are hidden and its server functions refuse calls until it is enabled again. No data is deleted.")}</div>`
					: "";
				return `<li class="${c.off ? "is-off" : ""}">${esc(c.text)}${extra}</li>`;
			})
			.join("");
		frappe.confirm(
			`<p>${__("These changes apply to everyone on their next page load:")}</p><ul class="ury-cc-changes">${list}</ul>`,
			() => this.save()
		);
	}

	async save() {
		this.page.btn_primary.prop("disabled", true);
		try {
			const r = await frappe.call({
				method: `${API}.save`,
				args: {
					feature_states: this.draft.features,
					enforce: this.draft.enforce ? 1 : 0,
					roles: this.draft.roles.map((r) => ({ role: r.role, block_desk: r.block_desk ? 1 : 0, landing: r.landing || "" })),
				},
				freeze: true,
				freeze_message: __("Saving changes..."),
			});
			this.state = r.message;
			this.reset(true);
			frappe.show_alert({ message: __("Saved"), indicator: "green" });
		} catch (e) {
			this.update_dirty();
		}
	}

	// ------------------------------------------------------------------ render

	render() {
		const s = this.state;
		const on = Object.values(this.draft.features).filter(Boolean).length;
		const restricted = s.people.filter((p) => !p.desk).length;
		const tabs = [
			["features", __("Features")],
			["access", __("Desk access")],
			["people", __("People")],
		];
		this.$root.html(`
			<div class="ury-cc-hero">
				<div class="ury-cc-hero-text">
					<h2>${__("Restaurant control center")}</h2>
					<p>${__("Choose which parts of the restaurant system are in use, and what each role can open.")}</p>
				</div>
				<div class="ury-cc-stats">
					<div class="ury-cc-stat"><span>${on} / ${s.features.length}</span><label>${__("Features on")}</label></div>
					<div class="ury-cc-stat"><span>${restricted}</span><label>${__("Staff kept out of Desk")}</label></div>
					<div class="ury-cc-stat ${this.draft.enforce ? "is-good" : "is-warn"}"><span>${this.draft.enforce ? __("Enforced") : __("Off")}</span><label>${__("Desk policy")}</label></div>
				</div>
			</div>
			<div class="ury-cc-dirty" style="display:none">${__("You have unsaved changes.")}</div>
			<div class="ury-cc-tabs" role="tablist">
				${tabs.map(([k, l]) => `<button type="button" role="tab" class="ury-cc-tab ${this.tab === k ? "active" : ""}" data-tab="${k}" aria-selected="${this.tab === k}">${l}</button>`).join("")}
			</div>
			<div class="ury-cc-body"></div>
		`);
		this.$root.find(".ury-cc-tab").on("click", (e) => {
			this.tab = $(e.currentTarget).data("tab");
			this.render();
		});
		const $body = this.$root.find(".ury-cc-body");
		if (this.tab === "features") this.render_features($body);
		else if (this.tab === "access") this.render_access($body);
		else this.render_people($body);
		this.update_dirty();
	}

	render_features($body) {
		const s = this.state;
		const readonly = !s.can_edit;
		for (const g of s.groups) {
			const items = s.features.filter((f) => f.group === g.key);
			if (!items.length) continue;
			const $group = $(`<section class="ury-cc-group"><h3>${esc(g.label)}</h3><div class="ury-cc-grid"></div></section>`).appendTo($body);
			const $grid = $group.find(".ury-cc-grid");
			for (const f of items) {
				const enabled = this.draft.features[f.key];
				const changed = enabled !== f.enabled;
				const where = [...f.routes.map((r) => `/ury${r}`), ...f.pages.map((p) => `/${p}`)];
				const $card = $(`
					<label class="ury-cc-card ${enabled ? "is-on" : "is-off"} ${changed ? "is-changed" : ""}">
						<span class="ury-cc-card-icon">${icon(f.icon)}</span>
						<span class="ury-cc-card-text">
							<strong>${esc(f.label)}</strong>
							<small>${esc(f.description)}</small>
							${where.length ? `<code>${where.map(esc).join(" · ")}</code>` : ""}
						</span>
						<span class="ury-cc-switch">
							<input type="checkbox" ${enabled ? "checked" : ""} ${readonly ? "disabled" : ""} aria-label="${esc(f.label)}">
							<span class="ury-cc-slider"></span>
						</span>
						<span class="ury-cc-state">${enabled ? __("On") : __("Off")}</span>
					</label>
				`).appendTo($grid);
				$card.find("input").on("change", (e) => {
					this.draft.features[f.key] = e.target.checked;
					this.render();
				});
			}
		}
	}

	render_access($body) {
		const s = this.state;
		const readonly = !s.can_edit;
		const choices = s.landing_choices;
		$body.append(`
			<div class="ury-cc-policy">
				<div>
					<strong>${__("Keep restaurant staff out of Desk")}</strong>
					<small>${__("Staff whose roles are all blocked below are sent to their own screen instead of Desk, and Desk's own API is refused to them.")}</small>
				</div>
				<span class="ury-cc-switch">
					<input type="checkbox" class="ury-cc-enforce" ${this.draft.enforce ? "checked" : ""} ${readonly ? "disabled" : ""} aria-label="${__("Keep restaurant staff out of Desk")}">
					<span class="ury-cc-slider"></span>
				</span>
			</div>
			<div class="ury-cc-info">${icon("shield", 16)} ${__("System Managers and Administrator always keep Desk, whatever other roles they have. You cannot save a policy that would keep yourself out of Desk.")}</div>
			<table class="ury-cc-table">
				<thead><tr>
					<th>${__("Priority")}</th><th>${__("Role")}</th><th>${__("Users")}</th><th>${__("Desk")}</th><th>${__("Lands on after sign-in")}</th><th></th>
				</tr></thead>
				<tbody></tbody>
			</table>
		`);
		this.$root.find(".ury-cc-enforce").on("change", (e) => {
			this.draft.enforce = e.target.checked;
			this.render();
		});
		const $tbody = $body.find("tbody");
		this.draft.roles.forEach((r, i) => {
			const custom = r.landing && !choices.includes(r.landing);
			const options = choices
				.filter((c) => !(r.block_desk && c === "/app"))
				.map((c) => `<option value="${esc(c)}" ${r.landing === c ? "selected" : ""}>${esc(this.landing_label(c))}</option>`)
				.join("");
			const $tr = $(`
				<tr>
					<td class="ury-cc-prio">
						<button type="button" class="btn btn-xs btn-default up" ${i === 0 || readonly ? "disabled" : ""} aria-label="${__("Move up")}">▲</button>
						<button type="button" class="btn btn-xs btn-default down" ${i === this.draft.roles.length - 1 || readonly ? "disabled" : ""} aria-label="${__("Move down")}">▼</button>
					</td>
					<td><strong>${esc(r.role)}</strong></td>
					<td>${r.users || 0}</td>
					<td>
						<select class="form-control input-xs desk" ${readonly ? "disabled" : ""}>
							<option value="0" ${!r.block_desk ? "selected" : ""}>${__("Can open Desk")}</option>
							<option value="1" ${r.block_desk ? "selected" : ""}>${__("Kept out")}</option>
						</select>
					</td>
					<td>
						<select class="form-control input-xs landing" ${readonly ? "disabled" : ""}>
							${options}
							<option value="__custom" ${custom ? "selected" : ""}>${__("Other path...")}</option>
						</select>
						<input class="form-control input-xs custom-landing" placeholder="/pos" value="${custom ? esc(r.landing) : ""}" style="${custom ? "" : "display:none"}" ${readonly ? "disabled" : ""}>
					</td>
					<td><button type="button" class="btn btn-xs btn-default remove" ${readonly ? "disabled" : ""} aria-label="${__("Remove")}">✕</button></td>
				</tr>
			`).appendTo($tbody);
			$tr.find(".up").on("click", () => this.move(i, -1));
			$tr.find(".down").on("click", () => this.move(i, 1));
			$tr.find(".remove").on("click", () => {
				this.draft.roles.splice(i, 1);
				this.render();
			});
			$tr.find(".desk").on("change", (e) => {
				r.block_desk = e.target.value === "1";
				if (r.block_desk && (!r.landing || r.landing.startsWith("/app"))) r.landing = "/pos";
				this.render();
			});
			$tr.find(".landing").on("change", (e) => {
				if (e.target.value === "__custom") {
					$tr.find(".custom-landing").show().trigger("focus");
					return;
				}
				r.landing = e.target.value;
				this.render();
			});
			$tr.find(".custom-landing").on("change", (e) => {
				r.landing = e.target.value.trim();
				this.update_dirty();
			});
		});
		const free = s.available_roles.filter((role) => !this.draft.roles.some((r) => r.role === role));
		if (free.length && !readonly) {
			const $add = $(`<div class="ury-cc-add">
				<select class="form-control input-sm">${free.map((r) => `<option>${esc(r)}</option>`).join("")}</select>
				<button type="button" class="btn btn-sm btn-default">${__("Add role")}</button>
			</div>`).appendTo($body);
			$add.find("button").on("click", () => {
				this.draft.roles.push({ role: $add.find("select").val(), block_desk: true, landing: "/pos", users: 0 });
				this.render();
			});
		}
		$body.append(`<p class="ury-cc-foot">${__("A user with several roles lands on the page of the highest role in this list.")}</p>`);
	}

	render_people($body) {
		const people = this.state.people;
		$body.append(`
			<div class="ury-cc-info">${__("As saved. Unsaved changes are not reflected here.")}</div>
			<input type="search" class="form-control ury-cc-search" placeholder="${__("Search people")}">
			<table class="ury-cc-table ury-cc-people">
				<thead><tr><th>${__("Person")}</th><th>${__("Role")}</th><th>${__("Desk")}</th><th>${__("Lands on")}</th></tr></thead>
				<tbody>${people
					.map(
						(p) => `<tr data-q="${esc((p.full_name + " " + p.user).toLowerCase())}">
							<td><strong>${esc(p.full_name || p.user)}</strong><div class="text-muted small">${esc(p.user)}</div></td>
							<td>${esc(p.role || "—")}</td>
							<td>${p.desk ? `<span class="indicator-pill green">${__("Can open Desk")}</span>` : `<span class="indicator-pill red">${__("Kept out")}</span>`}</td>
							<td><code>${esc(p.landing || "/app")}</code></td>
						</tr>`
					)
					.join("") || `<tr><td colspan="4" class="text-muted">${__("No one has a restaurant role yet.")}</td></tr>`}</tbody>
			</table>
		`);
		$body.find(".ury-cc-search").on("input", (e) => {
			const q = e.target.value.trim().toLowerCase();
			$body.find("tbody tr[data-q]").each((_, tr) => $(tr).toggle(!q || tr.dataset.q.includes(q)));
		});
	}

	move(i, delta) {
		const roles = this.draft.roles;
		const j = i + delta;
		if (j < 0 || j >= roles.length) return;
		[roles[i], roles[j]] = [roles[j], roles[i]];
		this.render();
	}

	landing_label(path) {
		const labels = {
			"/pos": __("POS (cashier)"),
			"/pos/order": __("Captain order pad"),
			"/restro/dashboard": __("Restaurant dashboard"),
			"/restro/reports": __("Reports"),
			"/mosaic": __("Kitchen display"),
			"/app": __("Desk"),
		};
		return `${labels[path] || path} — ${path}`;
	}
}
