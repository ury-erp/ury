"""Unit tests for Redis-based print job monitoring.

These tests use a lightweight in-memory fake for ``frappe.cache()``/Redis so
that no running Redis server is required.
"""

import time
from unittest.mock import MagicMock, patch

import redis
from frappe.tests.utils import FrappeTestCase

from ury.ury.printing.print_job_monitor import (
    MONITOR_ZSET,
    acquire_job_lock,
    get_due_print_jobs,
    get_print_job,
    register_print_job,
    release_job_lock,
    remove_print_job,
    schedule_next_check,
    update_print_job,
)
from ury.ury.printing.state_machine import (
    CANCELED,
    COMPLETED,
    FAILED,
    PENDING,
    PROCESSING,
    SUBMITTED,
)


class FakeCache:
    """Minimal in-memory stand-in for the Frappe Redis cache client."""

    def __init__(self):
        self.hashes = {}
        self.zsets = {}
        self.strings = {}
        self.ttls = {}

    def hset(self, name, key, value):
        self.hashes.setdefault(name, {})[key] = value

    def hget(self, name, key):
        return self.hashes.get(name, {}).get(key)

    def hdel(self, name, key):
        self.hashes.get(name, {}).pop(key, None)

    def zadd(self, name, mapping):
        self.zsets.setdefault(name, {}).update(mapping)

    def zrangebyscore(self, name, min_score, max_score):
        data = self.zsets.get(name, {})
        return [member for member, score in data.items() if score <= max_score]

    def zrem(self, name, *members):
        data = self.zsets.get(name, {})
        removed = 0
        for member in members:
            if member in data:
                del data[member]
                removed += 1
        return removed

    def set(self, name, value, nx=False, ex=None):
        if nx and name in self.strings:
            return None
        self.strings[name] = value
        self.ttls[name] = ex
        return True

    def delete(self, *keys):
        for key in keys:
            self.hashes.pop(key, None)
            self.strings.pop(key, None)
            self.ttls.pop(key, None)

    def delete_value(self, keys, make_keys=True):
        if not keys:
            return
        if isinstance(keys, str):
            keys = (keys,)
        self.delete(*keys)

    def make_key(self, key):
        return key

    def scan_iter(self, match=None):
        import fnmatch

        for key in list(self.hashes.keys()):
            if match is None or fnmatch.fnmatch(key, match):
                yield key

    def expire(self, name, time):
        if name in self.hashes or name in self.strings:
            self.ttls[name] = time
        return True


