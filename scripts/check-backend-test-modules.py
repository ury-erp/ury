#!/usr/bin/env python3
"""Enforce that scripts/backend-test-modules.txt stays in sync with the
actual test_*.py files under ury/.

Every test_*.py file found on disk must be either:
  - listed as a runnable module (one dotted module path per line), or
  - explicitly excluded via a `# exclude: <module>  -- <reason>` line.

And every module listed as runnable must correspond to a real file.

This is deliberately stdlib-only (no PyYAML, no Frappe) so it can run as
the very first, fast step in CI -- before "Setup Frappe" even starts --
and also be imported and asserted on from
ury/ury/tests/test_ci_module_registry.py for local enforcement.

Prints "MODULE-REGISTRY: OK" and exits 0 on success. On failure, prints
each problem and exits 1.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MODULES_FILE = REPO_ROOT / "scripts" / "backend-test-modules.txt"
SEARCH_ROOT = REPO_ROOT / "ury"

EXCLUDE_PREFIX = "# exclude:"


def _dotted_module_for_path(path: Path) -> str:
    """Convert a filesystem path like ury/ury/api/test_foo.py into the
    dotted module path ury.ury.api.test_foo (relative to REPO_ROOT)."""
    rel = path.relative_to(REPO_ROOT).with_suffix("")
    return ".".join(rel.parts)


def _path_for_dotted_module(module: str) -> Path:
    return REPO_ROOT / Path(*module.split(".")).with_suffix(".py")


def discover_test_modules() -> set[str]:
    if not SEARCH_ROOT.is_dir():
        return set()
    return {
        _dotted_module_for_path(p)
        for p in SEARCH_ROOT.rglob("test_*.py")
        if p.is_file()
    }


def parse_modules_file(modules_file: Path) -> tuple[list[str], set[str]]:
    """Returns (listed_modules, excluded_modules)."""
    listed: list[str] = []
    excluded: set[str] = set()

    if not modules_file.is_file():
        return listed, excluded

    for raw_line in modules_file.read_text().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(EXCLUDE_PREFIX):
            rest = line[len(EXCLUDE_PREFIX) :].strip()
            # rest looks like: "<module>  -- <reason>"
            module = rest.split("--", 1)[0].strip()
            if module:
                excluded.add(module)
            continue
        if line.startswith("#"):
            continue
        listed.append(line)

    return listed, excluded


def check(modules_file: Path = MODULES_FILE) -> list[str]:
    """Runs the registry check and returns a list of problem strings
    (empty list means everything is in sync)."""
    problems: list[str] = []

    on_disk = discover_test_modules()
    listed, excluded = parse_modules_file(modules_file)
    listed_set = set(listed)

    # Every duplicate listing is a bug in the registry file.
    seen: set[str] = set()
    for module in listed:
        if module in seen:
            problems.append(f"duplicate entry in {modules_file.name}: {module}")
        seen.add(module)

    # Every file on disk must be accounted for.
    for module in sorted(on_disk):
        if module in listed_set or module in excluded:
            continue
        problems.append(
            f"test module not registered: {module} "
            f"(add it to {modules_file.name}, or add an `# exclude:` line with a reason)"
        )

    # Every listed/excluded module must correspond to a real file.
    for module in sorted(listed_set):
        if not _path_for_dotted_module(module).is_file():
            problems.append(
                f"listed module has no matching file on disk: {module} "
                f"(expected {_path_for_dotted_module(module).relative_to(REPO_ROOT)})"
            )

    # Excluded modules are deliberately allowed to be absent from disk
    # (e.g. a module documented here because it was deleted upstream) --
    # unlike listed modules, a missing file is not itself a problem here.

    return problems


def main() -> int:
    problems = check()
    if problems:
        print(f"MODULE-REGISTRY: FAIL ({len(problems)} problem(s))")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("MODULE-REGISTRY: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
