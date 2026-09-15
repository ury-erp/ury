#!/usr/bin/env python3
"""
tests/live/invariant_checker.py

Generic DB invariant checker for live-bench adversarial testing, run after
actor_harness.py has driven concurrent order lifecycles against a real bench.

Pattern extracted from the ad-hoc invariant_checker.py used in the
sa-production-control-unification track's live-bench investigation (never committed).
This version is generalized: doctype/field names are config-driven so it isn't tied to the
one prior investigation's schema assumptions.

Checks three invariant classes over a live Frappe site's DB:

1. no-oversell: for every stock item touched, cumulative reserved/consumed qty must never
   exceed what was actually available at the time (i.e. stock ledger / bin qty never goes
   negative when it shouldn't -- some items may legitimately allow negative stock, which is
   config-flagged and skipped).

2. reservation-atomicity: every stock reservation row must reference a real, existing order
   document; there must be no "orphaned" reservations left over from a crashed/partial
   lifecycle (reservation with no matching order, or order cancelled/deleted but reservation
   still active).

3. audit-log-completeness: every order that reached a terminal or intermediate state
   (submitted, paid, closed, cancelled) must have a corresponding Version/audit-log entry
   recording that transition -- i.e. state changes are never silent.

Connects directly via frappe's `frappe.db` when run with `bench execute`, OR via a raw
PyMySQL/MariaDB connection when run standalone (outside a bench context) -- see
config.example.json's `db` section.

Usage (inside bench context):
    bench --site mysite.local execute tests/live/invariant_checker.py:main \
        --kwargs "{'config': 'tests/live/config.example.json'}"

Usage (standalone, raw DB connection):
    python3 tests/live/invariant_checker.py --config tests/live/config.example.json --standalone
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field


@dataclass
class InvariantViolation:
    check: str
    detail: str
    severity: str = "error"  # or "warning"


@dataclass
class InvariantReport:
    violations: list[InvariantViolation] = field(default_factory=list)

    def add(self, check: str, detail: str, severity: str = "error"):
        self.violations.append(InvariantViolation(check, detail, severity))

    def ok(self) -> bool:
        return not any(v.severity == "error" for v in self.violations)

    def print_summary(self):
        if not self.violations:
            print("All invariant checks passed: no violations found.")
            return
        errors = [v for v in self.violations if v.severity == "error"]
        warnings = [v for v in self.violations if v.severity == "warning"]
        print(f"Invariant checker found {len(errors)} error(s), {len(warnings)} warning(s):")
        for v in self.violations:
            print(f"  [{v.severity.upper()}] {v.check}: {v.detail}")


def _get_connection(cfg: dict, standalone: bool):
    """Return a query(sql, params) -> list[dict] callable, either via frappe.db or raw DB-API."""
    if not standalone:
        import frappe  # type: ignore
        def query(sql, params=None):
            return frappe.db.sql(sql, params or {}, as_dict=True)
        return query

    db_cfg = cfg["db"]
    driver = db_cfg.get("driver", "pymysql")
    if driver == "pymysql":
        import pymysql
        import pymysql.cursors
        conn = pymysql.connect(
            host=db_cfg["host"], port=db_cfg.get("port", 3306),
            user=db_cfg["user"], password=db_cfg["password"], database=db_cfg["database"],
            cursorclass=pymysql.cursors.DictCursor,
        )
        def query(sql, params=None):
            with conn.cursor() as cur:
                cur.execute(sql, params or {})
                return cur.fetchall()
        return query
    raise ValueError(f"Unsupported driver: {driver}")


def check_no_oversell(query, cfg: dict, report: InvariantReport):
    stock_cfg = cfg.get("no_oversell", {})
    bin_doctype = stock_cfg.get("bin_table", "tabBin")
    allow_negative_items = set(stock_cfg.get("allow_negative_stock_items", []))
    rows = query(f"""
        SELECT item_code, warehouse, actual_qty, reserved_qty
        FROM `{bin_doctype}`
        WHERE actual_qty < 0 OR (actual_qty - reserved_qty) < 0
    """)
    for row in rows:
        if row["item_code"] in allow_negative_items:
            continue
        report.add(
            "no-oversell",
            f"item={row['item_code']} warehouse={row['warehouse']} "
            f"actual_qty={row['actual_qty']} reserved_qty={row['reserved_qty']} "
            f"(available after reservation is negative)",
        )


def check_reservation_atomicity(query, cfg: dict, report: InvariantReport):
    res_cfg = cfg.get("reservation_atomicity", {})
    reservation_table = res_cfg.get("reservation_table", "tabStock Reservation Entry")
    order_field = res_cfg.get("order_field", "voucher_no")
    order_table = res_cfg.get("order_table", "tabSales Order")
    # active_statuses: the set of reservation statuses considered "still holding
    # stock" for this doctype. Default kept for backward compat with the original
    # ERPNext Stock Reservation Entry shape (exclude terminal Cancelled/Delivered).
    # A schema with an explicit active-state enum (e.g. URY Stock Reservation's
    # Reserved/Fulfilled/Released) should instead pass active_statuses=["Reserved"]
    # -- found while adapting this checker to a real non-ERPNext-standard reservation
    # doctype: the NOT-IN-terminal-states default silently misclassifies a
    # Fulfilled/Released row pointing at a cancelled order as a violation, when only
    # a still-Reserved row pointing at a cancelled/missing order is a real orphan.
    active_statuses = res_cfg.get("active_statuses")
    if active_statuses:
        status_clause = "r.status IN %(active_statuses)s"
        params = {"active_statuses": tuple(active_statuses)}
    else:
        status_clause = "r.status NOT IN ('Cancelled', 'Delivered')"
        params = None
    rows = query(f"""
        SELECT r.name AS reservation_name, r.{order_field} AS order_ref
        FROM `{reservation_table}` r
        LEFT JOIN `{order_table}` o ON o.name = r.{order_field}
        WHERE {status_clause}
          AND (o.name IS NULL OR o.docstatus = 2)
    """, params)
    for row in rows:
        report.add(
            "reservation-atomicity",
            f"reservation={row['reservation_name']} references order={row['order_ref']!r} "
            f"which is missing or cancelled, but the reservation is still active",
        )


def check_audit_log_completeness(query, cfg: dict, report: InvariantReport):
    audit_cfg = cfg.get("audit_log_completeness", {})
    order_table = audit_cfg.get("order_table", "tabSales Order")
    version_table = audit_cfg.get("version_table", "tabVersion")
    tracked_states = audit_cfg.get("tracked_docstatuses", [1, 2])  # submitted, cancelled
    since_clause = audit_cfg.get("since_clause", "1=1")
    rows = query(f"""
        SELECT o.name, o.docstatus, o.modified
        FROM `{order_table}` o
        WHERE o.docstatus IN ({','.join(str(s) for s in tracked_states)})
          AND {since_clause}
    """)
    for row in rows:
        versions = query(
            f"SELECT COUNT(*) AS c FROM `{version_table}` WHERE ref_doctype=%(dt)s AND docname=%(name)s",
            {"dt": order_table.replace("tab", "", 1), "name": row["name"]},
        )
        if not versions or versions[0]["c"] == 0:
            report.add(
                "audit-log-completeness",
                f"order={row['name']} docstatus={row['docstatus']} has no Version/audit rows at all",
            )


def main(config: str = "tests/live/config.example.json", standalone: bool = False) -> InvariantReport:
    with open(config) as f:
        cfg = json.load(f)
    query = _get_connection(cfg, standalone)
    report = InvariantReport()
    check_no_oversell(query, cfg, report)
    check_reservation_atomicity(query, cfg, report)
    check_audit_log_completeness(query, cfg, report)
    report.print_summary()
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="tests/live/config.example.json")
    parser.add_argument("--standalone", action="store_true",
                         help="Use raw DB connection from config['db'] instead of frappe.db "
                              "(use this when not running under `bench execute`)")
    args = parser.parse_args()
    report = main(config=args.config, standalone=args.standalone)
    sys.exit(0 if report.ok() else 1)
