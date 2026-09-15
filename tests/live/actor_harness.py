#!/usr/bin/env python3
"""
tests/live/actor_harness.py

Generic HTTP order-lifecycle actor harness for live-bench adversarial testing.

Pattern extracted from the ad-hoc harness.py used in the sa-production-control-unification
track's live-bench investigation. That harness was never committed (it was a throwaway
script driving order lifecycle actions against one specific bench during one investigation).
This is the same PATTERN, generalized: N concurrent "actor" threads each repeatedly drive an
order through create -> add_items -> submit -> pay -> close against a real running Frappe
bench over HTTP, using the site's REST/RPC API. It intentionally does NOT special-case any
one past investigation -- callers point it at whatever endpoints/config apply to the change
under test.

This is NOT a unit test and is NOT meant to run in CI. See tests/live/README.md for the
full manual pre-merge-gate procedure this is designed to be used in.

Usage:
    python3 tests/live/actor_harness.py --config tests/live/config.example.json \
        --concurrency 8 --orders-per-actor 5 --out results.jsonl

Exit code is non-zero if any actor recorded a hard failure (network error / 5xx / unexpected
schema), so it composes with `set -e` shell orchestration. Business-level invariant
violations (oversell, missing audit rows, etc.) are NOT checked here -- that is
invariant_checker.py's job, run separately against the DB after the harness completes.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

try:
    import requests
except ImportError:  # pragma: no cover
    print("This harness requires the 'requests' package: pip install requests", file=sys.stderr)
    raise


@dataclass
class ActorResult:
    actor_id: int
    order_ref: str | None
    steps_completed: list[str] = field(default_factory=list)
    error: str | None = None
    latencies_ms: dict[str, float] = field(default_factory=dict)
    started_at: float = 0.0
    finished_at: float = 0.0


class BenchClient:
    """Thin wrapper around a Frappe bench's HTTP API for one authenticated session."""

    def __init__(self, base_url: str, api_key: str | None = None, api_secret: str | None = None,
                 cookies: dict[str, str] | None = None, timeout: float = 15.0,
                 host_header: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        if api_key and api_secret:
            self.session.headers["Authorization"] = f"token {api_key}:{api_secret}"
        if cookies:
            self.session.cookies.update(cookies)
        if host_header:
            # Multi-tenant Frappe resolves the site purely off the Host header.
            # Needed when hitting a bench's raw dev-server port directly (e.g.
            # http://localhost:8114) rather than through the real
            # nginx/traefik-routed hostname -- found while pointing this harness
            # at a real bench (sa-testcov-verify) that only listens on its own
            # port, not :80/:443 with SNI routing.
            self.session.headers["Host"] = host_header

    def call(self, method: str, args: dict[str, Any] | None = None) -> Any:
        """Call a whitelisted Frappe method via /api/method/<dotted.path>."""
        url = f"{self.base_url}/api/method/{method}"
        resp = self.session.post(url, json=args or {}, timeout=self.timeout)
        resp.raise_for_status()
        body = resp.json()
        return body.get("message", body)

    def get_doc(self, doctype: str, name: str) -> Any:
        url = f"{self.base_url}/api/resource/{doctype}/{name}"
        resp = self.session.get(url, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json().get("data")


class OrderActor:
    """
    Drives one simulated customer/POS actor through repeated order lifecycles.

    The exact whitelisted method names are config-driven (see config.example.json)
    because they legitimately differ between investigations (POS order vs KOT ticket vs
    self-order flow) -- this class only encodes the *shape* of the lifecycle:
    create -> add items -> submit -> pay -> close, each optionally skippable.

    Set config["flow"] = "ury_pos" to drive the real URY app's order lifecycle, reverse
    engineered from `ury/ury/doctype/ury_order/ury_order.py` (found: there is no separate
    create/add_item/submit split -- one whitelisted `sync_order` call both creates a draft
    `POS Invoice` (first call, `invoice=None`) and re-syncs its item list on every
    subsequent call for the same table; payment + submit are a *second*, separate
    whitelisted call, `make_invoice`, not three more granular ones). Any other value keeps
    the original generic 5-step create/add_item/submit/pay/close shape for a differently
    shaped app.
    """

    def __init__(self, actor_id: int, client: BenchClient, endpoints: dict[str, str],
                 item_pool: list[dict[str, Any]], branch: str | None = None,
                 flow: str = "generic", extra: dict[str, Any] | None = None):
        self.actor_id = actor_id
        self.client = client
        self.endpoints = endpoints
        self.item_pool = item_pool
        self.branch = branch
        self.flow = flow
        self.extra = extra or {}

    def _timed(self, fn, *args, **kwargs):
        t0 = time.monotonic()
        result = fn(*args, **kwargs)
        return result, (time.monotonic() - t0) * 1000.0

    def run_once(self) -> ActorResult:
        if self.flow == "ury_pos":
            return self._run_once_ury_pos()
        return self._run_once_generic()

    def _run_once_ury_pos(self) -> ActorResult:
        """Real URY POS order lifecycle: sync_order (create+add items) -> make_invoice
        (apply payment + submit). Deliberately racy: `table` is picked from a shared pool
        so concurrent actors can target the same table -- sync_order's own
        table-occupied/last_modified_time staleness check is exactly the concurrency
        control under test here, not something this harness works around."""
        import random as _random
        table = _random.choice(self.extra["tables"])
        result = ActorResult(actor_id=self.actor_id, order_ref=None, started_at=time.time())
        try:
            items = _random.sample(self.item_pool, k=min(len(self.item_pool), _random.randint(1, 3)))
            sync_args = {
                "items": [
                    {"item": it["item"], "item_name": it.get("item_name", it["item"]),
                     "rate": it["rate"], "qty": it.get("qty", 1)}
                    for it in items
                ],
                "cashier": self.extra["cashier"],
                "owner": self.extra["owner"],
                "mode_of_payment": self.extra.get("mode_of_payment", "Cash"),
                "customer": self.extra["customer"],
                "no_of_pax": 2,
                "last_invoice": None,
                "waiter": self.extra["waiter"],
                "pos_profile": self.extra["pos_profile"],
                "table": table,
                "invoice": None,
                "order_type": "Dine In",
            }
            order, ms = self._timed(self.client.call, self.endpoints["create"], sync_args)
            result.latencies_ms["create"] = ms
            if not isinstance(order, dict) or order.get("status") == "Failure" or not order.get("name"):
                result.error = f"sync_order (create) did not return a usable invoice: {order!r}"
                result.finished_at = time.time()
                return result
            invoice_name = order["name"]
            result.order_ref = invoice_name
            result.steps_completed.append("create")

            # 2. re-sync (add another item) against the just-created invoice, exercising
            # the update path (invoice= set, last_invoice unset -- matches what the real
            # frontend does when a Captain keeps adding items before printing/billing).
            more_items = _random.sample(self.item_pool, k=1)
            sync_args2 = dict(sync_args)
            sync_args2["items"] = sync_args["items"] + [
                {"item": it["item"], "item_name": it.get("item_name", it["item"]),
                 "rate": it["rate"], "qty": it.get("qty", 1)}
                for it in more_items
            ]
            sync_args2["invoice"] = invoice_name
            sync_args2["table"] = table
            order2, ms = self._timed(self.client.call, self.endpoints["add_item"], sync_args2)
            result.latencies_ms["add_item_total"] = ms
            if not isinstance(order2, dict) or order2.get("status") == "Failure":
                result.error = f"sync_order (re-sync) rejected: {order2!r}"
                result.finished_at = time.time()
                return result
            result.steps_completed.append("add_items")

            # 3+4. pay+submit in one call (make_invoice) -- this app has no separate
            # submit step; payment application and doc.submit() happen together server-side.
            grand_total = order2.get("grand_total") or order2.get("rounded_total")
            pay_args = {
                "customer": self.extra["customer"],
                "payments": [{"mode_of_payment": self.extra.get("mode_of_payment", "Cash"),
                               "amount": grand_total}],
                "cashier": self.extra["cashier"],
                "pos_profile": self.extra["pos_profile"],
                "owner": self.extra["owner"],
                "table": table,
                "invoice": invoice_name,
            }
            paid, ms = self._timed(self.client.call, self.endpoints["pay"], pay_args)
            result.latencies_ms["pay"] = ms
            result.steps_completed.append("submit")
            result.steps_completed.append("pay")
        except Exception as exc:  # noqa: BLE001
            result.error = f"{type(exc).__name__}: {exc}"
        finally:
            result.finished_at = time.time()
        return result

    def _run_once_generic(self) -> ActorResult:
        result = ActorResult(actor_id=self.actor_id, order_ref=None, started_at=time.time())
        try:
            # 1. create
            create_args = {"branch": self.branch} if self.branch else {}
            create_args["idempotency_key"] = str(uuid.uuid4())
            order, ms = self._timed(self.client.call, self.endpoints["create"], create_args)
            order_ref = order.get("name") if isinstance(order, dict) else order
            result.order_ref = order_ref
            result.latencies_ms["create"] = ms
            result.steps_completed.append("create")

            # 2. add a random handful of items from the pool (deliberately racy: several
            #    actors may target overlapping items/branches concurrently by design).
            items = random.sample(self.item_pool, k=min(len(self.item_pool), random.randint(1, 3)))
            for item in items:
                _, ms = self._timed(
                    self.client.call,
                    self.endpoints["add_item"],
                    {"order": order_ref, "item_code": item["item_code"], "qty": item.get("qty", 1)},
                )
                result.latencies_ms.setdefault("add_item_total", 0.0)
                result.latencies_ms["add_item_total"] += ms
            result.steps_completed.append("add_items")

            # 3. submit
            _, ms = self._timed(self.client.call, self.endpoints["submit"], {"order": order_ref})
            result.latencies_ms["submit"] = ms
            result.steps_completed.append("submit")

            # 4. pay
            _, ms = self._timed(
                self.client.call,
                self.endpoints["pay"],
                {"order": order_ref, "mode_of_payment": "Cash"},
            )
            result.latencies_ms["pay"] = ms
            result.steps_completed.append("pay")

            # 5. close (optional -- e.g. closing entries batch orders, not per-order)
            if "close" in self.endpoints:
                _, ms = self._timed(self.client.call, self.endpoints["close"], {"order": order_ref})
                result.latencies_ms["close"] = ms
                result.steps_completed.append("close")

        except Exception as exc:  # noqa: BLE001 - harness must record, not raise, actor errors
            result.error = f"{type(exc).__name__}: {exc}"
        finally:
            result.finished_at = time.time()
        return result


def run_actor_loop(actor: OrderActor, n_orders: int, out_lock: threading.Lock, out_fh) -> list[ActorResult]:
    results = []
    for _ in range(n_orders):
        r = actor.run_once()
        results.append(r)
        with out_lock:
            out_fh.write(json.dumps(r.__dict__) + "\n")
            out_fh.flush()
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Path to a config JSON (see config.example.json)")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of concurrent actors (5-10 recommended)")
    parser.add_argument("--orders-per-actor", type=int, default=5)
    parser.add_argument("--out", default="tests/live/results.jsonl")
    parser.add_argument("--dry-run", action="store_true",
                         help="Build actors and validate config/connectivity but do not drive any orders.")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = json.load(f)

    client_factory = lambda: BenchClient(
        base_url=cfg["bench_url"],
        api_key=cfg.get("api_key"),
        api_secret=cfg.get("api_secret"),
        cookies=cfg.get("cookies"),
        host_header=cfg.get("host_header"),
    )
    flow = cfg.get("flow", "generic")
    extra = {
        "tables": cfg.get("tables"),
        "cashier": cfg.get("cashier"),
        "owner": cfg.get("owner"),
        "waiter": cfg.get("waiter"),
        "pos_profile": cfg.get("pos_profile"),
        "customer": cfg.get("customer"),
        "mode_of_payment": cfg.get("mode_of_payment", "Cash"),
    }

    if args.dry_run:
        c = client_factory()
        try:
            c.session.get(cfg["bench_url"], timeout=10)
            print(f"[dry-run] reached {cfg['bench_url']} OK; config has {args.concurrency} actors configured, "
                  f"{len(cfg.get('item_pool', []))} items in pool. Not driving any orders.")
        except Exception as exc:  # noqa: BLE001
            print(f"[dry-run] FAILED to reach {cfg['bench_url']}: {exc}", file=sys.stderr)
            sys.exit(1)
        return

    out_lock = threading.Lock()
    all_results: list[ActorResult] = []
    threads = []
    results_by_actor: dict[int, list[ActorResult]] = {}

    with open(args.out, "w") as out_fh:
        def worker(i):
            actor = OrderActor(i, client_factory(), cfg["endpoints"], cfg["item_pool"], cfg.get("branch"),
                                flow=flow, extra=extra)
            results_by_actor[i] = run_actor_loop(actor, args.orders_per_actor, out_lock, out_fh)

        for i in range(args.concurrency):
            t = threading.Thread(target=worker, args=(i,))
            threads.append(t)
            t.start()
        for t in threads:
            t.join()

    for rs in results_by_actor.values():
        all_results.extend(rs)

    n_errors = sum(1 for r in all_results if r.error)
    print(f"Ran {len(all_results)} order lifecycles across {args.concurrency} actors: "
          f"{len(all_results) - n_errors} clean, {n_errors} errored. Raw results in {args.out}")
    if n_errors:
        for r in all_results:
            if r.error:
                print(f"  actor={r.actor_id} order={r.order_ref} steps={r.steps_completed} error={r.error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
