#!/usr/bin/env python3
"""API tests. Need a throwaway Postgres with db/schema.sql, db/accounts.sql, db/receipts.sql, db/beta.sql and db/agents.sql applied:

    DATABASE_URL=postgresql://user@127.0.0.1:5432/cptest python3 -m unittest server/test_api.py

Every table is emptied before each test, so never point this at real data.
"""
import base64
import hashlib
import json
import os
import re
import sys
import threading
import unittest
import urllib.error
import urllib.parse
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
        # Most tests are about plans, not the beta gate, which has its own tests.
        api.BETA_GATE = False
        self.links.clear()
        self.notices = []
        api.send_beta_notice = self.notices.append
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("truncate households, users, login_tokens, account_deletions, beta_signups cascade")

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


    def test_photos_the_plan_forgot_are_deleted_after_a_week(self):
        anna, ben, _ = self.plan_for_two()
        kept = self.upload(anna)[1]["id"]
        dropped = self.upload(anna)[1]["id"]
        expenses = json.dumps([{"id": 1, "desc": "Shoes", "amount": 40, "receipts": [kept]}])
        anna.call("PUT", "/api/state", {"state": {"cp-expenses": expenses}})
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("select id::text, unreferenced_since is not null from receipts order by id")
            marks = dict(cur.fetchall())
        self.assertEqual(marks, {kept: False, dropped: True})
        # A week later the forgotten photo goes, the attached one stays.
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("update receipts set unreferenced_since = now() - interval '8 days' where id = %s", (dropped,))
        ben.call("PUT", "/api/state", {"state": {"cp-expenses": expenses}})
        self.assertEqual(ben.raw("GET", f"/api/receipts/{dropped}")[0], 404)
        self.assertEqual(ben.raw("GET", f"/api/receipts/{kept}")[0], 200)
        # Attached again in time: no longer marked. Unreadable expenses delete nothing.
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("update receipts set unreferenced_since = now() - interval '8 days'")
        anna.call("PUT", "/api/state", {"state": {"cp-expenses": "not json"}})
        self.assertEqual(self.count("receipts"), 1)
        anna.call("PUT", "/api/state", {"state": {"cp-expenses": expenses}})
        self.assertEqual(self.count("receipts where unreferenced_since is null"), 1)


    # ─── Private beta ───

    def signup(self, client, **extra):
        body = {"email": "cara@example.com", "first_name": "Cara", "lang": "fr", "children": 2,
                "care": "alternating", "other_parent": "yes", "consent": True}
        body.update(extra)
        return client.call("POST", "/api/beta", body)

    def test_beta_signup_is_stored_once_and_announced(self):
        client = Client(self.base)
        self.assertEqual(self.signup(client), (200, {"ok": True}))
        self.assertEqual(self.signup(client, first_name="Cara B"), (200, {"ok": True}))
        self.assertEqual(len(self.notices), 1)
        self.assertEqual(self.notices[0]["email"], "cara@example.com")
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("select first_name, lang, children, approved_at from beta_signups")
            self.assertEqual(cur.fetchall(), [("Cara B", "fr", 2, None)])

    def test_beta_signup_needs_consent_and_a_real_email(self):
        client = Client(self.base)
        self.assertEqual(self.signup(client, consent=False)[0], 400)
        self.assertEqual(self.signup(client, email="nope")[0], 400)
        self.assertEqual(self.signup(client, care="<script>")[0], 400)
        self.assertEqual(self.notices, [])

    def test_beta_signup_rate_limit(self):
        client = Client(self.base)
        for i in range(5):
            self.assertEqual(self.signup(client, email=f"p{i}@example.com")[0], 200)
        self.assertEqual(self.signup(client, email="p9@example.com")[0], 429)

    def test_only_approved_addresses_create_plans_but_anyone_joins(self):
        api.BETA_GATE = True
        anna, _, _ = self.sign_in("anna@example.com")
        ben, _, _ = self.sign_in("ben@example.com")
        status, body = anna.call("POST", "/api/households", {})
        self.assertEqual((status, body["error"]), (403, "new plans are invite-only during the beta"))
        invites = []
        api.send_beta_invite = lambda email, lang, name: invites.append((email, lang))
        self.assertEqual(api.beta_command(["approve", "Anna@example.com", "de"]), 0)
        self.assertEqual(invites, [("anna@example.com", "de")])
        status, created = anna.call("POST", "/api/households", {})
        self.assertEqual(status, 201)
        # Ben was never approved, and still joins with Anna's code.
        self.assertEqual(ben.call("POST", "/api/households/join", {"code": created["code"]})[0], 200)

    def test_deleting_the_account_removes_the_beta_signup(self):
        client = Client(self.base)
        self.signup(client, email="anna@example.com")
        anna, _, _ = self.sign_in("anna@example.com")
        status, export = anna.call("GET", "/api/account/export")
        self.assertEqual((status, export["beta"]["language"]), (200, "fr"))
        self.assertEqual(anna.call("POST", "/api/account/delete", {"confirm": "anna@example.com"})[0], 200)
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("select count(*) from beta_signups")
            self.assertEqual(cur.fetchone()[0], 0)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Browser(Client):
    """A browser on the sign-in pages: form posts, redirects not followed."""

    def form(self, method, path, fields=None, headers=None):
        data = urllib.parse.urlencode(fields).encode() if fields is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/x-www-form-urlencoded")
        if self.cookie:
            request.add_header("Cookie", self.cookie)
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        opener = urllib.request.build_opener(NoRedirect)
        try:
            with opener.open(request) as response:
                status, raw, got = response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            status, raw, got = error.code, error.read(), error.headers
        set_cookie = got.get("Set-Cookie")
        if set_cookie:
            self.cookie = set_cookie.split(";", 1)[0]
        return status, raw.decode(), got


