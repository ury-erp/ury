// URY sidebar: keep only the section that holds the current page open.
//
// The URY sidebar has ten collapsible sections. Without this, every section the user ever
// opened stays open (Frappe remembers it), and the list grows long. On each page change the
// section containing the active item is opened and the others are closed. On Home, all close.
//
// Purely cosmetic and defensive: it only touches the URY sidebar and does nothing if the
// markup is not what it expects.
(function () {
	function focus_current_section() {
		try {
			const sidebar = frappe.app && frappe.app.sidebar;
			if (!sidebar || sidebar.current_module !== "URY") return;
			document.querySelectorAll(".sidebar-item-container.section-item").forEach((section) => {
				const nested = section.querySelector(":scope > .nested-container");
				const header = section.querySelector(":scope > .standard-sidebar-item");
				if (!nested || !header) return;
				const has_active = !!nested.querySelector(
					".standard-sidebar-item.active-sidebar, .standard-sidebar-item.active, .standard-sidebar-item.selected"
				);
				const is_open = !nested.classList.contains("hidden");
				if (has_active !== is_open) header.click();
			});
		} catch (e) {
			// never break the desk over a cosmetic behaviour
		}
	}

	function schedule() {
		setTimeout(focus_current_section, 350);
	}

	$(document).on("sidebar_setup", schedule);
	if (window.frappe && frappe.router && frappe.router.on) {
		frappe.router.on("change", schedule);
	}
})();
