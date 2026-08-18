console.log("URY setup_wizard.js loaded");

frappe.setup.on("before_load", function () {
    if (!window.erpnext || !erpnext.setup?.slides_settings) return;

    const slide = erpnext.setup.slides_settings.find(
        s => s.name === "organization"
    );
    if (!slide) return;

    // Prevent duplicate field
    if (slide.fields.find(f => f.fieldname === "setup_ury_demo")) return;

    const idx = slide.fields.findIndex(f => f.fieldname === "setup_demo");
    if (idx === -1) return;

    // Hide the ERPNext demo data checkbox
    slide.fields[idx].hidden = 1;

    slide.fields.splice(idx + 1, 0, {
        fieldname: "setup_ury_demo",
        label: __("Generate URY Demo Data"),
        fieldtype: "Check",
        default: 0,
        description: __("If checked, we will create URY demo data for you to explore the system. This demo data can be erased later.")
    });
});
