"""Run a URY test module without `bench run-tests`.

`bench run-tests` first generates ERPNext test records, which fails on this
bench (missing Payment Gateway) and fills the site with _Test data. URY's tests
use mocks, so plain unittest is enough. Always run against the test site:
  cd /workspace/frappe-bench/sites && ../env/bin/python /source/ury/docker/local/run_tests.py ury.ury.doctype.ury_order.test_ury_order
"""
import os
import sys
import unittest

import frappe

frappe.init(os.environ.get("URY_TEST_SITE", "ury-test.localhost"), sites_path="/workspace/frappe-bench/sites")
frappe.connect()
frappe.flags.in_test = True
try:
	suite = unittest.defaultTestLoader.loadTestsFromName(sys.argv[1])
	result = unittest.TextTestRunner(verbosity=2).run(suite)
finally:
	frappe.db.rollback()
	frappe.destroy()
sys.exit(not result.wasSuccessful())
