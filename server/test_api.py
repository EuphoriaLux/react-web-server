#!/usr/bin/env python3
"""API tests. Need a throwaway Postgres with db/schema.sql, db/accounts.sql and db/receipts.sql applied:

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

    def raw(self, method, path, data=None, headers=None):
        """For photos: bytes in, bytes and headers out."""
        request = urllib.request.Request(self.base + path, data=data, method=method)
        if self.cookie:
            request.add_header("Cookie", self.cookie)
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.read(), error.headers


JPEG = b"\xff\xd8\xff\xe0" + b"photo" * 100


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
            cur.execute("truncate households, users, login_tokens, account_deletions cascade")

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

    def test_plan_from_before_accounts_follows_the_link_to_another_site(self):
        legacy = "old-site-device-token"
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("insert into households (code) values ('OLDTWO') returning id")
            household_id = cur.fetchone()[0]
            cur.execute(
                "insert into members (household_id, role, token_hash) values (%s, 'B', %s)",
                (household_id, api.token_hash(legacy)),
            )
            cur.execute("insert into plans (household_id) values (%s)", (household_id,))
        old_site = Client(self.base)
        status, _ = old_site.call("POST", "/api/auth/request", {"email": "ben@example.com", "legacy": legacy})
        self.assertEqual(status, 200)
        token = self.links["ben@example.com"].split("?login=", 1)[1]
        # The link opens in a browser that has never seen the device token.
        new_site = Client(self.base)
        status, body = new_site.call("POST", "/api/auth/verify", {"token": token})
        self.assertEqual((status, body["household"]), (200, {"role": "B", "code": "OLDTWO"}))
        self.assertEqual(new_site.call("GET", "/api/state")[0], 200)
        self.assertEqual(old_site.call("GET", "/api/state", headers={"Authorization": f"Bearer {legacy}"})[0], 401)

    def test_unknown_device_token_claims_nothing(self):
        client = Client(self.base)
        client.call("POST", "/api/auth/request", {"email": "eve@example.com", "legacy": "made-up"})
        token = self.links["eve@example.com"].split("?login=", 1)[1]
        status, body = client.call("POST", "/api/auth/verify", {"token": token})
        self.assertEqual((status, body["household"]), (200, None))

    def plan_for_two(self):
        anna, _, _ = self.sign_in("anna@example.com")
        ben, _, _ = self.sign_in("ben@example.com")
        code = anna.call("POST", "/api/households", {})[1]["code"]
        ben.call("POST", "/api/households/join", {"code": code})
        anna.call("PUT", "/api/state", {"state": {"cp-family": "{\"children\": [\"Lea\"]}"}})
        anna.call("POST", "/api/notes", {"fact": "Shoes are in the bag", "urgent": True})
        return anna, ben, code

    def count(self, table):
        with api.db() as conn, conn.cursor() as cur:
            cur.execute(f"select count(*) from {table}")
            return cur.fetchone()[0]

    def test_export_holds_account_plan_and_notes(self):
        anna, _, code = self.plan_for_two()
        status, data = anna.call("GET", "/api/account/export")
        self.assertEqual(status, 200)
        self.assertEqual(data["account"]["email"], "anna@example.com")
        self.assertEqual(data["plan"]["code"], code)
        self.assertEqual(data["plan"]["content"]["cp-family"], {"children": ["Lea"]})
        self.assertEqual([n["fact"] for n in data["plan"]["notes"]], ["Shoes are in the bag"])
        self.assertEqual(Client(self.base).call("GET", "/api/account/export")[0], 401)

    def test_delete_needs_the_email_typed(self):
        anna, _, _ = self.sign_in("anna@example.com")
        self.assertEqual(anna.call("POST", "/api/account/delete", {"confirm": "nope"})[0], 400)
        self.assertEqual(anna.call("POST", "/api/account/delete", {})[0], 400)
        self.assertEqual(anna.call("GET", "/api/me")[0], 200)
        self.assertEqual(Client(self.base).call("POST", "/api/account/delete", {"confirm": "anna@example.com"})[0], 401)

    def test_deleting_one_parent_leaves_the_plan_with_the_other(self):
        anna, ben, code = self.plan_for_two()
        old_cookie = anna.cookie
        status, body = anna.call("POST", "/api/account/delete", {"confirm": "Anna@Example.com"})
        self.assertEqual((status, body["plan"]), (200, "kept"))
        self.assertIsNone(anna.cookie)
        anna.cookie = old_cookie
        self.assertEqual(anna.call("GET", "/api/me")[0], 401)
        self.assertEqual(self.count("users"), 1)
        self.assertEqual(self.count("login_tokens where email = 'anna@example.com'"), 0)
        # Ben keeps everything, under a new code the old parent does not know.
        status, state = ben.call("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertIn("cp-family", state["state"])
        self.assertNotEqual(state["code"], code)
        self.assertEqual(len(ben.call("GET", "/api/notes")[1]["notes"]), 1)
        # Signing up again with the old code does not get back in.
        again, _, _ = self.sign_in("anna@example.com")
        self.assertEqual(again.call("POST", "/api/households/join", {"code": code})[0], 404)
        # A new parent can take the free seat with the new code.
        status, joined = again.call("POST", "/api/households/join", {"code": state["code"]})
        self.assertEqual((status, joined["role"]), (200, "A"))
        self.assertEqual(self.count("account_deletions"), 1)

    def test_last_parent_deleting_removes_the_plan(self):
        anna, ben, _ = self.plan_for_two()
        self.assertEqual(ben.call("POST", "/api/account/delete", {"confirm": "ben@example.com"})[1]["plan"], "kept")
        status, body = anna.call("POST", "/api/account/delete", {"confirm": "anna@example.com"})
        self.assertEqual((status, body["plan"]), (200, "deleted"))
        for table in ("users", "households", "members", "plans", "notes", "sessions"):
            self.assertEqual(self.count(table), 0, table)
        self.assertEqual(self.count("account_deletions where household_deleted"), 1)

    def test_delete_without_a_plan(self):
        cara, _, _ = self.sign_in("cara@example.com")
        status, body = cara.call("POST", "/api/account/delete", {"confirm": "cara@example.com"})
        self.assertEqual((status, body["plan"]), (200, None))
        self.assertEqual(self.count("users"), 0)

    def test_cross_site_delete_is_refused(self):
        anna, _, _ = self.sign_in("anna@example.com")
        status, _ = anna.call("POST", "/api/account/delete", {"confirm": "anna@example.com"}, {"Origin": "https://evil.example"})
        self.assertEqual(status, 403)
        self.assertEqual(self.count("users"), 1)


    def upload(self, client, data=JPEG, headers=None):
        status, body, _ = client.raw("POST", "/api/receipts", data, {"Content-Type": "image/jpeg", **(headers or {})})
        return status, json.loads(body or b"{}")

    def test_both_parents_see_a_receipt_photo_and_nobody_else(self):
        anna, ben, _ = self.plan_for_two()
        status, body = self.upload(anna)
        self.assertEqual(status, 201)
        path = f"/api/receipts/{body['id']}"
        status, data, headers = ben.raw("GET", path)
        self.assertEqual((status, data, headers["Content-Type"]), (200, JPEG, "image/jpeg"))
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(Client(self.base).raw("GET", path)[0], 401)
        cara, _, _ = self.sign_in("cara@example.com")
        cara.call("POST", "/api/households", {})
        self.assertEqual(cara.raw("GET", path)[0], 404)
        self.assertEqual(cara.raw("DELETE", path)[0], 404)
        self.assertEqual(ben.raw("DELETE", path)[0], 200)
        self.assertEqual(anna.raw("GET", path)[0], 404)
        self.assertEqual(self.count("receipts"), 0)

    def test_only_real_photos_of_a_sensible_size(self):
        anna, _, _ = self.plan_for_two()
        self.assertEqual(self.upload(anna, b"<html>not a photo</html>")[0], 400)
        self.assertEqual(self.upload(anna, b"\xff\xd8\xff" + b"x" * api.RECEIPT_MAX_BYTES)[0], 413)
        self.assertEqual(self.upload(anna, JPEG, {"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.upload(Client(self.base))[0], 401)
        self.assertEqual(anna.raw("GET", "/api/receipts/not-an-id")[0], 404)
        self.assertEqual(anna.raw("DELETE", f"/api/receipts/{'0' * 8}-0000-0000-0000-{'0' * 12}", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.count("receipts"), 0)

    def test_each_plan_has_a_photo_cap(self):
        anna, _, _ = self.plan_for_two()
        old = api.RECEIPT_PLAN_BYTES
        api.RECEIPT_PLAN_BYTES = len(JPEG) * 2
        try:
            self.assertEqual(self.upload(anna)[0], 201)
            self.assertEqual(self.upload(anna)[0], 201)
            self.assertEqual(self.upload(anna)[0], 413)
        finally:
            api.RECEIPT_PLAN_BYTES = old

    def test_photos_are_in_the_export_and_go_with_the_plan(self):
        anna, ben, _ = self.plan_for_two()
        self.upload(anna)
        photos = anna.call("GET", "/api/account/export")[1]["plan"]["receipt_photos"]
        self.assertEqual(len(photos), 1)
        self.assertTrue(photos[0]["photo"].startswith("data:image/jpeg;base64,"))
        ben.call("POST", "/api/account/delete", {"confirm": "ben@example.com"})
        self.assertEqual(self.count("receipts"), 1)
        anna.call("POST", "/api/account/delete", {"confirm": "anna@example.com"})
        self.assertEqual(self.count("receipts"), 0)


if __name__ == "__main__":
    unittest.main()
