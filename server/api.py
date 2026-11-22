#!/usr/bin/env python3
"""CoParents API. Binds to localhost. Nginx proxies /api/ here.

Parents sign in with a one-time link sent by email. The session lives in an
HttpOnly cookie. A signed-in parent creates the plan and invites the other
parent with the 6-character code. The plan is one JSON document.

Plans made before accounts existed still open with their old bearer token
until that parent signs in and claims the plan.
"""
import base64
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
# Private beta. New plans need an approved address unless the gate is off ("0").
BETA_GATE = os.environ.get("COPARENTS_BETA_GATE", "1") != "0"
# Where a new waitlist sign-up is announced. Empty: only the log says so.
BETA_NOTIFY = os.environ.get("COPARENTS_BETA_NOTIFY", "").strip()
BETA_LANGS = {"en", "fr", "de", "lb"}
BETA_CARE = {"", "alternating", "mostly-me", "mostly-other", "other"}
BETA_OTHER = {"", "yes", "no", "unsure"}
COOKIE = "cp_session"
LOGIN_TTL = timedelta(minutes=15)
SESSION_TTL = timedelta(days=60)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Receipt photos. The phone shrinks them to a few hundred KB; nginx refuses bodies over 1 MB.
RECEIPT_MAX_BYTES = 900_000
RECEIPT_PLAN_BYTES = 100_000_000
# A photo no expense points at any more is kept this long, then deleted.
RECEIPT_GRACE = timedelta(days=7)
RECEIPT_PATH = re.compile(r"^/api/receipts/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")


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


def send_mail(to: str, subject: str, text: str, reply_to: str = ""):
    if not SMTP_HOST or not MAIL_FROM:
        print(f"[dev] email to {to}: {subject}\n{text}", flush=True)
        return
    message = EmailMessage()
    message["From"] = MAIL_FROM
    message["To"] = to
    if reply_to:
        message["Reply-To"] = reply_to
    message["Subject"] = subject
    message.set_content(text)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(message)


def send_beta_notice(signup: dict):
    """Tells the person running the beta that someone joined the waitlist."""
    lines = [f"{key}: {value}" for key, value in signup.items()]
    text = (
        "Someone joined the CoParents beta waitlist.\n\n"
        + "\n".join(lines)
        + "\n\nTo let them create a plan, run in Cloud Shell:\n"
        + f"  bash scripts/beta.sh approve {signup['email']}\n"
    )
    if not BETA_NOTIFY:
        print(f"beta sign-up: {signup['email']}", flush=True)
        return
    send_mail(BETA_NOTIFY, "New CoParents beta sign-up", text)


BETA_INVITE = {
    "en": (
        "You're in: the CoParents beta",
        "Hello{name},\n\n"
        "You can now use CoParents. Open {url} and sign in with this email address ({email}).\n"
        "Then tap \"Create shared plan\" and send the code it shows to the other parent, "
        "so they can join with their own email.\n\n"
        "This is an early version. If something is unclear or broken, reply to this email.\n\n"
        "Thank you for trying it.\n",
    ),
    "fr": (
        "Bienvenue dans la bêta de CoParents",
        "Bonjour{name},\n\n"
        "Vous pouvez maintenant utiliser CoParents. Ouvrez {url} et connectez-vous avec cette adresse e-mail ({email}).\n"
        "Touchez ensuite « Créer le planning partagé » et envoyez le code affiché à l’autre parent, "
        "pour qu’il ou elle le rejoigne avec sa propre adresse e-mail.\n\n"
        "C’est une première version. Si quelque chose n’est pas clair ou ne marche pas, répondez à cet e-mail.\n\n"
        "Merci de l’essayer.\n",
    ),
    "de": (
        "Willkommen in der CoParents-Beta",
        "Hallo{name},\n\n"
        "Ihr könnt CoParents jetzt nutzen. Öffnet {url} und meldet euch mit dieser E-Mail-Adresse an ({email}).\n"
        "Tippt dann auf „Gemeinsamen Plan erstellen“ und schickt den angezeigten Code an den anderen Elternteil, "
        "damit er oder sie mit der eigenen E-Mail-Adresse beitreten kann.\n\n"
        "Das ist eine frühe Version. Wenn etwas unklar ist oder nicht funktioniert, antwortet einfach auf diese E-Mail.\n\n"
        "Danke fürs Ausprobieren.\n",
    ),
    "lb": (
        "Wëllkomm an der CoParents-Beta",
        "Moien{name},\n\n"
        "Dir kënnt CoParents elo benotzen. Maacht {url} op a mellt iech mat dëser E-Mail-Adress un ({email}).\n"
        "Tippt dann op „Gemeinsame Plang erstellen“ a schéckt de Code, deen ugewise gëtt, dem aneren Elterendeel, "
        "fir datt hien oder si mat der eegener E-Mail-Adress bäitriede kann.\n\n"
        "Dëst ass eng fréi Versioun. Wann eppes net kloer ass oder net geet, äntwert einfach op dës E-Mail.\n\n"
        "Merci fir d’Ausprobéieren.\n",
    ),
}


