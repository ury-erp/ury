// Fallback if Desk HTML is served before the server-side wizard redirect.
// website_path_resolver is the primary intercept; this covers cached Desk pages.
(() => {
	if (frappe.boot && frappe.boot.ury_setup_complete === false) {
		window.location.replace(
			frappe.boot.ury_setup_wizard_target || "/ury/setup-wizard/0"
		);
	}
})();
