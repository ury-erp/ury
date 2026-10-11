frappe.ui.form.on("Quality Review", {
    refresh: function (frm) {
        let user = frappe.session.user;
        frm.set_value('employee', user);
        if (!frm.doc.branch) {
            try {
                frappe.call({
                    method: "ury.ury_pos.api.getBranch",
                    args: {
                        user: frappe.session.user,
                    },
                    callback: function (response) {
                        if (!response.message) {
                            frappe.msgprint("User is not Associated with any Branch.");
                            return;
                        }
                        var branch_name = response.message;
                        frm.set_value("branch", branch_name)
                    }
                });
            }
            catch (err) {
                console.error("An error occurred:", err);
            }

        }
        frappe.db.get_doc('User', user)
            .then(user_role => {
                if (user_role.role_profile_name) {
                    frm.set_query("goal", {
                        filters: {
                            "custom_role": user_role.role_profile_name
                        }
                    });
                }
            });
    }
})
