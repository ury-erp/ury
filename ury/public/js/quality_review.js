frappe.ui.form.on("Quality Review", {
    setup(frm) {
        frm.set_query("goal", function () {
            return {
                query: "ury.ury.api.quality_goal.quality_goal_for_current_user"
            };
        });
    }
});


