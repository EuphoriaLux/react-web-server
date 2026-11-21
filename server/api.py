#!/usr/bin/env python3
"""CoParents API. Binds to localhost. Nginx proxies /api/ here.

Parents sign in with a one-time link sent by email. The session lives in an
HttpOnly cookie. A signed-in parent creates the plan and invites the other
parent with the 6-character code. The plan is one JSON document.

Plans made before accounts existed still open with their old bearer token
until that parent signs in and claims the plan.
"""
import hashlib
import json
import os
import re
import secrets
import smtplib
import ssl
import threading
import time
from collections import defaultdict, deque
from email.message import EmailMessage
from http.cookies import SimpleCookie
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras

HOST = os.environ.get("COPARENTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("COPARENTS_PORT", "8787"))
DSN = os.environ.get("DATABASE_URL", "")
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
LU = ZoneInfo("Europe/Luxembourg")

APP_URL = os.environ.get("COPARENTS_APP_URL", "http://localhost:5173").rstrip("/")
MAIL_FROM = os.environ.get("COPARENTS_MAIL_FROM", "")
SMTP_HOST = os.environ.get("COPARENTS_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("COPARENTS_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("COPARENTS_SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("COPARENTS_SMTP_PASSWORD", "")
COOKIE = "cp_session"
LOGIN_TTL = timedelta(minutes=15)
SESSION_TTL = timedelta(days=60)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RateLimiter:
    """Sliding window, in memory. The API is one process, so this is enough."""

    def __init__(self):
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window: float) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - window:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            if len(self._hits) > 50_000:
                for stale in [k for k, v in self._hits.items() if not v or v[-1] <= now - 3600]:
                    del self._hits[stale]
            return True


LIMITS = RateLimiter()


def send_login_email(email: str, link: str):
    if not SMTP_HOST or not MAIL_FROM:
        # No mail server configured: development only. The link goes to the log.
        print(f"[dev] sign-in link for {email}: {link}", flush=True)
        return
    message = EmailMessage()
    message["From"] = MAIL_FROM
    message["To"] = email
    message["Subject"] = "Your CoParents sign-in link"
    message.set_content(
        "Open this link to sign in to CoParents:\n\n"
        f"{link}\n\n"
        "The link works once and expires in 15 minutes.\n"
        "If you did not ask for it, you can ignore this email.\n"
    )
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(message)


@contextmanager
def db():
    dsn = DSN or os.environ.get("DATABASE_URL", "")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    conn = psycopg2.connect(dsn)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_code(cur) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        cur.execute("select 1 from households where code = %s", (code,))
        if cur.fetchone() is None:
            return code
    raise RuntimeError("could not allocate a household code")


def deliver_at(urgent: bool, now: datetime | None = None):
    now = now.astimezone(LU) if now else datetime.now(LU)
    if urgent or (7 <= now.hour < 21):
        return now.astimezone(timezone.utc)
    if now.hour >= 21:
        morning = (now + timedelta(days=1)).replace(hour=7, minute=0, second=0, microsecond=0)
    else:
        morning = now.replace(hour=7, minute=0, second=0, microsecond=0)
    return morning.astimezone(timezone.utc)


def member_from_token(cur, token: str):
    """Plans made before accounts: the bearer token is the member."""
    cur.execute(
        """
        select m.role, m.household_id, h.code
        from members m
        join households h on h.id = m.household_id
        where m.token_hash = %s
        """,
        (token_hash(token),),
    )
    return cur.fetchone()


def member_from_user(cur, user_id):
    cur.execute(
        """
        select m.role, m.household_id, h.code
        from members m
        join households h on h.id = m.household_id
        where m.user_id = %s
        """,
        (user_id,),
    )
    return cur.fetchone()


def user_from_session(cur, token: str):
    cur.execute(
        """
        select u.id, u.email
        from sessions s
        join users u on u.id = s.user_id
        where s.token_hash = %s and s.expires_at > now()
        """,
        (token_hash(token),),
    )
    return cur.fetchone()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}")

    def _send(self, status, payload, cookie=None):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _cookie(self, value: str, max_age: int) -> str:
        secure = "; Secure" if APP_URL.startswith("https://") else ""
        return f"{COOKIE}={value}; Path=/api; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}"

    def _session_token(self):
        raw = self.headers.get("Cookie", "")
        if not raw:
            return None
        try:
            jar = SimpleCookie(raw)
        except Exception:
            return None
        morsel = jar.get(COOKIE)
        return morsel.value if morsel and morsel.value else None

    def _client_ip(self) -> str:
        # Nginx appends the real client address as the last entry.
        forwarded = self.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[-1].strip()
        return self.client_address[0]

    def _same_origin(self) -> bool:
        """Browsers send Origin on cross-site writes. Refuse those."""
        origin = self.headers.get("Origin")
        if not origin:
            return True
        host = self.headers.get("Host", "")
        return origin.split("://", 1)[-1] == host or origin == APP_URL

    def _user(self, cur):
        token = self._session_token()
        return user_from_session(cur, token) if token else None

    def _member(self, cur):
        """The signed-in parent's place in a plan, or the old bearer token's."""
        user = self._user(cur)
        if user is not None:
            member = member_from_user(cur, user[0])
            if member is not None:
                return member
        token = self._bearer()
        return member_from_token(cur, token) if token else None

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > 1_000_000:
            raise ValueError("body too large")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode() or "{}")

    def _bearer(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        return header[7:].strip() or None

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            try:
                with db() as conn, conn.cursor() as cur:
                    cur.execute("select 1")
                self._send(200, {"ok": True})
            except Exception as exc:
                self._send(500, {"ok": False, "error": str(exc)})
            return
        if path == "/api/me":
            self._me()
            return
        if path == "/api/state":
            self._get_state()
            return
        if path == "/api/notes":
            self._get_notes()
            return
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if not self._same_origin():
            self._send(403, {"error": "cross-site request refused"})
            return
        if path == "/api/auth/request":
            self._auth_request()
            return
        if path == "/api/auth/verify":
            self._auth_verify()
            return
        if path == "/api/auth/logout":
            self._auth_logout()
            return
        if path == "/api/households/claim":
            self._claim()
            return
        if path == "/api/households":
            self._create()
            return
        if path == "/api/households/join":
            self._join()
            return
        if path == "/api/notes":
            self._post_note()
            return
        self._send(404, {"error": "not found"})

    def do_PUT(self):
        if not self._same_origin():
            self._send(403, {"error": "cross-site request refused"})
            return
        if self.path.split("?", 1)[0] == "/api/state":
            self._put_state()
            return
        self._send(404, {"error": "not found"})

    def _auth_request(self):
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        email = str(body.get("email", "")).strip().lower()
        if len(email) > 254 or not EMAIL_RE.match(email):
            self._send(400, {"error": "enter a valid email address"})
            return
        if not LIMITS.allow(f"mail:{email}", 3, 900) or not LIMITS.allow(f"mail-ip:{self._client_ip()}", 10, 3600):
            self._send(429, {"error": "too many sign-in emails. Try again in a few minutes."})
            return
        token = secrets.token_urlsafe(32)
        with db() as conn, conn.cursor() as cur:
            cur.execute("delete from login_tokens where expires_at < now() - interval '1 day'")
            cur.execute("delete from sessions where expires_at < now()")
            cur.execute(
                "insert into login_tokens (token_hash, email, expires_at) values (%s, %s, %s)",
                (token_hash(token), email, datetime.now(timezone.utc) + LOGIN_TTL),
            )
        try:
            send_login_email(email, f"{APP_URL}/?login={token}")
        except Exception as exc:
            print(f"sign-in email failed: {exc!r}", flush=True)
            self._send(502, {"error": "could not send the email. Try again shortly."})
            return
        # Same answer for every address, so this never reveals who has an account.
        self._send(200, {"ok": True})

    def _auth_verify(self):
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        token = str(body.get("token", "")).strip()
        if not token or not LIMITS.allow(f"verify-ip:{self._client_ip()}", 20, 600):
            self._send(400 if not token else 429, {"error": "this sign-in link is not valid"})
            return
        session = secrets.token_urlsafe(32)
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                """
                update login_tokens set used_at = now()
                where token_hash = %s and used_at is null and expires_at > now()
                returning email
                """,
                (token_hash(token),),
            )
            row = cur.fetchone()
            if row is None:
                self._send(400, {"error": "this sign-in link has expired or was already used"})
                return
            email = row[0]
            cur.execute(
                """
                insert into users (email) values (%s)
                on conflict (email) do update set email = excluded.email
                returning id
                """,
                (email,),
            )
            user_id = cur.fetchone()[0]
            cur.execute(
                "insert into sessions (token_hash, user_id, expires_at) values (%s, %s, %s)",
                (token_hash(session), user_id, datetime.now(timezone.utc) + SESSION_TTL),
            )
            member = member_from_user(cur, user_id)
        self._send(200, self._me_payload(email, member), cookie=self._cookie(session, int(SESSION_TTL.total_seconds())))

    def _auth_logout(self):
        token = self._session_token()
        if token:
            with db() as conn, conn.cursor() as cur:
                cur.execute("delete from sessions where token_hash = %s", (token_hash(token),))
        self._send(200, {"ok": True}, cookie=self._cookie("", 0))

    def _me_payload(self, email, member):
        household = None
        if member is not None:
            household = {"role": member[0], "code": member[2]}
        return {"email": email, "household": household}

    def _me(self):
        with db() as conn, conn.cursor() as cur:
            user = self._user(cur)
            if user is None:
                self._send(401, {"error": "not signed in"})
                return
            member = member_from_user(cur, user[0])
        self._send(200, self._me_payload(user[1], member))

    def _create(self):
        with db() as conn, conn.cursor() as cur:
            user = self._user(cur)
            if user is None:
                self._send(401, {"error": "sign in first"})
                return
            if member_from_user(cur, user[0]) is not None:
                self._send(409, {"error": "you already have a shared plan"})
                return
            code = new_code(cur)
            cur.execute(
                "insert into households (code) values (%s) returning id",
                (code,),
            )
            household_id = cur.fetchone()[0]
            cur.execute(
                "insert into members (household_id, role, user_id) values (%s, 'A', %s)",
                (household_id, user[0]),
            )
            cur.execute(
                "insert into plans (household_id, state) values (%s, %s)",
                (household_id, psycopg2.extras.Json({})),
            )
        self._send(201, {"code": code, "role": "A"})

    def _join(self):
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        code = str(body.get("code", "")).strip().upper()
        if len(code) != 6:
            self._send(400, {"error": "code must be 6 characters"})
            return
        try:
            with db() as conn, conn.cursor() as cur:
                user = self._user(cur)
                if user is None:
                    self._send(401, {"error": "sign in first"})
                    return
                # Codes are short, so guessing is capped per account and per address.
                if not LIMITS.allow(f"join:{user[0]}", 8, 3600) or not LIMITS.allow(f"join-ip:{self._client_ip()}", 30, 3600):
                    self._send(429, {"error": "too many attempts. Try again later."})
                    return
                if member_from_user(cur, user[0]) is not None:
                    self._send(409, {"error": "you already have a shared plan"})
                    return
                cur.execute("select id from households where code = %s", (code,))
                row = cur.fetchone()
                if row is None:
                    self._send(404, {"error": "no plan with that code"})
                    return
                household_id = row[0]
                cur.execute(
                    "select role from members where household_id = %s",
                    (household_id,),
                )
                roles = {item[0] for item in cur.fetchall()}
                if "B" in roles:
                    self._send(409, {"error": "this plan already has two parents"})
                    return
                cur.execute(
                    "insert into members (household_id, role, user_id) values (%s, 'B', %s)",
                    (household_id, user[0]),
                )
        except psycopg2.errors.UniqueViolation:
            self._send(409, {"error": "this plan already has two parents"})
            return
        self._send(200, {"code": code, "role": "B"})

    def _claim(self):
        """Attach a plan made before accounts to the signed-in parent."""
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        legacy = str(body.get("token", "")).strip()
        if not legacy:
            self._send(400, {"error": "missing token"})
            return
        try:
            with db() as conn, conn.cursor() as cur:
                user = self._user(cur)
                if user is None:
                    self._send(401, {"error": "sign in first"})
                    return
                if member_from_user(cur, user[0]) is not None:
                    self._send(409, {"error": "you already have a shared plan"})
                    return
                cur.execute(
                    """
                    update members set user_id = %s, token_hash = null
                    where token_hash = %s and user_id is null
                    returning household_id
                    """,
                    (user[0], token_hash(legacy)),
                )
                if cur.fetchone() is None:
                    self._send(404, {"error": "no plan for this device"})
                    return
                member = member_from_user(cur, user[0])
        except psycopg2.errors.UniqueViolation:
            self._send(409, {"error": "you already have a shared plan"})
            return
        self._send(200, {"code": member[2], "role": member[0]})

    def _get_state(self):
        with db() as conn, conn.cursor() as cur:
            member = self._member(cur)
            if member is None:
                self._send(401, {"error": "not signed in"})
                return
            role, household_id, code = member
            cur.execute(
                "select state, updated_at from plans where household_id = %s",
                (household_id,),
            )
            state, updated_at = cur.fetchone()
        self._send(200, {
            "code": code,
            "role": role,
            "state": state,
            "updated_at": updated_at.astimezone(timezone.utc).isoformat(),
        })

    def _put_state(self):
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        state = body.get("state")
        if not isinstance(state, dict):
            self._send(400, {"error": "state must be an object"})
            return
        with db() as conn, conn.cursor() as cur:
            member = self._member(cur)
            if member is None:
                self._send(401, {"error": "not signed in"})
                return
            _, household_id, code = member
            now = datetime.now(timezone.utc)
            cur.execute(
                "update plans set state = %s, updated_at = %s where household_id = %s",
                (psycopg2.extras.Json(state), now, household_id),
            )
        self._send(200, {"code": code, "updated_at": now.isoformat()})

    def _get_notes(self):
        channel = ""
        if "?" in self.path:
            for part in self.path.split("?", 1)[1].split("&"):
                if part.startswith("channel="):
                    channel = unquote(part.split("=", 1)[1])
        with db() as conn, conn.cursor() as cur:
            member = self._member(cur)
            if member is None:
                self._send(401, {"error": "not signed in"})
                return
            role, household_id, _ = member
            cur.execute(
                """
                select id, author, channel, fact, ask, by_when, urgent, sent_at, deliver_at
                from notes
                where household_id = %s
                  and (%s = '' or channel = %s)
                  and (deliver_at <= now() or author = %s)
                order by sent_at
                """,
                (household_id, channel, channel, role),
            )
            rows = cur.fetchall()
        self._send(200, {"notes": [self._note(row) for row in rows]})

    def _post_note(self):
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        fact = str(body.get("fact", "")).strip()
        ask = str(body.get("ask", "")).strip()
        by_when = str(body.get("by_when", "")).strip()
        channel = str(body.get("channel", "handover")).strip()[:80]
        urgent = bool(body.get("urgent"))
        if not fact or not channel:
            self._send(400, {"error": "a note needs a fact"})
            return
        when = deliver_at(urgent)
        with db() as conn, conn.cursor() as cur:
            member = self._member(cur)
            if member is None:
                self._send(401, {"error": "not signed in"})
                return
            role, household_id, _ = member
            cur.execute(
                """
                insert into notes (household_id, author, channel, fact, ask, by_when, urgent, deliver_at)
                values (%s, %s, %s, %s, %s, %s, %s, %s)
                returning id, author, channel, fact, ask, by_when, urgent, sent_at, deliver_at
                """,
                (household_id, role, channel, fact, ask, by_when, urgent, when),
            )
            row = cur.fetchone()
        self._send(201, self._note(row))

    def _note(self, row):
        note_id, author, channel, fact, ask, by_when, urgent, sent_at, ready = row
        return {
            "id": str(note_id),
            "author": author,
            "channel": channel,
            "fact": fact,
            "ask": ask,
            "by_when": by_when,
            "urgent": urgent,
            "sent_at": sent_at.astimezone(timezone.utc).isoformat(),
            "deliver_at": ready.astimezone(timezone.utc).isoformat(),
            "waiting": ready > datetime.now(timezone.utc),
        }


def main():
    if not (DSN or os.environ.get("DATABASE_URL")):
        raise RuntimeError("DATABASE_URL is not set")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"coparents api on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