class TestPrintJobMonitoring(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self.fake = FakeCache()
        self.redis_patch = patch(
            "ury.ury.printing.print_job_monitor._redis",
            return_value=self.fake,
        )
        self.redis_patch.start()

    def tearDown(self):
        self.redis_patch.stop()
        super().tearDown()

    def _sample_metadata(self, print_job_id):
        return {
            "print_job_id": print_job_id,
            "cups_job_id": 123,
            "invoice": "INV-001",
            "printer_setting": "Printer-A",
            "printer_name": "Kitchen Printer",
            "server_ip": "127.0.0.1",
            "port": 631,
            "status": SUBMITTED,
        }

    def test_register_print_job_stores_metadata_and_monitor_entry(self):
        """Registering a job writes metadata and adds it to the monitor zset."""
        metadata = self._sample_metadata("PJ-001")

        result = register_print_job(metadata)

        self.assertEqual(result, "PJ-001")
        stored = get_print_job("PJ-001")
        self.assertIsNotNone(stored)
        self.assertEqual(stored["print_job_id"], "PJ-001")
        self.assertEqual(stored["invoice"], "INV-001")
        self.assertEqual(stored["status"], SUBMITTED)
        self.assertIn("monitoring_deadline", stored)
        self.assertAlmostEqual(
            stored["monitoring_deadline"], time.time() + 30, delta=1
        )
        self.assertEqual(stored["long_running_notification_sent"], False)
        self.assertIn("PJ-001", self.fake.zsets.get(MONITOR_ZSET, {}))
        score = self.fake.zsets[MONITOR_ZSET]["PJ-001"]
        self.assertAlmostEqual(score, time.time() + 2, delta=1)

    def test_get_due_print_jobs_returns_eligible_jobs(self):
        """Only jobs with score <= now_ts are returned."""
        for job_id in ("PJ-due-1", "PJ-due-2", "PJ-future"):
            register_print_job(self._sample_metadata(job_id))

        self.fake.zsets[MONITOR_ZSET]["PJ-due-1"] = 100
        self.fake.zsets[MONITOR_ZSET]["PJ-due-2"] = 200
        self.fake.zsets[MONITOR_ZSET]["PJ-future"] = 10000

        due = get_due_print_jobs(now_ts=500)

        self.assertIn("PJ-due-1", due)
        self.assertIn("PJ-due-2", due)
        self.assertNotIn("PJ-future", due)

    def test_acquire_and_release_job_lock(self):
        """Locks are acquired atomically and can be released."""
        self.assertTrue(acquire_job_lock("PJ-001"))
        self.assertIn("print_job_lock:PJ-001", self.fake.strings)
        self.assertEqual(self.fake.ttls["print_job_lock:PJ-001"], 15)

        # Second acquire while held must fail.
        self.assertFalse(acquire_job_lock("PJ-001"))

        release_job_lock("PJ-001")
        self.assertNotIn("print_job_lock:PJ-001", self.fake.strings)

        # Lock can be re-acquired after release.
        self.assertTrue(acquire_job_lock("PJ-001", ttl_seconds=30))
        self.assertEqual(self.fake.ttls["print_job_lock:PJ-001"], 30)

    def test_update_print_job_merges_fields(self):
        """Updating a job merges new fields into stored metadata."""
        register_print_job(self._sample_metadata("PJ-001"))

        updated = update_print_job("PJ-001", {"status": PROCESSING, "retry_count": 1})

        self.assertIsNotNone(updated)
        self.assertEqual(updated["status"], PROCESSING)
        self.assertEqual(updated["retry_count"], 1)
        self.assertEqual(updated["invoice"], "INV-001")
        self.assertEqual(get_print_job("PJ-001")["status"], PROCESSING)

    def test_schedule_next_check_for_submitted_and_pending(self):
        """SUBMITTED and PENDING jobs are checked again after 2 seconds."""
        for state in (SUBMITTED, PENDING):
            job_id = f"PJ-{state.lower()}"
            register_print_job(self._sample_metadata(job_id))
            before = time.time()

            next_check = schedule_next_check(job_id, state)

            after = time.time()
            self.assertIsNotNone(next_check)
            self.assertAlmostEqual(next_check, before + 2, delta=1)
            self.assertLessEqual(next_check, after + 2)
            self.assertEqual(self.fake.zsets[MONITOR_ZSET][job_id], next_check)

    def test_schedule_next_check_processing_backoff(self):
        """PROCESSING jobs back off exponentially after the threshold."""
        cases = [
            (0, 2),
            (1, 2),
            (5, 2),
            (6, 3),
            (10, 15.1875),  # 2 * 1.5 ** 5
            (15, 30),  # capped at MAX_INTERVAL_SECONDS
        ]
        for retry_count, expected_interval in cases:
            job_id = f"PJ-processing-{retry_count}"
            register_print_job(self._sample_metadata(job_id))
            before = time.time()

            next_check = schedule_next_check(job_id, PROCESSING, retry_count=retry_count)

            after = time.time()
            self.assertIsNotNone(next_check)
            self.assertAlmostEqual(next_check, before + expected_interval, delta=2)
            self.assertGreaterEqual(next_check, before + expected_interval)
            self.assertLessEqual(next_check, after + expected_interval)
            self.assertEqual(self.fake.zsets[MONITOR_ZSET][job_id], next_check)

    def test_schedule_next_check_terminal_states_stop_monitoring(self):
        """Terminal states stop monitoring but retain metadata with a 24h TTL."""
        from ury.ury.printing.print_job_monitor import _job_key

        for state in (COMPLETED, FAILED, CANCELED):
            job_id = f"PJ-{state.lower()}"
            register_print_job(self._sample_metadata(job_id))

            result = schedule_next_check(job_id, state)

            self.assertIsNone(result)
            self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
            metadata = get_print_job(job_id)
            self.assertIsNotNone(metadata)
            self.assertEqual(metadata["status"], state)
            self.assertEqual(self.fake.ttls.get(_job_key(job_id)), 86400)

    def test_remove_print_job_cleans_all_keys(self):
        """Removing a job deletes metadata, monitor entry, and lock."""
        register_print_job(self._sample_metadata("PJ-001"))
        acquire_job_lock("PJ-001")

        remove_print_job("PJ-001")

        self.assertNotIn("PJ-001", self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNone(get_print_job("PJ-001"))
        self.assertNotIn("print_job_lock:PJ-001", self.fake.strings)

    def test_redis_connection_errors_fall_back_gracefully(self):
        """All public functions degrade safely when Redis is unreachable."""
        bad_cache = MagicMock()
        bad_cache.hset.side_effect = redis.exceptions.ConnectionError
        bad_cache.zadd.side_effect = redis.exceptions.ConnectionError
        bad_cache.zrangebyscore.side_effect = redis.exceptions.ConnectionError
        bad_cache.zrem.side_effect = redis.exceptions.ConnectionError
        bad_cache.set.side_effect = redis.exceptions.ConnectionError
        bad_cache.hget.return_value = None
        bad_cache.delete_value.side_effect = redis.exceptions.ConnectionError

        with patch(
            "ury.ury.printing.print_job_monitor._redis",
            return_value=bad_cache,
        ):
            self.assertIsNone(register_print_job({"print_job_id": "PJ-bad"}))
            self.assertEqual(get_due_print_jobs(now_ts=1), [])
            self.assertFalse(acquire_job_lock("PJ-bad"))
            self.assertIsNone(update_print_job("PJ-bad", {"status": PROCESSING}))
            self.assertIsNone(schedule_next_check("PJ-bad", SUBMITTED))

            # remove / release should not raise despite Redis errors.
            remove_print_job("PJ-bad")
            release_job_lock("PJ-bad")
