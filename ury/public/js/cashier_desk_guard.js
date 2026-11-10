// Keep cashier-only users (URY Cashier is their only role) inside the Daily Operations
// workspace. Driven by frappe.boot.ury_cashier_desk, which is only set for those users
// (ury.ury.controllers.cashier_desk_guard.shape_bootinfo). No-op for everyone else.
//
// This is the UX layer: full page loads are redirected by the server
// (setup_redirect.website_path_resolver) and workspace data by get_desktop_page.
(function () {
	const cfg = () => (frappe.boot && frappe.boot.ury_cashier_desk) || null;

	function isAllowed(route, conf) {
		if (!route || !route.length) return true;
		const kind = route[0];
		if (kind === "Workspaces") return !route[1] || route[1] === conf.workspace;
		if (kind === "List" || kind === "Form" || kind === "Report" || kind === "Tree") {
			const doctype = route[1];
			if (conf.allowed_doctypes.indexOf(doctype) !== -1) return true;
			// Own user settings.
			return kind === "Form" && doctype === "User" && route[2] === frappe.session.user;
		}
		return false;
	}

	function check() {
		const conf = cfg();
		if (!conf || !frappe.router) return;
		const route = frappe.get_route();
		if (isAllowed(route, conf)) return;
		frappe.set_route("Workspaces", conf.workspace);
	}

	$(document).ready(function () {
		if (!cfg() || !frappe.router || !frappe.router.on) return;
		frappe.router.on("change", check);
	});
})();