def hidden(html, name):
    match = re.search(r'name="%s" value="([^"]*)"' % re.escape(name), html)
    return match.group(1) if match else None


@unittest.skipUnless(os.environ.get("DATABASE_URL"), "DATABASE_URL is not set")
class AssistantTest(unittest.TestCase):
    """AI assistants: OAuth sign-in with an emailed code, then MCP tools on the shared plan."""

    REDIRECT = "https://claude.ai/api/mcp/auth_callback"

    @classmethod
    def setUpClass(cls):
        cls.codes = {}
        api.send_login_code = lambda email, code: cls.codes.__setitem__(email, code)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        api.LIMITS = api.RateLimiter()
        api.BETA_GATE = False
        api.send_beta_notice = lambda signup: None
        self.codes.clear()
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("truncate households, users, login_tokens, account_deletions, beta_signups, oauth_clients, agent_log cascade")

    def register(self):
        status, client = Client(self.base).call("POST", "/api/oauth/register", {
            "client_name": "Claude", "redirect_uris": [self.REDIRECT], "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
        })
        self.assertEqual(status, 201)
        return client["client_id"]

    def connect(self, email, client_id=None, verifier="v" * 50):
        """Runs the whole sign-in as the parent would, returns the token answer."""
        client_id = client_id or self.register()
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        params = {
            "response_type": "code", "client_id": client_id, "redirect_uri": self.REDIRECT, "state": "xyz",
            "code_challenge": challenge, "code_challenge_method": "S256", "scope": "plan", "resource": api.mcp_url(),
        }
        browser = Browser(self.base)
        status, html, _ = browser.form("GET", "/api/oauth/authorize?" + urllib.parse.urlencode(params))
        self.assertEqual(status, 200)
        self.assertIn('name="email"', html)
        status, html, _ = browser.form("POST", "/api/oauth/email", {**params, "email": email})
        self.assertEqual(status, 200)
        pending = hidden(html, "pending")
        status, _, got = browser.form("POST", "/api/oauth/code", {**params, "pending": pending, "email": email, "code": self.codes[email]})
        self.assertEqual(status, 303)
        status, html, got = browser.form("GET", got["Location"])
        self.assertEqual(status, 200)
        self.assertIn("Claude", html)
        self.assertEqual(got["X-Frame-Options"], "DENY")
        status, _, got = browser.form("POST", "/api/oauth/authorize", {**params, "csrf": hidden(html, "csrf"), "decision": "allow"})
        self.assertEqual(status, 303)
        location = urllib.parse.urlsplit(got["Location"])
        self.assertEqual(f"{location.scheme}://{location.netloc}{location.path}", self.REDIRECT)
        query = dict(urllib.parse.parse_qsl(location.query))
        self.assertEqual(query["state"], "xyz")
        status, tokens, _ = browser.form("POST", "/api/oauth/token", {
            "grant_type": "authorization_code", "code": query["code"], "redirect_uri": self.REDIRECT,
            "client_id": client_id, "code_verifier": verifier,
        })
        self.assertEqual(status, 200)
        return json.loads(tokens) | {"client_id": client_id, "browser": browser, "auth_code": query["code"]}

    def rpc(self, token, method, params=None, msg_id=1):
        status, body = Client(self.base).call("POST", "/api/mcp", {"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params or {}},
                                              headers={"Authorization": f"Bearer {token}", "Accept": "application/json, text/event-stream"})
        self.assertEqual(status, 200, body)
        return body

    def tool(self, token, name, args=None, error=False):
        result = self.rpc(token, "tools/call", {"name": name, "arguments": args or {}})["result"]
        self.assertEqual(result.get("isError", False), error, result["content"][0]["text"])
        return result["content"][0]["text"] if error else result["structuredContent"]

    def plan_state(self):
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("select state from plans")
            return cur.fetchone()[0]

    def test_mcp_needs_a_token_and_points_to_sign_in(self):
        status, _ = Client(self.base).call("POST", "/api/mcp", {"jsonrpc": "2.0", "id": 1, "method": "initialize"})
        self.assertEqual(status, 401)
        request = urllib.request.Request(self.base + "/api/mcp", data=b"{}", method="POST", headers={"Authorization": "Bearer nope"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request)
        self.assertIn("resource_metadata=", caught.exception.headers["WWW-Authenticate"])
        self.assertIn('error="invalid_token"', caught.exception.headers["WWW-Authenticate"])
        status, meta = Client(self.base).call("GET", "/api/oauth/protected-resource")
        self.assertEqual((status, meta["resource"]), (200, api.mcp_url()))
        status, meta = Client(self.base).call("GET", "/.well-known/oauth-authorization-server")
        self.assertEqual((status, meta["code_challenge_methods_supported"]), (200, ["S256"]))

    def test_registration_refuses_unsafe_redirects(self):
        for uri in ["http://evil.example/cb", "javascript:alert(1)", "https://x.example/cb#frag"]:
            status, _ = Client(self.base).call("POST", "/api/oauth/register", {"redirect_uris": [uri]})
            self.assertEqual(status, 400, uri)
        self.assertEqual(Client(self.base).call("POST", "/api/oauth/register", {"redirect_uris": ["http://localhost:6274/cb"]})[0], 201)

    def test_authorize_never_redirects_to_an_unregistered_address(self):
        client_id = self.register()
        status, html, got = Browser(self.base).form("GET", "/api/oauth/authorize?" + urllib.parse.urlencode({
            "response_type": "code", "client_id": client_id, "redirect_uri": "https://evil.example/cb",
            "code_challenge": "c" * 43, "code_challenge_method": "S256"}))
        self.assertEqual(status, 400)
        self.assertIsNone(got.get("Location"))

    def test_wrong_code_verifier_and_reused_code_are_refused(self):
        tokens = self.connect("anna@example.com")
        status, _ = tokens["browser"].form("POST", "/api/oauth/token", {
            "grant_type": "authorization_code", "code": tokens["auth_code"], "redirect_uri": self.REDIRECT,
            "client_id": tokens["client_id"], "code_verifier": "v" * 50})[:2]
        self.assertEqual(status, 400)

    def test_wrong_email_code_is_refused(self):
        client_id = self.register()
        params = {"response_type": "code", "client_id": client_id, "redirect_uri": self.REDIRECT,
                  "code_challenge": "c" * 43, "code_challenge_method": "S256"}
        browser = Browser(self.base)
        _, html, _ = browser.form("POST", "/api/oauth/email", {**params, "email": "anna@example.com"})
        wrong = "000000" if self.codes["anna@example.com"] != "000000" else "111111"
        status, html, _ = browser.form("POST", "/api/oauth/code", {**params, "pending": hidden(html, "pending"), "email": "anna@example.com", "code": wrong})
        self.assertEqual(status, 200)
        self.assertIn("not right", html)
        self.assertIsNone(browser.cookie)

    def test_consent_needs_the_page_token(self):
        tokens = self.connect("anna@example.com")
        params = {"response_type": "code", "client_id": tokens["client_id"], "redirect_uri": self.REDIRECT,
                  "code_challenge": "c" * 43, "code_challenge_method": "S256"}
        status, _, got = tokens["browser"].form("POST", "/api/oauth/authorize", {**params, "csrf": "forged", "decision": "allow"})
        self.assertEqual(status, 400)

    def test_refresh_token_is_replaced_on_use(self):
        tokens = self.connect("anna@example.com")
        browser = tokens["browser"]
        status, raw, _ = browser.form("POST", "/api/oauth/token", {"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": tokens["client_id"]})
        self.assertEqual(status, 200)
        fresh = json.loads(raw)
        self.assertNotEqual(fresh["access_token"], tokens["access_token"])
        status = browser.form("POST", "/api/oauth/token", {"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": tokens["client_id"]})[0]
        self.assertEqual(status, 400)
        self.assertIn("result", self.rpc(fresh["access_token"], "ping"))

    def test_cookie_alone_does_not_open_mcp(self):
        tokens = self.connect("anna@example.com")
        request = urllib.request.Request(self.base + "/api/mcp", method="POST",
                                         data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}).encode(),
                                         headers={"Cookie": tokens["browser"].cookie, "Content-Type": "application/json"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request)
        self.assertEqual(caught.exception.code, 401)

    def test_initialize_and_tool_list(self):
        token = self.connect("anna@example.com")["access_token"]
        init = self.rpc(token, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}})["result"]
        self.assertEqual(init["protocolVersion"], "2025-06-18")
        self.assertIn("tools", init["capabilities"])
        status, _ = Client(self.base).call("POST", "/api/mcp", {"jsonrpc": "2.0", "method": "notifications/initialized"}, headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(status, 202)
        tools = {tool["name"]: tool for tool in self.rpc(token, "tools/list")["result"]["tools"]}
        self.assertIn("save_family_details", tools)
        self.assertTrue(tools["get_started"]["annotations"]["readOnlyHint"])
        self.assertFalse(tools["add_expense"]["annotations"]["readOnlyHint"])
        self.assertTrue(all(not tool["annotations"].get("destructiveHint") for tool in tools.values()))

    def test_onboarding_two_parents_through_their_assistants(self):
        anna = self.connect("anna@example.com")["access_token"]
        start = self.tool(anna, "get_started")
        self.assertIsNone(start["plan"])
        self.assertTrue(start["can_create_plan"])
        created = self.tool(anna, "create_plan")
        self.assertEqual(len(created["code"]), 6)
        self.tool(anna, "save_family_details", {"my_first_name": "Anna"}, error=True)  # a child is needed to finish
        saved = self.tool(anna, "save_family_details", {
            "my_first_name": "Anna", "other_parent_first_name": "Ben",
            "children": [{"name": "Lea", "birth_year": "2019", "care": "school", "place": "École Belair"}],
            "activities": [{"name": "Swimming", "child": "Lea", "day": "wednesday", "time": "14:00", "who": "other"}],
            "custody": {"rhythm": "weeks", "handover_day": "friday", "handover_time": "18:00", "handover_place": "School"},
        })
        self.assertEqual(saved["calendar_days_filled"], 84)
        state = self.plan_state()
        family = json.loads(state["cp-family"])
        self.assertTrue(family["done"])
        self.assertEqual(family["custody"]["handoverDay"], "4")
        self.assertEqual(family["activities"][0]["who"], "B")
        self.assertEqual(family["confirmed"], {"A": True, "B": False})
        self.assertEqual(json.loads(state["cp-profile"]), {"nameA": "Anna", "nameB": "Ben", "child": "Lea"})
        # Saved exactly as the web app's JSON.stringify would write it.
        self.assertEqual(state["cp-family"], json.dumps(family, ensure_ascii=False, separators=(",", ":")))
        self.assertIn("via Claude", json.loads(state["cp-activity"])[0]["text"])
        invite = self.tool(anna, "get_invite", {"language": "fr"})
        self.assertIn(created["code"], invite["message"])

        ben = self.connect("ben@example.com")["access_token"]
        self.assertIn("join_plan", " ".join(self.tool(ben, "get_started")["next_steps"]))
        self.assertIn("No plan", self.tool(ben, "join_plan", {"code": "ZZZZZZ"}, error=True))
        joined = self.tool(ben, "join_plan", {"code": created["code"].lower()})
        self.assertEqual(joined["your_side"], "B")
        start = self.tool(ben, "get_started")
        self.assertFalse(start["family"]["confirmed_by_you"])
        details = self.tool(ben, "get_family_details")
        self.assertEqual(details["children"][0]["name"], "Lea")
        self.assertEqual(details["activities"][0]["who"], "Ben")
        self.tool(ben, "confirm_family_details")
        start = self.tool(ben, "get_started")
        self.assertTrue(start["family"]["confirmed_by_you"])
        self.assertIn("Setup is done", " ".join(start["next_steps"]))
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("select tool from agent_log order by id")
            self.assertEqual([row[0] for row in cur.fetchall()], ["create_plan", "save_family_details", "join_plan", "confirm_family_details"])

    def test_beta_gate_offers_the_waitlist(self):
        api.BETA_GATE = True
        anna = self.connect("anna@example.com")["access_token"]
        start = self.tool(anna, "get_started")
        self.assertFalse(start["can_create_plan"])
        self.assertIn("invite-only", self.tool(anna, "create_plan", error=True))
        self.assertIn("consent", self.tool(anna, "join_waitlist", {}, error=True))
        self.assertEqual(self.tool(anna, "join_waitlist", {"consent": True, "first_name": "Anna", "language": "fr"})["status"], "waiting")
        self.assertEqual(self.tool(anna, "get_started")["beta_waitlist"], "waiting")
        api.send_beta_invite = lambda *args: None
        api.beta_command(["approve", "anna@example.com"])
        self.assertEqual(self.tool(anna, "create_plan")["ok"], True)

    def test_expenses_calendar_and_messages(self):
        anna = self.connect("anna@example.com")["access_token"]
        ben = self.connect("ben@example.com")["access_token"]
        self.assertIn("no shared plan", self.tool(anna, "add_expense", {"description": "x", "amount": 1, "category": "other"}, error=True))
        code = self.tool(anna, "create_plan")["code"]
        self.tool(ben, "join_plan", {"code": code})
        added = self.tool(anna, "add_expense", {"description": "School shoes", "amount": 42, "category": "clothes", "date": "2026-11-20"})
        self.assertIn("owes", added["balance"]["summary"])
        self.assertEqual(added["balance"]["amount_eur"], 21)
        stored = json.loads(self.plan_state()["cp-expenses"])[0]
        self.assertEqual((stored["amount"], stored["paidBy"], stored["split"]), (42, "A", "50"))
        self.tool(ben, "add_expense", {"description": "Doctor", "amount": "30,50", "category": "health", "paid_by": "me", "split": "other"})
        listed = self.tool(ben, "list_expenses", {"only_unsettled": True})
        self.assertEqual(listed["count"], 2)
        # Ben owes 21 for the shoes, Anna owes 30.50 for the doctor: Anna owes 9.50.
        self.assertEqual((listed["balance"]["owes"], listed["balance"]["amount_eur"]), ("Parent A", 9.5))
        self.tool(ben, "mark_expenses_settled", {"expense_ids": [stored["id"]]})
        balance = self.tool(anna, "get_balance")
        self.assertEqual(balance["balance"]["amount_eur"], 30.5)
        self.assertIn("health", [row["category"] for row in balance["this_month"]])
        self.assertIn("No expense", self.tool(anna, "mark_expenses_settled", {"expense_ids": [1]}, error=True))

        self.tool(anna, "set_custody_days", {"days": [{"date": "2027-01-04", "with": "other"}, {"date": "2027-01-05", "with": "me"}]})
        self.tool(ben, "add_calendar_event", {"title": "School play", "date": "2027-01-05", "type": "school"})
        days = self.tool(ben, "get_calendar", {"from_date": "2027-01-04", "days": 2})["days"]
        self.assertTrue(days[0]["children_with"].endswith("(you)"))
        self.assertEqual(days[1]["events"], [{"title": "School play", "type": "school"}])
        with api.db() as conn, conn.cursor() as cur:
            cur.execute("""update plans set state = jsonb_set(state, '{cp-locked}', '"{\\"2027-02\\":true}"')""")
        self.assertIn("locked", self.tool(anna, "set_custody_days", {"days": [{"date": "2027-02-01", "with": "me"}]}, error=True))
        self.assertEqual(json.loads(self.plan_state()["cp-custody"]), {"2027-01-04": "B", "2027-01-05": "A"})

        self.tool(anna, "send_message", {"topic": "school", "message": "Lea needs her gym bag on Monday", "urgent": True})
        messages = self.tool(ben, "list_messages", {"topic": "school"})["messages"]
        self.assertEqual([m["message"] for m in messages], ["Lea needs her gym bag on Monday"])
        self.assertIn("Unknown", self.rpc(ben, "tools/call", {"name": "drop_tables"}).get("error", {}).get("message", "Unknown").title())

    def test_deleting_the_account_disconnects_assistants(self):
        tokens = self.connect("anna@example.com")
        anna = tokens["browser"]
        self.tool(tokens["access_token"], "join_waitlist", {"consent": True})
        export = anna.call("GET", "/api/account/export")[1]
        self.assertEqual([item["name"] for item in export["assistants"]], ["Claude"])
        self.assertEqual([item["tool"] for item in export["assistant_changes"]], ["join_waitlist"])
        anna.call("POST", "/api/account/delete", {"confirm": "anna@example.com"}, headers={})
        status, _ = Client(self.base).call("POST", "/api/mcp", {"jsonrpc": "2.0", "id": 1, "method": "ping"},
                                           headers={"Authorization": f"Bearer {tokens['access_token']}"})
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
