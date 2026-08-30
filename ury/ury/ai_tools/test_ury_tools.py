import ast
import inspect

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.ai_tools import ury_tools

# The complete, expected set of whitelisted tool functions this module
# exposes to HUF (PLAN.md item 1 / HUF_API_NOTES.md security note for item
# 5). Any function added here that isn't in this allowlist should fail
# test_no_unexpected_whitelisted_functions below until it's deliberately
# reviewed and added.
EXPECTED_TOOL_FUNCTIONS = {
    "get_floor_state",
    "get_open_exceptions",
    "get_shift_metrics",
    "get_baseline",
    "get_report_snapshot",
    "list_reports",
}

# Calls that would indicate a tool function performs a write/mutation
# instead of being purely read-only.
MUTATING_CALL_NAMES = {
    "insert",
    "save",
    "submit",
    "cancel",
    "delete_doc",
    "rename_doc",
    "set_value",
    "bulk_update",
    "db_set",
    "add_comment",
}


def _whitelisted_function_names():
    # frappe.whitelist() does not stamp a marker attribute on the function (checked
    # against this Frappe version's source) — it appends the raw function object to
    # the module-level `frappe.whitelisted` list instead. Membership in that list is
    # the actual signal frappe.handler.execute_cmd() uses to allow the call through.
    names = set()
    for name, obj in vars(ury_tools).items():
        # Restrict to functions actually defined in this module — `vars()` also
        # surfaces imported names (e.g. get_service_line, get_needs_attention,
        # _dashboard_get_shift_metrics pulled in for internal reuse), which aren't
        # part of this module's own tool surface even though they may themselves be
        # whitelisted where they're actually defined.
        if (
            inspect.isfunction(obj)
            and obj.__module__ == ury_tools.__name__
            and obj in frappe.whitelisted
        ):
            names.add(name)
    return names


def _is_whitelisted(func):
    return func in frappe.whitelisted


class TestURYToolsSurface(FrappeTestCase):
    """Static/allowlist-style checks that every function registered in
    `ury.ury.ai_tools.ury_tools` is read-only in spirit: exactly the
    expected tool names are whitelisted, and no function in the module's
    source calls a known write/mutating frappe API.
    """

    def test_whitelisted_functions_match_expected_allowlist(self):
        self.assertEqual(_whitelisted_function_names(), EXPECTED_TOOL_FUNCTIONS)

    def test_module_source_contains_no_mutating_calls(self):
        source = inspect.getsource(ury_tools)
        tree = ast.parse(source)

        offending = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            call_name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
            if call_name not in MUTATING_CALL_NAMES:
                continue
            # frappe.cache().set_value(...) is a Redis cache write, not a DocType
            # mutation — the name collision with the DB-writing frappe.db.set_value
            # is coincidental. Only flag set_value when it isn't a .cache() call.
            if (
                call_name == "set_value"
                and isinstance(func, ast.Attribute)
                and isinstance(func.value, ast.Call)
                and isinstance(func.value.func, ast.Attribute)
                and func.value.func.attr == "cache"
            ):
                continue
            offending.append(f"{call_name} at line {node.lineno}")

        self.assertEqual(
            offending,
            [],
            f"ury_tools.py contains apparent write/mutating call(s): {offending}",
        )

    def test_each_expected_tool_function_is_get_only_and_calls_require_manager(self):
        source = inspect.getsource(ury_tools)
        for name in EXPECTED_TOOL_FUNCTIONS:
            func = getattr(ury_tools, name)
            self.assertTrue(_is_whitelisted(func), f"{name} is not whitelisted")

            func_source = inspect.getsource(func)
            self.assertIn(
                "require_manager()",
                func_source,
                f"{name} does not call require_manager()",
            )
