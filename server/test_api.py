#!/usr/bin/env python3
"""API tests. Need a throwaway Postgres with db/schema.sql and db/accounts.sql applied:

    DATABASE_URL=postgresql://user@127.0.0.1:5432/cptest python3 -m unittest server/test_api.py

Every table is emptied before each test, so never point this at real data.
"""
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api  # noqa: E402


class Client:
    """One browser: keeps its own session cookie."""

    def __init__(self, base):
        self.base = base
        self.cookie = None

    def call(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if self.cookie:
            request.add_header("Cookie", self.cookie)
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        try:
            with urllib.request.urlopen(request) as response:
                status, raw, got = response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            status, raw, got = error.code, error.read(), error.headers
        set_cookie = got.get("Set-Cookie")
        if set_cookie:
            pair = set_cookie.split(";", 1)[0]
            self.cookie = pair if pair.split("=", 1)[1] else None
            self.last_set_cookie = set_cookie
        return status, json.loads(raw or b"{}")


@unittest.skipUnless(os.environ.get("DATABASE_URL"), "DATABASE_URL is not set")
class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.links = {}
        api.send_login_email = lambda email, link: cls.links.__setitem__(email, link)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        api.LIMITS = api.RateLimiter()
        self.links.clear()
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("truncate households, users, login_tokens cascade")

    def sign_in(self, email):
        client = Client(self.base)
        status, _ = client.call("POST", "/api/auth/request", {"email": email})
        self.assertEqual(status, 200)
        token = self.links[email.lower()].split("?login=", 1)[1]
        status, body = client.call("POST", "/api/auth/verify", {"token": token})
        self.assertEqual(status, 200)
        return client, body, token

    def test_sign_in_sets_an_http_only_cookie(self):
        client, body, _ = self.sign_in("Anna@Example.com")
        self.assertEqual(body, {"email": "anna@example.com", "household": None})
        self.assertIn("HttpOnly", client.last_set_cookie)
        self.assertIn("SameSite=Lax", client.last_set_cookie)
        self.assertEqual(client.call("GET", "/api/me")[0], 200)

    def test_link_works_once(self):
        _, _, token = self.sign_in("anna@example.com")
        status, _ = Client(self.base).call("POST", "/api/auth/verify", {"token": token})
        self.assertEqual(status, 400)

    def test_expired_link_is_refused(self):
        client = Client(self.base)
        client.call("POST", "/api/auth/request", {"email": "anna@example.com"})
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("update login_tokens set expires_at = now() - interval '1 minute'")
        token = self.links["anna@example.com"].split("?login=", 1)[1]
        self.assertEqual(client.call("POST", "/api/auth/verify", {"token": token})[0], 400)

    def test_bad_email_and_rate_limit(self):
        client = Client(self.base)
        self.assertEqual(client.call("POST", "/api/auth/request", {"email": "nope"})[0], 400)
        for _ in range(3):
            self.assertEqual(client.call("POST", "/api/auth/request", {"email": "a@example.com"})[0], 200)
        self.assertEqual(client.call("POST", "/api/auth/request", {"email": "a@example.com"})[0], 429)

    def test_nothing_works_signed_out(self):
        client = Client(self.base)
        self.assertEqual(client.call("GET", "/api/me")[0], 401)
        self.assertEqual(client.call("POST", "/api/households", {})[0], 401)
        self.assertEqual(client.call("POST", "/api/households/join", {"code": "ABCDEF"})[0], 401)
        self.assertEqual(client.call("GET", "/api/state")[0], 401)
        self.assertEqual(client.call("PUT", "/api/state", {"state": {}})[0], 401)
        self.assertEqual(client.call("GET", "/api/notes")[0], 401)

    def test_two_parents_share_one_plan(self):
        anna, _, _ = self.sign_in("anna@example.com")
        ben, _, _ = self.sign_in("ben@example.com")
        status, created = anna.call("POST", "/api/households", {})
        self.assertEqual((status, created["role"]), (201, "A"))
        self.assertNotIn("token", created)
        self.assertEqual(anna.call("POST", "/api/households", {})[0], 409)
        status, joined = ben.call("POST", "/api/households/join", {"code": created["code"].lower()})
        self.assertEqual((status, joined["role"]), (200, "B"))
        self.assertEqual(anna.call("PUT", "/api/state", {"state": {"cp-events": "[1]"}})[0], 200)
        status, state = ben.call("GET", "/api/state")
        self.assertEqual((status, state["role"], state["state"]), (200, "B", {"cp-events": "[1]"}))
        self.assertEqual(ben.call("GET", "/api/me")[1]["household"], {"role": "B", "code": created["code"]})

        cara, _, _ = self.sign_in("cara@example.com")
        self.assertEqual(cara.call("POST", "/api/households/join", {"code": created["code"]})[0], 409)
        self.assertEqual(cara.call("GET", "/api/state")[0], 401)

    def test_notes_between_parents(self):
        anna, _, _ = self.sign_in("anna@example.com")
        ben, _, _ = self.sign_in("ben@example.com")
        code = anna.call("POST", "/api/households", {})[1]["code"]
        ben.call("POST", "/api/households/join", {"code": code})
        status, note = anna.call("POST", "/api/notes", {"fact": "Shoes are in the bag", "urgent": True})
        self.assertEqual((status, note["author"]), (201, "A"))
        notes = ben.call("GET", "/api/notes?channel=handover")[1]["notes"]
        self.assertEqual([item["fact"] for item in notes], ["Shoes are in the bag"])

    def test_join_guessing_is_capped(self):
        anna, _, _ = self.sign_in("anna@example.com")
        for _ in range(8):
            self.assertEqual(anna.call("POST", "/api/households/join", {"code": "ZZZZZZ"})[0], 404)
        self.assertEqual(anna.call("POST", "/api/households/join", {"code": "ZZZZZZ"})[0], 429)

    def test_sign_out_ends_the_session(self):
        anna, _, _ = self.sign_in("anna@example.com")
        old = anna.cookie
        self.assertEqual(anna.call("POST", "/api/auth/logout", {})[0], 200)
        self.assertIsNone(anna.cookie)
        anna.cookie = old
        self.assertEqual(anna.call("GET", "/api/me")[0], 401)

    def test_cross_site_write_is_refused(self):
        anna, _, _ = self.sign_in("anna@example.com")
        status, _ = anna.call("POST", "/api/households", {}, {"Origin": "https://evil.example"})
        self.assertEqual(status, 403)

    def test_plan_from_before_accounts_can_be_claimed(self):
        legacy = "legacy-device-token"
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("insert into households (code) values ('OLDPLN') returning id")
            household_id = cur.fetchone()[0]
            cur.execute(
                "insert into members (household_id, role, token_hash) values (%s, 'A', %s)",
                (household_id, api.token_hash(legacy)),
            )
            cur.execute("insert into plans (household_id, state) values (%s, '{\"cp-rules\": \"x\"}')", (household_id,))
        bearer = {"Authorization": f"Bearer {legacy}"}
        device = Client(self.base)
        self.assertEqual(device.call("GET", "/api/state", headers=bearer)[0], 200)

        anna, _, _ = self.sign_in("anna@example.com")
        status, claimed = anna.call("POST", "/api/households/claim", {"token": legacy})
        self.assertEqual((status, claimed), (200, {"code": "OLDPLN", "role": "A"}))
        self.assertEqual(anna.call("GET", "/api/state")[1]["state"], {"cp-rules": "x"})
        # The old token stops working once the plan belongs to an account.
        self.assertEqual(device.call("GET", "/api/state", headers=bearer)[0], 401)
        ben, _, _ = self.sign_in("ben@example.com")
        self.assertEqual(ben.call("POST", "/api/households/claim", {"token": legacy})[0], 404)


if __name__ == "__main__":
    unittest.main()
