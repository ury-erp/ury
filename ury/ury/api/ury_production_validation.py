# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _


CONFIG_DOCTYPE = "URY Item Production Configuration"

PRE_PRODUCED = "PRE_PRODUCED"
MADE_TO_ORDER = "MADE_TO_ORDER"
DIRECT_RETAIL = "DIRECT_RETAIL"

POLICY_ALIASES = {
    "PRE_PRODUCED": PRE_PRODUCED,
    "MAKE_TO_STOCK": PRE_PRODUCED,
    "MAKE TO STOCK": PRE_PRODUCED,
    "MADE_TO_ORDER": MADE_TO_ORDER,
    "MAKE_TO_ORDER": MADE_TO_ORDER,
    "MAKE TO ORDER": MADE_TO_ORDER,
    "DIRECT_RETAIL": DIRECT_RETAIL,
    "DIRECT RETAIL": DIRECT_RETAIL,
}


def validate_item_production_configuration(item, branch):
    _validate_read_permission()
    config = get_active_item_production_configuration(item, branch)
    policy = normalize_production_policy(config.get("production_policy"))

    _validate_required_scope(config, item, branch)
    branch_company = _get_branch_company(branch)

    if policy == DIRECT_RETAIL:
        _validate_direct_retail(config, branch_company)
    elif policy in (PRE_PRODUCED, MADE_TO_ORDER):
        _validate_manufactured_item(config, branch_company)
    else:
        _fail(_("Invalid production policy for Item {0} in Branch {1}").format(item, branch))

    return {
        "item": item,
        "branch": branch,
        "production_policy": policy,
        "department": config.get("department"),
        "production_unit": config.get("production_unit"),
        "bom": config.get("bom"),
        "warehouse": config.get("direct_retail_warehouse"),
        "configuration": config.get("name"),
    }


def get_active_item_production_configuration(item, branch):
    if not item:
        _fail(_("Item is required for production validation"))
    if not branch:
        _fail(_("Branch is required for production validation"))

    configs = frappe.get_all(
        CONFIG_DOCTYPE,
        fields=[
            "name",
            "item",
            "branch",
            "department",
            "production_unit",
            "production_policy",
            "bom",
            "direct_retail_warehouse",
        ],
        filters={
            "item": item,
            "branch": branch,
            "active": 1,
        },
        limit=2,
    )

    if not configs:
        _fail(_("Active production configuration is required for Item {0} in Branch {1}").format(item, branch))

    if len(configs) > 1:
        _fail(_("Multiple active production configurations found for Item {0} in Branch {1}").format(item, branch))

    return configs[0]


def normalize_production_policy(policy):
    if not policy:
        return None

    normalized = str(policy).strip().upper().replace("-", "_")
    normalized = " ".join(normalized.split())
    normalized = normalized.replace("_", " ")
    return POLICY_ALIASES.get(normalized) or POLICY_ALIASES.get(normalized.replace(" ", "_"))


def _validate_required_scope(config, item, branch):
    if config.get("item") != item:
        _fail(_("Production configuration {0} does not belong to Item {1}").format(config.get("name"), item))

    if config.get("branch") != branch:
        _fail(_("Production configuration {0} does not belong to Branch {1}").format(config.get("name"), branch))


def _validate_manufactured_item(config, branch_company):
    _require_field(config, "department", _("Department is required for manufactured Item {0}").format(config.get("item")))
    _require_field(
        config,
        "production_unit",
        _("Production Unit is required for manufactured Item {0}").format(config.get("item")),
    )
    _require_field(config, "bom", _("BOM is required for manufactured Item {0}").format(config.get("item")))
    _validate_department(config, branch_company)
    _validate_production_unit(config, branch_company)
    _validate_bom(config, branch_company)


def _validate_direct_retail(config, branch_company):
    _require_field(
        config,
        "direct_retail_warehouse",
        _("Direct Retail Warehouse is required for direct-retail Item {0}").format(config.get("item")),
    )

    if config.get("bom"):
        _fail(_("Direct-retail Item {0} must not use a BOM").format(config.get("item")))

    _validate_direct_retail_warehouse(config, branch_company)

    if config.get("department"):
        _validate_department(config, branch_company)

    if config.get("production_unit"):
        _validate_production_unit(config, branch_company)


def _require_field(config, fieldname, message):
    if not config.get(fieldname):
        _fail(message)


def _validate_read_permission():
    if not frappe.has_permission(CONFIG_DOCTYPE, "read"):
        frappe.throw(_("Not permitted to validate production configuration"), frappe.PermissionError)


def _get_branch_company(branch):
    branch_company = frappe.db.get_value("Branch", branch, "company")

    if not branch_company:
        _fail(_("Branch {0} cannot be used for production validation until it has a Company").format(branch))

    return branch_company


def _validate_department(config, branch_company):
    department = frappe.db.get_value(
        "URY Production Department",
        config.get("department"),
        ["branch", "company", "enabled"],
        as_dict=True,
    )

    if not department:
        _fail(_("Department {0} is required").format(config.get("department")))

    if department.get("branch") != config.get("branch"):
        _fail(
            _("Department {0} does not belong to Branch {1}").format(
                config.get("department"), config.get("branch")
            )
        )

    _validate_company_scope("Department", config.get("department"), department.get("company"), branch_company)

    if not department.get("enabled"):
        _fail(_("Department {0} is disabled").format(config.get("department")))


def _validate_production_unit(config, branch_company):
    production_unit = frappe.db.get_value(
        "URY Production Unit",
        config.get("production_unit"),
        ["branch", "company"],
        as_dict=True,
    )

    if not production_unit:
        _fail(_("Production Unit {0} is required").format(config.get("production_unit")))

    if production_unit.get("branch") != config.get("branch"):
        _fail(
            _("Production Unit {0} does not belong to Branch {1}").format(
                config.get("production_unit"), config.get("branch")
            )
        )

    _validate_company_scope(
        "Production Unit",
        config.get("production_unit"),
        production_unit.get("company"),
        branch_company,
    )


def _validate_bom(config, branch_company):
    bom = frappe.db.get_value(
        "BOM",
        config.get("bom"),
        ["item", "company", "is_active", "docstatus"],
        as_dict=True,
    )

    if not bom:
        _fail(_("BOM {0} is required").format(config.get("bom")))

    if bom.get("item") != config.get("item"):
        _fail(_("BOM {0} does not belong to Item {1}").format(config.get("bom"), config.get("item")))

    _validate_company_scope("BOM", config.get("bom"), bom.get("company"), branch_company)

    if not bom.get("is_active") or bom.get("docstatus") != 1:
        _fail(_("BOM {0} must be active and submitted").format(config.get("bom")))


def _validate_direct_retail_warehouse(config, branch_company):
    warehouse_company = frappe.db.get_value("Warehouse", config.get("direct_retail_warehouse"), "company")

    if not warehouse_company:
        _fail(_("Direct Retail Warehouse {0} is required").format(config.get("direct_retail_warehouse")))

    _validate_company_scope(
        "Direct Retail Warehouse",
        config.get("direct_retail_warehouse"),
        warehouse_company,
        branch_company,
    )


def _validate_company_scope(label, link_name, linked_company, branch_company):
    if not linked_company:
        _fail(_("{0} {1} must belong to Company {2}").format(label, link_name, branch_company))

    if linked_company != branch_company:
        _fail(_("{0} {1} does not belong to Company {2}").format(label, link_name, branch_company))


def _fail(message):
    frappe.throw(message, frappe.ValidationError)
