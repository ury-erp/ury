from . import __version__ as app_version

app_name = "ury"
app_title = "URY"
app_publisher = "Tridz Technologies Pvt. Ltd"
app_description = "A Complete Restaurant Order Taking Software"
app_email = "info@tridz.com"
app_license = "MIT"
app_logo_url = "/assets/ury/Images/ury-logo.jpg"
app_icon_title = "URY"
required_apps = ["erpnext"]
# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/ury/css/ury.css"
app_include_js = ["/assets/ury/js/quick_entry.js", "/assets/ury/js/pos_print.js"]

# include js, css files in header of web template
# web_include_css = "/assets/ury/css/ury.css"
# web_include_js = "/assets/ury/js/ury.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "ury/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
page_js = {"point-of-sale": ["public/js/pos_extend.js"]}

# include js in doctype views
# doctype_js = {"POS Invoive" : "public/js/pos_print.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Splash Image in Website Settings
website_context = {"splash_image": "/assets/ury/Images/ury-logo.jpg"}


# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "ury.utils.jinja_methods",
# 	"filters": "ury.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "ury.install.before_install"
# after_install = "ury.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "ury.uninstall.before_uninstall"
# after_uninstall = "ury.uninstall.before_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "ury.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
    "POS Invoice": {
        "before_insert": "ury.ury.hooks.ury_pos_invoice.before_insert",
        "validate": "ury.ury.hooks.ury_pos_invoice.validate",
        "before_submit": "ury.ury.hooks.ury_pos_invoice.before_submit",
        "on_cancel": "ury.ury.hooks.ury_pos_invoice.on_trash",
        "on_trash": "ury.ury.hooks.ury_pos_invoice.on_trash",
    },
    "POS Profile": {"validate": "ury.ury.hooks.ury_pos_profile.validate"},
    "Sales Invoice": {"before_insert": "ury.ury.hooks.ury_sales_invoice.before_insert"},
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"ury.tasks.all"
# 	],
# 	"daily": [
# 		"ury.tasks.daily"
# 	],
# 	"hourly": [
# 		"ury.tasks.hourly"
# 	],
# 	"weekly": [
# 		"ury.tasks.weekly"
# 	],
# 	"monthly": [
# 		"ury.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "ury.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "ury.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "ury.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["ury.utils.before_request"]
# after_request = ["ury.utils.after_request"]

# Job Events
# ----------
# before_job = ["ury.utils.before_job"]
# after_job = ["ury.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"ury.auth.validate"
# ]

fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [
            [
                "name",
                "in",
                {
                    "Customer-mobile_number",
                    "POS Invoice-mobile_number",
                    "POS Invoice-order_info",
                    "POS Invoice-order_type",
                    "POS Invoice-waiter",
                    "POS Invoice-column_break_rwbwf",
                    "POS Invoice-no_of_pax",
                    "POS Invoice-cashier",
                    "POS Invoice-invoice_printed",
                    "POS Invoice-invoice_created",
                    "POS Invoice-restaurant_info",
                    "POS Invoice-restaurant",
                    "POS Invoice-branch",
                    "POS Invoice-print",
                    "POS Invoice-restaurant_table",
                    "POS Invoice-column_break_gd1mq",
                    "POS Invoice-arrived_time",
                    "POS Invoice-total_spend_time",
                    "POS Invoice-section_break_hllcp",
                    "POS Invoice-cancel_reason",
                    "POS Invoice Item-comment",
                    "Sales Invoice-mobile_number",
                    "Sales Invoice-order_info",
                    "Sales Invoice-order_type",
                    "Sales Invoice-waiter",
                    "Sales Invoice-column_break_bc56k",
                    "Sales Invoice-no_of_pax",
                    "Sales Invoice-cashier",
                    "Sales Invoice-restaurant_info",
                    "Sales Invoice-restaurant",
                    "Sales Invoice-branch",
                    "Sales Invoice-restaurant_table",
                    "Sales Invoice-column_break_hnrk9",
                    "Sales Invoice-arrived_time",
                    "Sales Invoice-total_spend_time",
                    "POS Profile-restaurant_info",
                    "POS Profile-restaurant",
                    "POS Profile-column_break_c10ag",
                    "POS Profile-branch",
                    "POS Profile-printer_info",
                    "POS Profile-printer_settings",
                    "POS Profile-qz_print",
                    "POS Profile-qz_host",
                    "POS Profile-restaurant_prefix",
                    "POS Opening Entry-restaurant_info",
                    "POS Opening Entry-restaurant",
                    "POS Opening Entry-column_break_e3dky",
                    "POS Opening Entry-branch",
                    "Branch-user",
                    "Price List-restaurant_menu",
                },
            ]
        ],
    },
    {"dt": "Role", "filters": [["role_name", "like", "URY %"]]},
]
