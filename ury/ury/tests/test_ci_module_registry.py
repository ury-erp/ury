# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Local (and CI) enforcement that scripts/backend-test-modules.txt stays
in sync with the test_*.py files actually present under ury/.

This mirrors scripts/check-backend-test-modules.py as a
FrappeTestCase-compatible unittest -- no live DB/site state is used, so
it runs fast as part of the normal bench run-tests invocation for this
module (ury.ury.tests.test_ci_module_registry, itself registered in
backend-test-modules.txt) as well as via the standalone script CI runs
as a separate, earlier gate.

Keeping both means the registry check is enforced even by a developer
who only runs `bench run-tests --app ury` locally without ever running
the standalone script directly.
"""

import importlib.util
import sys
from pathlib import Path

from frappe.tests.utils import FrappeTestCase

_SCRIPT_PATH = (
    Path(__file__).resolve().parents[3] / "scripts" / "check-backend-test-modules.py"
)


def _load_check_module():
    spec = importlib.util.spec_from_file_location(
        "ury_ci_check_backend_test_modules", _SCRIPT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class TestCIModuleRegistry(FrappeTestCase):
    def test_registry_script_exists(self):
        self.assertTrue(
            _SCRIPT_PATH.is_file(),
            f"expected {_SCRIPT_PATH} to exist for CI module registry enforcement",
        )

    def test_every_test_module_is_registered_or_excluded(self):
        check_module = _load_check_module()
        problems = check_module.check()
        self.assertEqual(
            problems,
            [],
            "backend-test-modules.txt is out of sync with test_*.py files on disk:\n"
            + "\n".join(f"  - {p}" for p in problems),
        )