def send_beta_invite(email: str, lang: str, first_name: str):
    subject, body = BETA_INVITE.get(lang, BETA_INVITE["en"])
    name = f" {first_name}" if first_name else ""
    send_mail(email, subject, body.format(name=name, url=APP_URL, email=email), reply_to=BETA_NOTIFY)


def beta_approved(cur, email: str) -> bool:
    cur.execute("select 1 from beta_signups where email = %s and approved_at is not null", (email,))
    return cur.fetchone() is not None


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


def _unpack(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value


def image_type(data: bytes):
    """The real type from the first bytes, whatever the client says."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) > 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def receipt_refs(state):
    """Photo ids the saved plan's expenses point at, or None if the expenses can't be read."""
    raw = state.get("cp-expenses")
    if raw is None:
        return []
    try:
        items = json.loads(raw) if isinstance(raw, str) else raw
    except ValueError:
        return None
    if not isinstance(items, list):
        return None
    refs = []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("receipts"), list):
            refs.extend(r for r in item["receipts"] if isinstance(r, str))
    return refs


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
        if path == "/api/account/export":
            self._export()
            return
        match = RECEIPT_PATH.match(path)
        if match:
            self._get_receipt(match.group(1))
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
        if path == "/api/beta":
            self._beta_signup()
            return
        if path == "/api/households/join":
            self._join()
            return
        if path == "/api/notes":
            self._post_note()
            return
        if path == "/api/account/delete":
            self._delete_account()
            return
        if path == "/api/receipts":
            self._post_receipt()
            return
        self._send(404, {"error": "not found"})

    def do_DELETE(self):
        if not self._same_origin():
            self._send(403, {"error": "cross-site request refused"})
            return
        match = RECEIPT_PATH.match(self.path.split("?", 1)[0])
        if match:
            self._delete_receipt(match.group(1))
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
        # A phone that holds a plan from before accounts sends its device token along.
        # The claim rides on the link, so it works even when the link opens on another
        # site address, where the browser cannot see the old token.
        legacy = str(body.get("legacy", "")).strip()
        token = secrets.token_urlsafe(32)
        with db() as conn, conn.cursor() as cur:
            cur.execute("delete from login_tokens where expires_at < now() - interval '1 day'")
            cur.execute("delete from sessions where expires_at < now()")
            claim = None
            if legacy:
                cur.execute(
                    "select 1 from members where token_hash = %s and user_id is null",
                    (token_hash(legacy),),
                )
                if cur.fetchone() is not None:
                    claim = token_hash(legacy)
            cur.execute(
                "insert into login_tokens (token_hash, email, expires_at, claim_token_hash) values (%s, %s, %s, %s)",
                (token_hash(token), email, datetime.now(timezone.utc) + LOGIN_TTL, claim),
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
                returning email, claim_token_hash
                """,
                (token_hash(token),),
            )
            row = cur.fetchone()
            if row is None:
                self._send(400, {"error": "this sign-in link has expired or was already used"})
                return
            email, claim = row
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
            if member is None and claim:
                cur.execute(
                    "update members set user_id = %s, token_hash = null where token_hash = %s and user_id is null",
                    (user_id, claim),
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

    def _beta_signup(self):
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        email = str(body.get("email", "")).strip().lower()
        if len(email) > 254 or not EMAIL_RE.match(email):
            self._send(400, {"error": "enter a valid email address"})
            return
        if body.get("consent") is not True:
            self._send(400, {"error": "please agree to be contacted about the beta"})
            return
        first_name = " ".join(str(body.get("first_name", "")).split())[:60]
        lang = str(body.get("lang", "en"))
        lang = lang if lang in BETA_LANGS else "en"
        care = str(body.get("care", ""))
        other = str(body.get("other_parent", ""))
        try:
            children = int(body.get("children")) if body.get("children") not in (None, "") else None
        except (TypeError, ValueError):
            children = None
        if children is not None and not 0 <= children <= 12:
            children = None
        if care not in BETA_CARE or other not in BETA_OTHER:
            self._send(400, {"error": "bad request"})
            return
        if not LIMITS.allow(f"beta-ip:{self._client_ip()}", 5, 3600) or not LIMITS.allow(f"beta:{email}", 3, 86400):
            self._send(429, {"error": "too many attempts. Try again later."})
            return
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into beta_signups (email, first_name, lang, children, care, other_parent, consent_at)
                values (%s, %s, %s, %s, %s, %s, now())
                on conflict (email) do update set
                  first_name = excluded.first_name, lang = excluded.lang, children = excluded.children,
                  care = excluded.care, other_parent = excluded.other_parent, consent_at = now()
                returning (xmax = 0)
                """,
                (email, first_name, lang, children, care, other),
            )
            fresh = cur.fetchone()[0]
        if fresh:
            try:
                send_beta_notice({
                    "email": email, "first_name": first_name, "language": lang,
                    "children": "" if children is None else children, "care": care, "other_parent": other,
                })
            except Exception as exc:
                print(f"beta notice failed: {exc!r}", flush=True)
        # Same answer whether or not the address was already on the list.
        self._send(200, {"ok": True})

    def _create(self):
        with db() as conn, conn.cursor() as cur:
            user = self._user(cur)
            if user is None:
                self._send(401, {"error": "sign in first"})
                return
            if member_from_user(cur, user[0]) is not None:
                self._send(409, {"error": "you already have a shared plan"})
                return
            # During the beta only invited addresses start a plan. Joining with
            # the other parent's code stays open to everyone.
            if BETA_GATE and not beta_approved(cur, user[1]):
                self._send(403, {"error": "new plans are invite-only during the beta"})
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
                if len(roles) >= 2:
                    self._send(409, {"error": "this plan already has two parents"})
                    return
                # Usually B. When parent A deleted their account, the new parent takes A's seat.
                role = "A" if "B" in roles else "B"
                cur.execute(
                    "insert into members (household_id, role, user_id) values (%s, %s, %s)",
                    (household_id, role, user[0]),
                )
        except psycopg2.errors.UniqueViolation:
            self._send(409, {"error": "this plan already has two parents"})
            return
        self._send(200, {"code": code, "role": role})

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
            self._tidy_receipts(cur, household_id, state, now)
        self._send(200, {"code": code, "updated_at": now.isoformat()})

    @staticmethod
    def _tidy_receipts(cur, household_id, state, now):
        """Photos the plan no longer points at are deleted a week after that is first seen.

        Covers a removal made offline or a delete that failed, and an upload whose
        expense never made it into the plan. A plan we cannot read deletes nothing.
        """
        refs = receipt_refs(state)
        if refs is None:
            return
        cur.execute(
            "update receipts set unreferenced_since = null where household_id = %s and id::text = any(%s)",
            (household_id, refs),
        )
        cur.execute(
            """
            update receipts set unreferenced_since = %s
            where household_id = %s and unreferenced_since is null and not (id::text = any(%s))
            """,
            (now, household_id, refs),
        )
        cur.execute(
            "delete from receipts where household_id = %s and unreferenced_since < %s",
            (household_id, now - RECEIPT_GRACE),
        )

    def _export(self):
        """Everything stored for the signed-in parent, as one JSON file."""
        with db() as conn, conn.cursor() as cur:
            user = self._user(cur)
            if user is None:
                self._send(401, {"error": "not signed in"})
                return
            cur.execute("select created_at from users where id = %s", (user[0],))
            created_at = cur.fetchone()[0]
            payload = {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "account": {"email": user[1], "created_at": created_at.astimezone(timezone.utc).isoformat()},
                "plan": None,
                "beta": None,
            }
            cur.execute(
                "select first_name, lang, children, care, other_parent, consent_at, created_at, approved_at from beta_signups where email = %s",
                (user[1],),
            )
            beta = cur.fetchone()
            if beta is not None:
                stamp = lambda value: value.astimezone(timezone.utc).isoformat() if value else None  # noqa: E731
                payload["beta"] = {
                    "first_name": beta[0], "language": beta[1], "children": beta[2], "care": beta[3],
                    "other_parent": beta[4], "consent_at": stamp(beta[5]), "signed_up_at": stamp(beta[6]),
                    "approved_at": stamp(beta[7]),
                }
            member = member_from_user(cur, user[0])
            if member is not None:
                role, household_id, code = member
                cur.execute("select state, updated_at from plans where household_id = %s", (household_id,))
                state, updated_at = cur.fetchone()
                cur.execute(
                    """
                    select id, author, channel, fact, ask, by_when, urgent, sent_at, deliver_at
                    from notes
                    where household_id = %s and (deliver_at <= now() or author = %s)
                    order by sent_at
                    """,
                    (household_id, role),
                )
                notes = [self._note(row) for row in cur.fetchall()]
                cur.execute(
                    "select id, uploaded_by, content_type, created_at, data from receipts where household_id = %s order by created_at",
                    (household_id,),
                )
                receipts = [
                    {
                        "id": str(rid),
                        "uploaded_by": by,
                        "created_at": at.astimezone(timezone.utc).isoformat(),
                        "photo": f"data:{ctype};base64,{base64.b64encode(bytes(data)).decode()}",
                    }
                    for rid, by, ctype, at, data in cur.fetchall()
                ]
                payload["plan"] = {
                    "code": code,
                    "your_role": role,
                    "updated_at": updated_at.astimezone(timezone.utc).isoformat(),
                    # The app stores each part as a JSON string. Unpack them so the file is readable.
                    "content": {key: _unpack(value) for key, value in (state or {}).items()},
                    "notes": notes,
                    "receipt_photos": receipts,
                }
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="coparents-my-data.json"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _delete_account(self):
        """Delete the signed-in parent's account.

        The shared plan also holds the other parent's records, so it stays with them
        when they are still in it, and gets a new invite code. A plan with no other
        parent is deleted with everything in it. See docs/privacy.md.
        """
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "bad request"})
            return
        confirm = str(body.get("confirm", "")).strip().lower()
        with db() as conn, conn.cursor() as cur:
            user = self._user(cur)
            if user is None:
                self._send(401, {"error": "not signed in"})
                return
            user_id, email = user
            if confirm != email:
                self._send(400, {"error": "type your email address to confirm"})
                return
            plan = None
            household_id = None
            household_deleted = False
            member = member_from_user(cur, user_id)
            if member is not None:
                household_id = member[1]
                # Lock the plan so two parents deleting at once cannot leave it with nobody.
                cur.execute("select id from households where id = %s for update", (household_id,))
                cur.execute(
                    "select count(*) from members where household_id = %s and user_id is distinct from %s",
                    (household_id, user_id),
                )
                if cur.fetchone()[0] == 0:
                    cur.execute("delete from households where id = %s", (household_id,))
                    household_deleted = True
                    plan = "deleted"
                else:
                    cur.execute("delete from members where user_id = %s", (user_id,))
                    # The old code is known to the parent who left. A new one keeps them out.
                    cur.execute("update households set code = %s where id = %s", (new_code(cur), household_id))
                    plan = "kept"
            cur.execute("delete from login_tokens where email = %s", (email,))
            cur.execute("delete from beta_signups where email = %s", (email,))
            cur.execute("delete from users where id = %s", (user_id,))
            # Ids only, no email: lets a restored backup be cleaned again. Kept 30 days.
            cur.execute(
                "insert into account_deletions (user_id, household_id, household_deleted) values (%s, %s, %s)",
                (user_id, household_id, household_deleted),
            )
            cur.execute("delete from account_deletions where deleted_at < now() - interval '30 days'")
        # Ids only. The journal outlives a lost database, for re-deleting after a restore.
        print(f"account deleted: user {user_id} household {household_id} plan {plan or 'none'}", flush=True)
        self._send(200, {"ok": True, "plan": plan}, cookie=self._cookie("", 0))

    # Receipt photos belong to the plan: both parents of it can see and remove them.

    def _post_receipt(self):
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._send(400, {"error": "no photo"})
            return
        if length > RECEIPT_MAX_BYTES:
            self._send(413, {"error": "this photo is too large"})
            return
        data = self.rfile.read(length)
        kind = image_type(data)
        if kind is None:
            self._send(400, {"error": "this file is not a photo"})
            return
        with db() as conn, conn.cursor() as cur:
            member = self._member(cur)
            if member is None:
                self._send(401, {"error": "not signed in"})
                return
            role, household_id, _ = member
            # Lock the plan so two uploads at once cannot both pass the cap.
            cur.execute("select id from households where id = %s for update", (household_id,))
            cur.execute("select coalesce(sum(size), 0) from receipts where household_id = %s", (household_id,))
            if cur.fetchone()[0] + len(data) > RECEIPT_PLAN_BYTES:
                self._send(413, {"error": "your plan has no room for more photos. Remove old ones first."})
                return
            cur.execute(
                """
                insert into receipts (household_id, uploaded_by, content_type, size, data)
                values (%s, %s, %s, %s, %s) returning id
                """,
                (household_id, role, kind, len(data), psycopg2.Binary(data)),
            )
            receipt_id = cur.fetchone()[0]
        self._send(201, {"id": str(receipt_id)})

    def _get_receipt(self, receipt_id):
        with db() as conn, conn.cursor() as cur:
            member = self._member(cur)
            if member is None:
                self._send(401, {"error": "not signed in"})
                return
            cur.execute(
                "select content_type, data from receipts where id = %s and household_id = %s",
                (receipt_id, member[1]),
            )
            row = cur.fetchone()
        if row is None:
            self._send(404, {"error": "not found"})
            return
        content_type, data = row[0], bytes(row[1])
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        # Personal data: keep it out of shared caches, and never run it as a page.
        self.send_header("Cache-Control", "private, max-age=3600")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'")
        self.end_headers()
        self.wfile.write(data)

    def _delete_receipt(self, receipt_id):
        with db() as conn, conn.cursor() as cur:
            member = self._member(cur)
            if member is None:
                self._send(401, {"error": "not signed in"})
                return
            cur.execute("delete from receipts where id = %s and household_id = %s", (receipt_id, member[1]))
            gone = cur.rowcount
        self._send(200 if gone else 404, {"ok": bool(gone)})

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


def load_env_files(paths):
    """Reads systemd-style KEY=VALUE files, as the service gets them."""
    for path in paths:
        try:
            with open(path, encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())
        except OSError:
            # Missing or not readable: the settings come from the environment instead.
            continue
    global DSN, APP_URL, MAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, BETA_NOTIFY
    DSN = os.environ.get("DATABASE_URL", "")
    APP_URL = os.environ.get("COPARENTS_APP_URL", APP_URL).rstrip("/")
    MAIL_FROM = os.environ.get("COPARENTS_MAIL_FROM", "")
    SMTP_HOST = os.environ.get("COPARENTS_SMTP_HOST", "")
    SMTP_PORT = int(os.environ.get("COPARENTS_SMTP_PORT", "587"))
    SMTP_USER = os.environ.get("COPARENTS_SMTP_USER", "")
    SMTP_PASSWORD = os.environ.get("COPARENTS_SMTP_PASSWORD", "")
    BETA_NOTIFY = os.environ.get("COPARENTS_BETA_NOTIFY", "").strip()


def beta_command(args):
    """python3 api.py beta list | approve EMAIL [LANG] | remove EMAIL"""
    if not args or args[0] not in {"list", "approve", "remove"}:
        print("usage: api.py beta list | beta approve EMAIL [en|fr|de|lb] | beta remove EMAIL")
        return 2
    if args[0] == "list":
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select email, first_name, lang, children, care, other_parent, created_at, approved_at
                from beta_signups order by approved_at nulls first, created_at
                """
            )
            rows = cur.fetchall()
        if not rows:
            print("Nobody on the beta list yet.")
        for email, name, lang, children, care, other, created, approved in rows:
            state = f"approved {approved:%Y-%m-%d}" if approved else "waiting"
            print(f"{created:%Y-%m-%d}  {state:<20} {email}  {name or '-'}  {lang}  children={children if children is not None else '?'}  care={care or '?'}  other parent={other or '?'}")
        return 0
    if len(args) < 2 or not EMAIL_RE.match(args[1].strip().lower()):
        print("Give an email address.")
        return 2
    email = args[1].strip().lower()
    if args[0] == "remove":
        with db() as conn, conn.cursor() as cur:
            cur.execute("delete from beta_signups where email = %s", (email,))
            print("Removed." if cur.rowcount else "Not on the list.")
        return 0
    lang = args[2] if len(args) > 2 and args[2] in BETA_LANGS else None
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into beta_signups (email, lang, approved_at) values (%s, %s, now())
            on conflict (email) do update set approved_at = coalesce(beta_signups.approved_at, now()),
              lang = coalesce(%s, beta_signups.lang)
            returning lang, first_name
            """,
            (email, lang or "fr", lang),
        )
        lang, first_name = cur.fetchone()
    send_beta_invite(email, lang, first_name)
    with db() as conn, conn.cursor() as cur:
        cur.execute("update beta_signups set invited_at = now() where email = %s", (email,))
    print(f"Approved {email}. Invitation sent in {lang}.")
    return 0


def main():
    if not (DSN or os.environ.get("DATABASE_URL")):
        raise RuntimeError("DATABASE_URL is not set")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"coparents api on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "beta":
        load_env_files(["/etc/coparents/database.env", "/etc/coparents/app.env"])
        sys.exit(beta_command(sys.argv[2:]))
    main()
