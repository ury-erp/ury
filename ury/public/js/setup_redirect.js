// Fallback if Desk HTML is served before the server-side wizard redirect.
// website_path_resolver is the primary intercept; this covers cached Desk pages.
(() => {
	if (frappe.boot && frappe.boot.ury_setup_complete === false) {
		window.location.replace(
			frappe.boot.ury_setup_wizard_target || "/ury/setup-wizard/0"
		);
		return;
	}

	// Do not bounce back to the role home page if the user explicitly switched to Desk
	// (indicated by ury_return_to query param or an active desk return session),
	// or navigated to a specific Desk page/workspace.
	const hasReturnContext = () => {
		try {
			const params = new URLSearchParams(window.location.search);
			if (params.get("ury_return_to")) return true;
			if (window.sessionStorage && window.sessionStorage.getItem("ury:desk_return_to")) return true;
		} catch (e) {
			/* ignore */
		}
		return false;
	};

	// Any subpath beyond bare /desk or /app (e.g. /desk/ury or /app/point-of-sale),
	// or a hash route like /app#workspace/URY, represents intentional navigation
	// to a specific page and must not be bounced back to the role home page.
	const isSpecificDeskPage = () => {
		try {
			const path = (window.location.pathname || "").replace(/\/+$/, "");
			if (path !== "/desk" && path !== "/app" && path !== "") return true;
			const hash = (window.location.hash || "").replace(/^#\/?/, "");
			return Boolean(hash);
		} catch (e) {
			return false;
		}
	};

	if (frappe.boot && frappe.boot.ury_role_home_page && !hasReturnContext() && !isSpecificDeskPage()) {
		window.location.replace(frappe.boot.ury_role_home_page);
	}
})();

