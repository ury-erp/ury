// Hide /insights/ shortcuts and show one banner when Frappe Insights is missing.
// Driven by frappe.boot.ury_insights (ury.ury.boot_insights). No-op when installed.
(function () {
	const KEY = "ury_insights_banner_dismissed";
	const cfg = () => (frappe.boot && frappe.boot.ury_insights) || { installed: true };
	// Server fills the real site name; this only covers a leftover placeholder.
	const siteCmd = (cmd) => String(cmd || "").replace("<site>", (frappe.boot && frappe.boot.sitename) || window.location.hostname);
	const isIns = (a) => (a.getAttribute("href") || "").indexOf("/insights/") === 0;

	// Shortcut widgets carry no href in the DOM, so the /insights/ labels are read from the
	// Workspace doc's shortcut rows and matched to each widget's title.
	const labelCache = {};
	function insightsLabels(name) {
		if (labelCache[name]) return Promise.resolve(labelCache[name]);
		return frappe.db.get_doc("Workspace", name).then((doc) => {
			labelCache[name] = (doc.shortcuts || [])
				.filter((s) => (s.url || "").indexOf("/insights/") === 0)
				.map((s) => (s.label || "").trim());
			return labelCache[name];
		}).catch(() => []);
	}

	function hideShortcuts() {
		const route = (frappe.router && frappe.router.current_route) || [];
		const name = route[1] ? decodeURIComponent(route[1]) : "";
		document.querySelectorAll('a[href^="/insights/"]').forEach((a) => {
			(a.closest(".shortcut-widget-box, .widget, .sidebar-item-container") || a).style.display = "none";
		});
		if (!name) return;
		insightsLabels(name).then((labels) => {
			document.querySelectorAll(".shortcut-widget-box").forEach((w) => {
				const t = ((w.querySelector(".widget-title") || {}).textContent || "").trim();
				if (labels.indexOf(t) !== -1) w.style.display = "none";
			});
		});
	}

	function banner(c) {
		if (document.getElementById("ury-insights-banner")) return;
		try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}
		const host = document.querySelector(".layout-main-section") || document.querySelector(".page-content");
		if (!host) return;
		const el = document.createElement("div");
		el.id = "ury-insights-banner";
		el.className = "alert alert-warning";
		el.style.cssText = "display:flex;gap:8px;align-items:center;justify-content:space-between";
		const msg = document.createElement("span");
		const hint = c.install_hint;
		if (hint) {
			msg.textContent = hint.title + ": ";
			const code = document.createElement("code");
			code.textContent = siteCmd(hint.cmd);
			msg.appendChild(code);
		} else {
			msg.textContent = "Analytics needs Frappe Insights; ask your administrator.";
		}
		el.appendChild(msg);
		const bar = document.createElement("span");
		if (hint) {
			const copy = document.createElement("button");
			copy.className = "btn btn-xs btn-default";
			copy.textContent = __("Copy");
			copy.onclick = () => frappe.utils.copy_to_clipboard(siteCmd(hint.cmd));
			bar.appendChild(copy);
		}
		const x = document.createElement("button");
		x.className = "btn btn-xs btn-default";
		x.textContent = "×";
		x.setAttribute("aria-label", "Dismiss");
		x.onclick = () => { try { sessionStorage.setItem(KEY, "1"); } catch (e) {} el.remove(); };
		bar.appendChild(x);
		el.appendChild(bar);
		host.prepend(el);
	}

	function run() {
		const c = cfg();
		if (c.installed) return;
		if (!(frappe.router && (frappe.router.current_route || [])[0] === "Workspaces")) return;
		hideShortcuts();
		setTimeout(hideShortcuts, 600);
		setTimeout(() => { hideShortcuts(); banner(c); }, 800);
	}

	$(document).on("page-change", run);
	$(function () { setTimeout(run, 500); });
})();
