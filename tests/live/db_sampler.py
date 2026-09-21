#!/usr/bin/env python3
"""
tests/live/db_sampler.py

Lock/deadlock DB sampler for live-bench adversarial testing. Runs alongside
actor_harness.py, polling MariaDB/InnoDB lock and transaction state at a fixed interval and
writing samples to a file for post-run analysis.

Pattern extracted from the ad-hoc db_sampler.py used in the sa-production-control-unification
track's live-bench investigation (never committed). Generalized here: connection info is
config-driven, and it samples both the modern INNODB_TRX/INNODB_LOCK_WAITS +
sys.innodb_lock_waits views (MySQL 8 / recent MariaDB) and falls back to
`SHOW ENGINE INNODB STATUS` parsing on older MariaDB where those tables/views may be absent
or restricted.

Usage:
    python3 tests/live/db_sampler.py --config tests/live/config.example.json \
        --interval 2 --duration 120 --out tests/live/lock_samples.jsonl

Run this in a separate process/terminal concurrently with actor_harness.py, then inspect
the output file for any non-empty `trx` or `lock_waits` lists, or any samples where
InnoDB status shows a deadlock section.
"""
from __future__ import annotations

import argparse
import json
import sys
import time


def _connect(db_cfg: dict):
    import pymysql
    import pymysql.cursors
    return pymysql.connect(
        host=db_cfg["host"], port=db_cfg.get("port", 3306),
        user=db_cfg["user"], password=db_cfg["password"], database=db_cfg["database"],
        cursorclass=pymysql.cursors.DictCursor,
    )


def sample_once(conn) -> dict:
    sample = {"ts": time.time(), "trx": [], "lock_waits": [], "innodb_status_excerpt": None, "error": None}
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT trx_id, trx_state, trx_started, trx_wait_started, trx_mysql_thread_id,
                       trx_query, trx_tables_locked, trx_rows_locked
                FROM information_schema.INNODB_TRX
            """)
            sample["trx"] = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        sample["error"] = f"INNODB_TRX query failed: {exc}"

    # Try the modern lock-waits view first (INNODB_LOCK_WAITS on older MySQL/MariaDB,
    # sys.innodb_lock_waits on newer MySQL where the old table was removed).
    for query in (
        "SELECT * FROM information_schema.INNODB_LOCK_WAITS",
        "SELECT * FROM sys.innodb_lock_waits",
    ):
        try:
            with conn.cursor() as cur:
                cur.execute(query)
                sample["lock_waits"] = cur.fetchall()
            break
        except Exception:  # noqa: BLE001 - try next fallback
            continue

    try:
        with conn.cursor() as cur:
            cur.execute("SHOW ENGINE INNODB STATUS")
            row = cur.fetchone()
            status_text = row.get("Status", "") if row else ""
            if "LATEST DETECTED DEADLOCK" in status_text:
                idx = status_text.index("LATEST DETECTED DEADLOCK")
                sample["innodb_status_excerpt"] = status_text[idx:idx + 4000]
    except Exception as exc:  # noqa: BLE001
        sample["error"] = (sample["error"] or "") + f"; SHOW ENGINE INNODB STATUS failed: {exc}"

    return sample


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between samples")
    parser.add_argument("--duration", type=float, default=120.0, help="Total seconds to sample for")
    parser.add_argument("--out", default="tests/live/lock_samples.jsonl")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = json.load(f)
    conn = _connect(cfg["db"])

    n_samples = 0
    n_with_activity = 0
    deadlocks_seen = 0
    t_end = time.time() + args.duration
    with open(args.out, "w") as out_fh:
        while time.time() < t_end:
            sample = sample_once(conn)
            out_fh.write(json.dumps(sample, default=str) + "\n")
            out_fh.flush()
            n_samples += 1
            if sample["trx"] or sample["lock_waits"]:
                n_with_activity += 1
            if sample["innodb_status_excerpt"]:
                deadlocks_seen += 1
            time.sleep(args.interval)

    print(f"Sampled {n_samples} times over {args.duration}s. "
          f"{n_with_activity} sample(s) saw active transactions/lock waits; "
          f"{deadlocks_seen} sample(s) contained a recent deadlock report. "
          f"Raw samples in {args.out}")


if __name__ == "__main__":
    main()
