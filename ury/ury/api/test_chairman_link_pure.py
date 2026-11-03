import unittest

from ury.ury.api import chairman_link as cl


class FakeRedis:
	def __init__(self):
		self.d, self.ttl = {}, {}

	def set(self, k, v, ex=None):
		self.d[k] = v
		self.ttl[k] = ex

	def getdel(self, k):
		return self.d.pop(k, None)

	def incr(self, k):
		self.d[k] = int(self.d.get(k, 0)) + 1
		return self.d[k]

	def expire(self, k, s):
		self.ttl[k] = s


class TestLinkToken(unittest.TestCase):
	def test_store_only_hash_and_ttl(self):
		r = FakeRedis()
		t = cl.new_token()
		self.assertGreaterEqual(len(t), 43)
		cl.store_token(r, t, "chair@x.com", "brief")
		self.assertTrue(all(t not in k and t not in v for k, v in r.d.items()))
		self.assertEqual(list(r.ttl.values()), [600])

	def test_single_use_and_bound_user(self):
		r = FakeRedis()
		t = cl.new_token()
		cl.store_token(r, t, "chair@x.com", "brief")
		rec = cl.consume_token(r, t)
		self.assertEqual(rec["user"], "chair@x.com")
		self.assertIsNone(cl.consume_token(r, t))

	def test_unknown_and_malformed(self):
		r = FakeRedis()
		for bad in (None, "", "x" * 500, 12345, "nope"):
			self.assertIsNone(cl.consume_token(r, bad))

	def test_rate_limit_ip_and_global(self):
		r = FakeRedis()
		res = [cl.check_rate(r, "1.1.1.1", now=1000) for _ in range(12)]
		self.assertEqual(res[:10], [True] * 10)
		self.assertFalse(res[10])
		self.assertTrue(cl.check_rate(r, "2.2.2.2", now=1000))
		self.assertTrue(cl.check_rate(r, "1.1.1.1", now=1000 + 61))  # new window
		g = FakeRedis()
		ok = [cl.check_rate(g, f"10.0.0.{i}", now=5) for i in range(130)]
		self.assertFalse(all(ok))
		self.assertEqual(sum(ok), cl.RATE_GLOBAL)

	def test_refusal(self):
		R = ["URY Chairman"]
		self.assertIsNone(cl.exchange_refusal("c@x.com", 1, R))
		self.assertEqual(cl.exchange_refusal("Administrator", 1, R), "forbidden_user")
		self.assertEqual(cl.exchange_refusal("Guest", 1, R), "forbidden_user")
		self.assertEqual(cl.exchange_refusal("c@x.com", 0, R), "disabled")
		self.assertEqual(cl.exchange_refusal("c@x.com", 1, ["Sales User"]), "no_role")

	def test_path_allowlist(self):
		ok = ["/ury/brief", "/ury/brief/", "/ury/brief/go", "/ury/brief/sw.js",
			"/api/method/ury.ury.api.chairman.get_brief", "/api/method/ury.ury.api.chairman_chat.send",
			"/assets/ury/brief/dist/assets/app.js", "/api/method/logout"]
		bad = ["/app", "/app/user", "/desk", "/api/resource/User", "/api/resource/Item/x",
			"/api/method/frappe.client.get_list", "/api/method/ury.ury.api.chairman_tools.x",
			"/api/method/ury.ury.api.chairman.", "/ury/brieffoo", "/ury/brief/../app",
			"/assets/../app", "/ury/brief/%2e%2e/app", "//app", "/api/v2/method/logout", "/", "/login",
			"/api/method/ury.ury.api.chairman_card_png.render"]
		for p in ok:
			self.assertTrue(cl.is_path_allowed(p), p)
		for p in bad:
			self.assertFalse(cl.is_path_allowed(p), p)


if __name__ == "__main__":
	unittest.main()
