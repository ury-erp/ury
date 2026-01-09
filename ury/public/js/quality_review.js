frappe.ui.form.on("Quality Review", {
    setup(frm) {
        console.log("QUALITY REVIEW JS LOADED");
        frm.set_query("goal", function () {
            console.log("SET_QUERY ATTACHED");
            return {
                query: "ury.ury.api.quality_goal.quality_goal_for_current_user"
            };
        });
    }
});
