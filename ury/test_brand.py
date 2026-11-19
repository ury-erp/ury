"""Site branding contracts, runnable without a Frappe bench."""

import importlib
import importlib.util
import json
import subprocess
import sys
import unittest
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from jinja2 import Environment


ROOT = Path(__file__).resolve().parents[1]
PAGES = {"pos": "pos", "urypos": "urypos", "mosaic": "mosaic", "order": "self-order"}
DEFAULT_TITLES = {"pos": "URY POS", "urypos": "URY POS", "mosaic": "Mosaic", "order": "Order"}
SITE_BRAND = {"name": 'Cafe\\Diner "</script><script>evil()</script>', "logo": '/files/logo"<&.png', "favicon": '/files/favicon"<&.ico'}


class PageParser(HTMLParser):

    def __init__(self, html):
        super().__init__()
        self.title = ""
        self.favicon = None
        self.source = None
        self.footer = ""
        self.in_title = False
        self.in_footer = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "footer":
            self.in_footer = True
        if tag == "link" and attrs.get("rel") == "icon":
            self.favicon = attrs.get("href")
        if tag == "a" and self.in_footer:
            self.source = attrs.get("href")

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "footer":
            self.in_footer = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_footer:
            self.footer += data


class TestSiteBrand(unittest.TestCase):

    def setUp(self):
        self.settings = SimpleNamespace(app_name=None, app_logo=None, favicon=None)
        framework = ModuleType("frappe")
        framework.__path__ = []
        framework.get_cached_doc = lambda doctype: self.settings if doctype == "Website Settings" else self.fail(doctype)
        framework.as_json = json.dumps
        framework.session = SimpleNamespace(user="Guest")
        framework.conf = {}
        framework.db = SimpleNamespace(commit=lambda: None)
        framework._ = lambda value: value

        def whitelist(**kwargs):
            def decorate(function):
                function.is_whitelisted = True
                return function
            return decorate

        framework.whitelist = whitelist
        sessions = ModuleType("frappe.sessions")
        sessions.get_csrf_token = lambda: "test-csrf"
        sessions.get = lambda: {"app_logo_url": "/assets/frappe/ignored.svg"}
        website = ModuleType("frappe.website")
        website.__path__ = []
        website_utils = ModuleType("frappe.website.utils")
        website_utils.get_boot_data = lambda: {"lang": "en"}
        utils = ModuleType("frappe.utils")
        utils.__path__ = []
        utils.get_build_version = lambda: "test-version"
        telemetry = ModuleType("frappe.utils.telemetry")
        telemetry.capture = lambda *args, **kwargs: None
        framework.sessions = sessions
        framework.website = website
        framework.utils = utils
        website.utils = website_utils
        self.framework = framework
        self.enterContext(patch.dict(sys.modules, {
            "frappe": framework, "frappe.sessions": sessions, "frappe.website": website,
            "frappe.website.utils": website_utils, "frappe.utils": utils,
            "frappe.utils.telemetry": telemetry,
        }))
        for name in ["ury.brand", *(f"ury.www.{page}" for page in PAGES)]:
            sys.modules.pop(name, None)

    def brand_module(self):
        self.assertIsNotNone(importlib.util.find_spec("ury.brand"), "Website Settings branding helper is missing")
        return importlib.import_module("ury.brand")

    def set_brand(self):
        self.settings.app_name = SITE_BRAND["name"]
        self.settings.app_logo = SITE_BRAND["logo"]
        self.settings.favicon = SITE_BRAND["favicon"]

    def context(self, page):
        return importlib.import_module(f"ury.www.{page}").get_context({})

    def render(self, page, context):
        template = Environment(autoescape=False).from_string((ROOT / PAGES[page] / "index.html").read_text())
        return template.render(**context, app_name=self.settings.app_name or "", frappe=SimpleNamespace(lang="en", session=self.framework.session))

    def test_empty_settings_return_none_not_frappe_defaults(self):
        self.assertIsNone(self.brand_module().get_brand())

    def test_set_settings_return_only_the_three_public_brand_fields(self):
        self.set_brand()
        brand = self.brand_module()
        self.assertEqual(brand.get_brand(), SITE_BRAND)
        self.assertFalse(getattr(brand.get_brand, "is_whitelisted", False))

    def test_partial_settings_leave_other_fields_unset(self):
        self.settings.app_logo = "/files/tenant.png"
        self.assertEqual(self.brand_module().get_brand(), {"name": None, "logo": "/files/tenant.png", "favicon": None})

    def test_all_controllers_preserve_unset_brand(self):
        for page in PAGES:
            with self.subTest(page=page):
                context = self.context(page)
                self.assertIn("brand", context)
                self.assertIsNone(context["brand"])

    def test_all_pages_roundtrip_brand_without_script_breakout(self):
        self.set_brand()
        for page in PAGES:
            with self.subTest(page=page):
                context = self.context(page)
                self.assertEqual(context.get("brand"), SITE_BRAND)
                html = self.render(page, context)
                # Execute the actual rendered boot script, not a copied serializer.
                parser = ScriptParser(html)
                self.assertEqual(len(parser.inline), 1)
                result = subprocess.run(["node", "-e", "global.window=global;" + parser.inline[0] + ";process.stdout.write(JSON.stringify(window.frappe.boot.ury_brand));"], text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout), SITE_BRAND)
                parsed = PageParser(html)
                self.assertEqual(parsed.title, SITE_BRAND["name"])
                self.assertEqual(parsed.favicon, SITE_BRAND["favicon"])

    def test_unset_templates_keep_current_titles_and_favicons(self):
        for page in PAGES:
            with self.subTest(page=page):
                parsed = PageParser(self.render(page, self.context(page)))
                self.assertEqual(parsed.title, DEFAULT_TITLES[page])
                self.assertEqual(parsed.favicon, "/ury.ico")

    def test_pos_and_guest_order_offer_public_source_and_escaped_brand(self):
        self.set_brand()
        for page in ("pos", "order"):
            with self.subTest(page=page):
                context = self.context(page)
                parsed = PageParser(self.render(page, context))
                self.assertIn(SITE_BRAND["name"] + " · built on URY (AGPL-3.0) · Source", " ".join(parsed.footer.split()))
                self.assertEqual(parsed.source, "https://github.com/ury-erp/ury")
                self.framework.conf["ury_source_url"] = "https://github.com/pmwanje2/ury/tree/public-release"
                parsed = PageParser(self.render(page, self.context(page)))
                self.assertEqual(parsed.source, "https://github.com/pmwanje2/ury/tree/public-release")
                self.framework.conf.clear()

    def test_authenticated_pos_and_dev_boot_include_site_brand(self):
        self.set_brand()
        self.framework.session.user = "cashier@example.com"
        controller = importlib.import_module("ury.www.pos")
        boot = json.loads(json.loads(self.context("pos")["boot"]))
        self.assertEqual(boot.get("ury_brand"), SITE_BRAND)
        self.assertEqual(json.loads(json.loads(controller.get_boot())).get("ury_brand"), SITE_BRAND)

    def test_boot_keeps_frappe_serialization_for_datetime_values(self):
        self.set_brand()
        self.framework.as_json = lambda value, **kwargs: json.dumps(value, default=lambda item: item.isoformat())
        self.framework.website.utils.get_boot_data = lambda: {"server_time": datetime(2026, 10, 5, 12, 30)}
        for page in ("pos", "order"):
            with self.subTest(page=page):
                try:
                    boot = json.loads(json.loads(self.context(page)["boot"]))
                except TypeError as error:
                    self.fail(f"Page boot must retain Frappe datetime serialization: {error}")
                self.assertEqual(boot["server_time"], "2026-10-05T12:30:00")
                self.assertEqual(boot["ury_brand"], SITE_BRAND)


class ScriptParser(HTMLParser):

    def __init__(self, html):
        super().__init__()
        self.inline = []
        self.in_inline = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "script" and "src" not in dict(attrs):
            self.inline.append("")
            self.in_inline = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_inline = False

    def handle_data(self, data):
        if self.in_inline:
            self.inline[-1] += data
