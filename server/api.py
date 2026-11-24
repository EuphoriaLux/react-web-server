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
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit
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


# ─── AI assistants ──────────────────────────────────────────────────────────
#
# Claude, ChatGPT and other assistants connect over MCP (Streamable HTTP, plain
# JSON answers) at /api/mcp. Each parent signs in through OAuth with a code sent
# by email and clicks Allow, so an assistant only ever sees that parent's plan.
# Tools write into the same shared plan JSON the web app syncs, as the parent's
# own side, and every change is logged (agent_log and the plan's activity feed).
# See docs/assistants.md.

MCP_PROTOCOLS = ("2025-11-25", "2025-06-18", "2025-03-26")
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=60)
OAUTH_CODE_TTL = timedelta(minutes=10)
AGENT_SCOPE = "plan"
CHALLENGE_RE = re.compile(r"^[A-Za-z0-9._~-]{43,128}$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
CARE_TYPES = ["creche", "maison-relais", "school", "secondary", "home", "other"]
RHYTHMS = ["weeks", "2-2-3", "weekend-mid", "mostly-A", "mostly-B", "undecided"]
RULINGS = ["yes", "no", "pending"]
EXPENSE_CATEGORIES = ["food", "clothes", "school", "activities", "health", "holidays", "other"]
EVENT_TYPES = ["event", "handover", "school", "medical"]
NOTE_TOPICS = ["handover", "school", "money", "health"]


def mcp_url() -> str:
    return f"{APP_URL}/api/mcp"


def protected_resource_meta():
    return {
        "resource": mcp_url(),
        "authorization_servers": [APP_URL],
        "scopes_supported": [AGENT_SCOPE],
        "bearer_methods_supported": ["header"],
        "resource_name": "CoParents",
    }


def auth_server_meta():
    return {
        "issuer": APP_URL,
        "authorization_endpoint": f"{APP_URL}/api/oauth/authorize",
        "token_endpoint": f"{APP_URL}/api/oauth/token",
        "registration_endpoint": f"{APP_URL}/api/oauth/register",
        "revocation_endpoint": f"{APP_URL}/api/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": [AGENT_SCOPE],
        "service_documentation": f"{APP_URL}/#privacy",
    }


def redirect_ok(uri: str) -> bool:
    """https anywhere, http only on this computer, or an app's own scheme (cursor://...)."""
    if not isinstance(uri, str) or len(uri) > 500:
        return False
    try:
        parts = urlsplit(uri)
    except ValueError:
        return False
    if parts.fragment or not parts.scheme:
        return False
    scheme = parts.scheme.lower()
    if scheme == "https":
        return bool(parts.hostname)
    if scheme == "http":
        return parts.hostname in ("localhost", "127.0.0.1", "::1")
    if scheme in ("javascript", "data", "file", "vbscript", "blob", "about", "ws", "wss", "ftp"):
        return False
    return bool(re.match(r"^[a-z][a-z0-9+.-]*$", scheme))


def with_query(uri: str, params: dict) -> str:
    joiner = "&" if urlsplit(uri).query else "?"
    return uri + joiner + urlencode({k: v for k, v in params.items() if v not in (None, "")})


def pkce_ok(verifier: str, challenge: str) -> bool:
    if not CHALLENGE_RE.match(verifier or ""):
        return False
    digest = hashlib.sha256(verifier.encode()).digest()
    expected = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return secrets.compare_digest(expected, challenge)


def send_login_code(email: str, code: str):
    if not SMTP_HOST or not MAIL_FROM:
        print(f"[dev] assistant sign-in code for {email}: {code}", flush=True)
        return
    send_mail(
        email,
        f"Your CoParents code: {code}",
        f"Type this code to connect your assistant to CoParents:\n\n    {code}\n\n"
        "It works once and expires in 15 minutes.\n"
        "If you did not ask for it, you can ignore this email. Nothing is connected without the code.\n\n"
        f"Votre code CoParents : {code}\n"
        "Il fonctionne une seule fois et expire dans 15 minutes.\n",
    )


def plain_json(value) -> str:
    """The same text the web app's JSON.stringify writes, so the sync sees no false changes."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def money(value) -> float | int:
    try:
        n = float(str(value).replace(",", ".")) if not isinstance(value, (int, float)) else float(value)
    except ValueError:
        return 0
    if not (n > 0) or n != n or n == float("inf"):
        return 0
    n = round(n, 2)
    return int(n) if n == int(n) else n


def today_lu() -> date:
    return datetime.now(LU).date()


def parse_day(value, field="date") -> date:
    if not isinstance(value, str) or not DAY_RE.match(value):
        raise ToolError(f"{field} must look like 2026-12-24")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ToolError(f"{field} is not a real date")


class ToolError(Exception):
    """Shown to the assistant as the tool's answer, so it can fix the input or tell the parent."""


# Family details, the same rules as src/family.js.

def new_family():
    return {
        "v": 1,
        "parents": {"A": {"name": ""}, "B": {"name": ""}},
        "children": [],
        "activities": [],
        "custody": {"rhythm": "", "handoverDay": "", "handoverTime": "", "handoverPlace": "", "ruling": ""},
        "filledBy": "",
        "done": False,
        "confirmed": {"A": False, "B": False},
    }


def normalize_family(raw):
    if not isinstance(raw, dict):
        return None
    base = new_family()
    fam = {**base, **raw}
    parents = raw.get("parents") if isinstance(raw.get("parents"), dict) else {}
    fam["parents"] = {
        side: {**base["parents"][side], **(parents.get(side) if isinstance(parents.get(side), dict) else {})}
        for side in ("A", "B")
    }
    fam["children"] = [c for c in raw.get("children") or [] if isinstance(c, dict)]
    fam["activities"] = [a for a in raw.get("activities") or [] if isinstance(a, dict)]
    fam["custody"] = {**base["custody"], **(raw.get("custody") if isinstance(raw.get("custody"), dict) else {})}
    fam["confirmed"] = {**base["confirmed"], **(raw.get("confirmed") if isinstance(raw.get("confirmed"), dict) else {})}
    return fam


def family_short_id() -> str:
    return secrets.token_hex(5)


def children_label(family) -> str:
    names = [str(c.get("name", "")).strip() for c in family.get("children", []) if str(c.get("name", "")).strip()]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return f"{', '.join(names[:-1])} & {names[-1]}"


def family_changes(before, after):
    if not before:
        return []
    changes = []
    if before["parents"] != after["parents"]:
        changes.append("names")
    strip = lambda kids: [{k: v for k, v in c.items() if k != "health"} for c in kids]  # noqa: E731
    if strip(before["children"]) != strip(after["children"]):
        changes.append("children")
    if [c.get("health", "") for c in before["children"]] != [c.get("health", "") for c in after["children"]]:
        changes.append("health")
    if before["activities"] != after["activities"]:
        changes.append("activities")
    if before["custody"] != after["custody"]:
        changes.append("custody")
    return changes


def rhythm_owner(rhythm, day: date, start: date):
    monday = start - timedelta(days=start.weekday())
    week = (day - monday).days // 7
    odd = week % 2 == 1
    dow = day.weekday()
    weekend = dow >= 5
    if rhythm == "weeks":
        return "B" if odd else "A"
    if rhythm == "2-2-3":
        first, second = ("B", "A") if odd else ("A", "B")
        return first if dow <= 1 or dow >= 4 else second
    if rhythm == "weekend-mid":
        if dow == 2:
            return "B"
        if weekend:
            return "B" if odd else "A"
        return "A"
    if rhythm == "mostly-A":
        return "B" if weekend and odd else "A"
    if rhythm == "mostly-B":
        return "A" if weekend and odd else "B"
    return None


def fill_custody(custody, rhythm, start: date, weeks, locked, anchor: date):
    """Fill empty days only. Planned days and locked months are left alone."""
    out = dict(custody)
    added = 0
    if rhythm not in RHYTHMS or rhythm == "undecided":
        return out, 0
    for i in range(weeks * 7):
        day = start + timedelta(days=i)
        key = day.isoformat()
        if out.get(key) or locked.get(key[:7]):
            continue
        who = rhythm_owner(rhythm, day, anchor)
        if who:
            out[key] = who
            added += 1
    return out, added


def expense_balance(expenses):
    a = 0.0
    for it in expenses:
        if not isinstance(it, dict) or it.get("settled") or it.get("paidBy") == "account":
            continue
        amount = money(it.get("amount"))
        split = it.get("split") if it.get("split") in ("50", "A", "B") else "50"
        share_a = amount / 2 if split == "50" else amount if split == "A" else 0
        share_b = amount - share_a
        if it.get("paidBy", "A") == "A":
            a += share_b
        else:
            a -= share_a
    a = 0 if abs(a) < 0.005 else round(a, 2)
    return {"A": a, "B": -a if a else 0}


class AgentSession:
    """One tool call by one parent's assistant, inside one database transaction."""

    def __init__(self, cur, user_id, email, client_name, client_ip):
        self.cur = cur
        self.user_id = user_id
        self.email = email
        self.client_name = client_name or "assistant"
        self.client_ip = client_ip
        self.member = member_from_user(cur, user_id)
        self._state = None
        self._dirty = set()

    # Who and where

    @property
    def role(self):
        return self.member[0] if self.member else None

    @property
    def other(self):
        return "B" if self.role == "A" else "A"

    def need_plan(self):
        if self.member is None:
            raise ToolError("This parent has no shared plan yet. Call get_started to see how to create or join one.")
        return self.member

    def side(self, ref, field):
        if ref in ("me", "self"):
            return self.role
        if ref in ("other", "other_parent"):
            return self.other
        raise ToolError(f"{field} must be 'me' or 'other'")

    # The shared plan, loaded once per call and locked until the call ends.

    def state(self):
        if self._state is None:
            _, household_id, _ = self.need_plan()
            self.cur.execute("select state from plans where household_id = %s for update", (household_id,))
            row = self.cur.fetchone()
            self._state = dict(row[0]) if row and isinstance(row[0], dict) else {}
        return self._state

    def read(self, key, fallback):
        raw = self.state().get(key)
        if raw is None:
            return fallback
        try:
            value = json.loads(raw) if isinstance(raw, str) else raw
        except ValueError:
            return fallback
        return value if value is not None else fallback

    def write(self, key, value):
        self.state()[key] = plain_json(value)
        self._dirty.add(key)

    def names(self):
        family = normalize_family(self.read("cp-family", None)) or new_family()
        profile = self.read("cp-profile", {}) or {}
        out = {}
        for side in ("A", "B"):
            name = family["parents"][side]["name"].strip() or str(profile.get(f"name{side}", "") or "").strip()
            if name in ("Alex", "Sam"):
                name = ""
            out[side] = name or f"Parent {side}"
        return out

    def label(self, side):
        names = self.names()
        if side == self.role:
            return f"{names[side]} (you)"
        return names.get(side, side)

    def log(self, tool, summary, feed=True):
        household_id = self.member[1] if self.member else None
        self.cur.execute(
            "insert into agent_log (household_id, user_id, client_name, tool, summary) values (%s, %s, %s, %s, %s)",
            (household_id, self.user_id, self.client_name[:80], tool, summary[:500]),
        )
        if feed and self.member:
            feed_items = self.read("cp-activity", [])
            if not isinstance(feed_items, list):
                feed_items = []
            entry = {
                "id": str(int(time.time() * 1000)),
                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "text": f"{self.names()[self.role]} · {summary} (via {self.client_name[:40]})",
            }
            self.write("cp-activity", [entry, *feed_items][:40])

    def save(self):
        if not self._dirty:
            return
        _, household_id, _ = self.member
        self.cur.execute(
            "update plans set state = %s, updated_at = %s where household_id = %s",
            (psycopg2.extras.Json(self._state), datetime.now(timezone.utc), household_id),
        )

    # ── Onboarding ──

    def get_started(self, args):
        cur = self.cur
        cur.execute("select approved_at is not null from beta_signups where email = %s", (self.email,))
        row = cur.fetchone()
        waitlist = "approved" if row and row[0] else "waiting" if row else "not on the list"
        can_create = not BETA_GATE or waitlist == "approved"
        out = {"signed_in_as": self.email, "plan": None, "family": None, "next_steps": []}
        steps = out["next_steps"]
        if self.member is None:
            out["can_create_plan"] = can_create
            out["beta_waitlist"] = waitlist if BETA_GATE else "not needed"
            steps.append("If the other parent already uses CoParents, ask them for the 6-character code of their plan and call join_plan.")
            if can_create:
                steps.append("Otherwise call create_plan to start a new shared plan, then help fill in the family details.")
            elif waitlist == "waiting":
                steps.append("New plans are invite-only during the beta. This parent is on the waitlist already; the CoParents team will email when they can create a plan. Joining with a code works now.")
            else:
                steps.append("New plans are invite-only during the beta. Offer to add this parent to the waitlist with join_waitlist (ask for their consent first). Joining with a code works now.")
            return out
        role, household_id, code = self.member
        cur.execute("select count(*) from members where household_id = %s", (household_id,))
        both = cur.fetchone()[0] >= 2
        family = normalize_family(self.read("cp-family", None))
        names = self.names()
        out["plan"] = {
            "code": code,
            "your_side": role,
            "you": names[role],
            "other_parent": names[self.other],
            "other_parent_joined": both,
            "invite_link": f"{APP_URL}/?join={code}",
            "app": APP_URL,
        }
        if family is None:
            out["family"] = {"details_filled": False}
        else:
            author = family.get("editedBy") or family.get("filledBy") or ""
            out["family"] = {
                "details_filled": bool(family.get("done")),
                "children": [c.get("name") for c in family["children"] if str(c.get("name", "")).strip()],
                "last_edited_by": names.get(author, "") if author else "",
                "confirmed_by_you": bool(family["confirmed"].get(role)) or author == role,
                "confirmed_by_other_parent": bool(family["confirmed"].get(self.other)) or (author == self.other),
            }
        fam = out["family"]
        if not fam["details_filled"]:
            steps.append(
                "Ask about the family in a friendly conversation, one topic at a time: the parent's own first name, the other parent's first name, "
                "the children (name, birth year, crèche/maison relais/school and which one), regular activities, and how care is shared "
                "(rhythm, handover day, time and place). Only the parent's first name and one child's name are needed; everything else can be skipped. "
                "Then call save_family_details. Health notes are optional: only record one if the parent offers it."
            )
        elif not fam["confirmed_by_you"]:
            steps.append("The other parent filled in the family details. Show them with get_family_details and ask this parent to confirm (confirm_family_details) or correct them (save_family_details).")
        if not both:
            steps.append("The other parent has not joined yet. Offer the invite from get_invite so this parent can send it by WhatsApp or email.")
        if fam["details_filled"] and fam["confirmed_by_you"] and both:
            steps.append("Setup is done. The parent can now add expenses, plan the calendar and send messages through you or in the app.")
        return out

    def join_waitlist(self, args):
        if args.get("consent") is not True:
            raise ToolError("Ask the parent if CoParents may email them about the beta, then call again with consent: true.")
        first_name = " ".join(str(args.get("first_name", "")).split())[:60]
        lang = args.get("language") if args.get("language") in BETA_LANGS else "en"
        care = args.get("care", "") if args.get("care", "") in BETA_CARE else ""
        other = args.get("other_parent", "") if args.get("other_parent", "") in BETA_OTHER else ""
        children = args.get("children")
        children = children if isinstance(children, int) and 0 <= children <= 12 else None
        if not LIMITS.allow(f"beta:{self.email}", 3, 86400):
            raise ToolError("Too many attempts today. Try again tomorrow.")
        self.cur.execute(
            """
            insert into beta_signups (email, first_name, lang, children, care, other_parent, consent_at)
            values (%s, %s, %s, %s, %s, %s, now())
            on conflict (email) do update set
              first_name = excluded.first_name, lang = excluded.lang, children = excluded.children,
              care = excluded.care, other_parent = excluded.other_parent, consent_at = now()
            returning (xmax = 0), approved_at is not null
            """,
            (self.email, first_name, lang, children, care, other),
        )
        fresh, approved = self.cur.fetchone()
        self.log("join_waitlist", "joined the beta waitlist", feed=False)
        if fresh:
            try:
                send_beta_notice({
                    "email": self.email, "first_name": first_name, "language": lang,
                    "children": "" if children is None else children, "care": care, "other_parent": other,
                    "via": self.client_name,
                })
            except Exception as exc:
                print(f"beta notice failed: {exc!r}", flush=True)
        if approved:
            return {"ok": True, "status": "approved", "say": "This address is already invited: call create_plan."}
        return {"ok": True, "status": "waiting", "say": "Added to the waitlist. The CoParents team will email this address when a plan can be created. Joining the other parent's plan with a code works any time."}

    def create_plan(self, args):
        if self.member is not None:
            raise ToolError("This parent already has a shared plan. Call get_started.")
        if BETA_GATE and not beta_approved(self.cur, self.email):
            raise ToolError("New plans are invite-only during the beta. Offer join_waitlist, or join the other parent's plan with join_plan.")
        code = new_code(self.cur)
        self.cur.execute("insert into households (code) values (%s) returning id", (code,))
        household_id = self.cur.fetchone()[0]
        self.cur.execute("insert into members (household_id, role, user_id) values (%s, 'A', %s)", (household_id, self.user_id))
        self.cur.execute("insert into plans (household_id, state) values (%s, %s)", (household_id, psycopg2.extras.Json({})))
        self.member = member_from_user(self.cur, self.user_id)
        self.log("create_plan", "created the shared plan", feed=False)
        return {
            "ok": True, "code": code, "invite_link": f"{APP_URL}/?join={code}",
            "next": "Fill in the family details with save_family_details, then share the invite (get_invite) with the other parent.",
        }

    def join_plan(self, args):
        code = str(args.get("code", "")).strip().upper().replace(" ", "")
        if len(code) != 6:
            raise ToolError("The code has 6 characters, like K7M2QX.")
        if not LIMITS.allow(f"join:{self.user_id}", 8, 3600):
            raise ToolError("Too many attempts. Try again in an hour.")
        if self.member is not None:
            raise ToolError("This parent already has a shared plan.")
        self.cur.execute("select id from households where code = %s", (code,))
        row = self.cur.fetchone()
        if row is None:
            raise ToolError("No plan has that code. Ask the other parent to check it in the app (Family tab, invite).")
        household_id = row[0]
        self.cur.execute("select role from members where household_id = %s", (household_id,))
        roles = {item[0] for item in self.cur.fetchall()}
        if len(roles) >= 2:
            raise ToolError("This plan already has two parents.")
        role = "A" if "B" in roles else "B"
        self.cur.execute("insert into members (household_id, role, user_id) values (%s, %s, %s)", (household_id, role, self.user_id))
        self.member = member_from_user(self.cur, self.user_id)
        family = normalize_family(self.read("cp-family", None))
        self.log("join_plan", "joined the shared plan")
        out = {"ok": True, "code": code, "your_side": role}
        if family and family.get("done"):
            out["next"] = "The other parent already filled in the family details. Show them (get_family_details) and ask this parent to confirm or correct them. Ask their first name if it is missing."
        else:
            out["next"] = "Help fill in the family details with save_family_details."
        return out

    def get_invite(self, args):
        _, _, code = self.need_plan()
        names = self.names()
        link = f"{APP_URL}/?join={code}"
        lang = args.get("language", "fr")
        texts = {
            "en": f"I set up our shared plan for the children on CoParents. Open {link} , sign in with your own email and join with the code {code}.",
            "fr": f"J’ai créé notre planning partagé pour les enfants sur CoParents. Ouvre {link} , connecte-toi avec ton adresse e-mail et rejoins avec le code {code}.",
            "de": f"Ich habe unseren gemeinsamen Plan für die Kinder auf CoParents angelegt. Öffne {link} , melde dich mit deiner E-Mail an und tritt mit dem Code {code} bei.",
        }
        return {
            "code": code, "link": link, "message": texts.get(lang, texts["en"]),
            "whatsapp_link": f"https://wa.me/?text={quote(texts.get(lang, texts['en']))}",
            "for": names[self.other],
        }

    def family_view(self, family):
        names = self.names()
        ids = {c.get("id"): c.get("name", "") for c in family["children"]}
        cust = family["custody"]
        day = cust.get("handoverDay", "")
        return {
            "finished": bool(family.get("done")),
            "you": family["parents"][self.role]["name"],
            "other_parent": family["parents"][self.other]["name"],
            "children": [
                {k: v for k, v in {
                    "name": c.get("name", ""), "birth_year": c.get("birthYear", ""), "care": c.get("care", ""),
                    "place": c.get("place", ""), "group": c.get("group", ""), "health_note": c.get("health", ""),
                }.items() if v not in ("", None)}
                for c in family["children"] if str(c.get("name", "")).strip()
            ],
            "activities": [
                {k: v for k, v in {
                    "name": a.get("name", ""),
                    "child": ids.get(a.get("childId"), "all") if a.get("childId") != "all" else "all",
                    "day": WEEKDAYS[int(a.get("day", 0)) % 7] if str(a.get("day", "")).lstrip("-").isdigit() else "",
                    "time": a.get("time", ""),
                    "who": names.get(a.get("who"), "") if a.get("who") else "",
                }.items() if v not in ("", None)}
                for a in family["activities"] if str(a.get("name", "")).strip()
            ],
            "custody": {k: v for k, v in {
                "rhythm": cust.get("rhythm", ""),
                "handover_day": WEEKDAYS[int(day) % 7] if str(day).isdigit() else "",
                "handover_time": cust.get("handoverTime", ""),
                "handover_place": cust.get("handoverPlace", ""),
                "court_ruling": cust.get("ruling", ""),
            }.items() if v},
            "confirmed": {names["A"]: bool(family["confirmed"].get("A")), names["B"]: bool(family["confirmed"].get("B"))},
        }

    def get_family_details(self, args):
        self.need_plan()
        family = normalize_family(self.read("cp-family", None))
        if family is None:
            return {"finished": False, "say": "No family details yet. Use save_family_details."}
        return self.family_view(family)

    def save_family_details(self, args):
        role = self.need_plan()[0]
        other = self.other
        current = normalize_family(self.read("cp-family", None))
        draft = json.loads(json.dumps(current or new_family()))
        text = lambda v, n=80: " ".join(str(v or "").split())[:n]  # noqa: E731
        if "my_first_name" in args:
            draft["parents"][role]["name"] = text(args["my_first_name"], 40)
        if "other_parent_first_name" in args:
            draft["parents"][other]["name"] = text(args["other_parent_first_name"], 40)
        if "children" in args:
            if not isinstance(args["children"], list) or len(args["children"]) > 12:
                raise ToolError("children must be a list (at most 12)")
            old = {str(c.get("name", "")).strip().lower(): c for c in draft["children"]}
            kids = []
            for item in args["children"]:
                if not isinstance(item, dict) or not text(item.get("name"), 40):
                    raise ToolError("each child needs a name")
                name = text(item.get("name"), 40)
                care = item.get("care", "")
                if care and care not in CARE_TYPES:
                    raise ToolError(f"care must be one of {', '.join(CARE_TYPES)}")
                year = str(item.get("birth_year", "") or "").strip()
                if year and not re.match(r"^(19|20)\d\d$", year):
                    raise ToolError("birth_year must be a year like 2019")
                prev = old.get(name.lower(), {})
                kids.append({
                    "id": prev.get("id") or family_short_id(), "name": name, "birthYear": year,
                    "care": care, "place": text(item.get("place")), "group": text(item.get("group")),
                    "health": text(item.get("health_note"), 400) if "health_note" in item else prev.get("health", ""),
                })
            draft["children"] = kids
        if "activities" in args:
            if not isinstance(args["activities"], list) or len(args["activities"]) > 30:
                raise ToolError("activities must be a list (at most 30)")
            by_name = {str(c.get("name", "")).strip().lower(): c.get("id") for c in draft["children"]}
            acts = []
            for item in args["activities"]:
                if not isinstance(item, dict) or not text(item.get("name")):
                    raise ToolError("each activity needs a name")
                day = str(item.get("day", "")).lower()
                if day not in WEEKDAYS:
                    raise ToolError("activity day must be a weekday name, like wednesday")
                child = str(item.get("child", "all") or "all").strip().lower()
                who = item.get("who", "")
                acts.append({
                    "id": family_short_id(), "childId": by_name.get(child, "all"), "name": text(item.get("name")),
                    "day": WEEKDAYS.index(day), "time": text(item.get("time"), 5),
                    "who": self.side(who, "activity who") if who else "",
                })
            draft["activities"] = acts
        if "custody" in args:
            c = args["custody"] if isinstance(args["custody"], dict) else {}
            cust = draft["custody"]
            if "rhythm" in c:
                if c["rhythm"] and c["rhythm"] not in RHYTHMS:
                    raise ToolError(f"rhythm must be one of {', '.join(RHYTHMS)}")
                # mostly-A / mostly-B are stored by side, the assistant speaks of me / other.
                rhythm = c["rhythm"]
                if rhythm in ("mostly-me", "mostly-other"):
                    rhythm = f"mostly-{role if rhythm == 'mostly-me' else other}"
                cust["rhythm"] = rhythm
            if "handover_day" in c:
                day = str(c["handover_day"] or "").lower()
                if day and day not in WEEKDAYS:
                    raise ToolError("handover_day must be a weekday name")
                cust["handoverDay"] = str(WEEKDAYS.index(day)) if day else ""
            if "handover_time" in c:
                cust["handoverTime"] = text(c["handover_time"], 5)
            if "handover_place" in c:
                cust["handoverPlace"] = text(c["handover_place"])
            if "court_ruling" in c:
                if c["court_ruling"] and c["court_ruling"] not in RULINGS:
                    raise ToolError("court_ruling must be yes, no or pending")
                cust["ruling"] = c["court_ruling"] or ""
        finished = args.get("finished", True) is not False
        if not finished:
            if current and current.get("done"):
                raise ToolError("The family details are already finished. Call again with finished: true to update them.")
            draft["done"] = False
            self.write("cp-family", draft)
            self.write("cp-profile", self._profile(draft))
            self.log("save_family_details", "saved part of the family details", feed=False)
            return {"ok": True, "saved_as_draft": True}
        if not draft["parents"][role]["name"].strip() or not any(str(c.get("name", "")).strip() for c in draft["children"]):
            raise ToolError("To finish, the parent's own first name and at least one child's name are needed.")
        base = current if current and current.get("done") else None
        changes = family_changes(base, draft)
        nxt = {
            **draft,
            "done": True,
            "filledBy": (base or {}).get("filledBy") or role,
            "editedBy": role,
            "rhythmFrom": (current or {}).get("rhythmFrom"),
            "confirmed": {role: True, other: False} if base and changes else {**((base or draft)["confirmed"]), role: True},
        }
        if nxt["rhythmFrom"] is None:
            nxt.pop("rhythmFrom")
        filled = 0
        rhythm = nxt["custody"]["rhythm"]
        weeks = args.get("fill_calendar_weeks", 12)
        weeks = weeks if isinstance(weeks, int) and 0 <= weeks <= 26 else 12
        if rhythm and rhythm != "undecided" and weeks:
            today = today_lu()
            saved = nxt.get("rhythmFrom") or {}
            anchor = date.fromisoformat(saved["date"]) if saved.get("rhythm") == rhythm and DAY_RE.match(str(saved.get("date", ""))) else today
            nxt["rhythmFrom"] = {"rhythm": rhythm, "date": anchor.isoformat()}
            custody, filled = fill_custody(self.read("cp-custody", {}) or {}, rhythm, today, weeks, self.read("cp-locked", {}) or {}, anchor)
            if filled:
                self.write("cp-custody", custody)
        self.write("cp-family", nxt)
        self.write("cp-profile", self._profile(nxt))
        me = nxt["parents"][role]["name"]
        if not base:
            self.log("save_family_details", f"{me} filled in the family details")
        elif changes:
            self.log("save_family_details", f"{me} changed the family details: {', '.join(changes)}")
        out = {"ok": True, "finished": True, "calendar_days_filled": filled, "details": self.family_view(nxt)}
        if base and changes:
            out["note"] = "The other parent will be asked to confirm the changes in the app."
        return out

    def _profile(self, family):
        prev = self.read("cp-profile", {}) or {}
        keep = lambda k, demo: prev.get(k) if prev.get(k) and prev.get(k) != demo else ""  # noqa: E731
        return {
            "nameA": family["parents"]["A"]["name"].strip() or keep("nameA", "Alex"),
            "nameB": family["parents"]["B"]["name"].strip() or keep("nameB", "Sam"),
            "child": children_label(family) or keep("child", "Noa"),
        }

    def confirm_family_details(self, args):
        role = self.need_plan()[0]
        family = normalize_family(self.read("cp-family", None))
        if not family or not family.get("done"):
            raise ToolError("There are no finished family details to confirm yet.")
        if family["confirmed"].get(role):
            return {"ok": True, "already_confirmed": True}
        family["confirmed"][role] = True
        self.write("cp-family", family)
        self.log("confirm_family_details", f"{self.names()[role]} confirmed the family details")
        return {"ok": True}

    # ── Calendar ──

    def get_calendar(self, args):
        self.need_plan()
        start = parse_day(args["from_date"], "from_date") if args.get("from_date") else today_lu()
        days = args.get("days", 14)
        if not isinstance(days, int) or not 1 <= days <= 92:
            raise ToolError("days must be between 1 and 92")
        custody = self.read("cp-custody", {}) or {}
        locked = self.read("cp-locked", {}) or {}
        events = [e for e in self.read("cp-events", []) or [] if isinstance(e, dict)]
        names = self.names()
        out = []
        for i in range(days):
            day = start + timedelta(days=i)
            key = day.isoformat()
            who = custody.get(key)
            entry = {
                "date": key, "weekday": WEEKDAYS[day.weekday()],
                "children_with": "both" if who == "both" else self.label(who) if who in ("A", "B") else "not planned",
            }
            todays = [{"title": e.get("title", ""), "type": e.get("type", "event")} for e in events if e.get("date") == key]
            if todays:
                entry["events"] = todays
            if locked.get(key[:7]):
                entry["locked"] = True
            out.append(entry)
        return {"parents": {"you": names[self.role], "other_parent": names[self.other]}, "days": out}

    def set_custody_days(self, args):
        self.need_plan()
        items = args.get("days")
        if not isinstance(items, list) or not 1 <= len(items) <= 92:
            raise ToolError("days must be a list of 1 to 92 entries")
        locked = self.read("cp-locked", {}) or {}
        custody = dict(self.read("cp-custody", {}) or {})
        changes = {}
        for item in items:
            if not isinstance(item, dict):
                raise ToolError("each day needs a date and with")
            day = parse_day(item.get("date"))
            who = item.get("with")
            side = "both" if who == "both" else self.side(who, "with")
            if locked.get(day.isoformat()[:7]):
                raise ToolError(f"{day:%B %Y} is locked. Both parents agreed it; unlock it in the app first if it must change.")
            changes[day.isoformat()] = side
        custody.update(changes)
        self.write("cp-custody", custody)
        first, last = min(changes), max(changes)
        span = first if first == last else f"{first} to {last}"
        self.log("set_custody_days", f"changed {len(changes)} calendar day{'s' if len(changes) > 1 else ''} ({span})")
        return {"ok": True, "changed": len(changes), "from": first, "to": last}

    def add_calendar_event(self, args):
        self.need_plan()
        title = " ".join(str(args.get("title", "")).split())[:120]
        if not title:
            raise ToolError("An event needs a title")
        day = parse_day(args.get("date"))
        kind = args.get("type", "event")
        if kind not in EVENT_TYPES:
            raise ToolError(f"type must be one of {', '.join(EVENT_TYPES)}")
        events = [e for e in self.read("cp-events", []) or [] if isinstance(e, dict)]
        new_id = max([int(time.time() * 1000)] + [e["id"] + 1 for e in events if isinstance(e.get("id"), int)])
        event = {"id": new_id, "title": title, "date": day.isoformat(), "type": kind}
        self.write("cp-events", [*events, event])
        self.log("add_calendar_event", f"added “{title}” on {day.isoformat()}")
        return {"ok": True, "event": event}

    # ── Money ──

    def _expense_view(self, it):
        names = self.names()
        split = {"50": "half each", "A": f"all {names['A']}", "B": f"all {names['B']}"}
        return {
            "id": it.get("id"), "description": it.get("desc", ""), "amount_eur": money(it.get("amount")),
            "date": it.get("date", ""), "category": it.get("category", "other"),
            "paid_by": "shared account" if it.get("paidBy") == "account" else self.label(it.get("paidBy", "A")),
            "cost_carried_by": split.get(it.get("split", "50"), "half each"),
            "settled": bool(it.get("settled")),
            "receipt_photos": len(it.get("receipts") or []),
        }

    def _balance_view(self, expenses):
        bal = expense_balance(expenses)
        names = self.names()
        if not bal["A"]:
            return {"summary": "All square: nobody owes anything for unsettled costs.", "amount_eur": 0}
        owed, owes = ("A", "B") if bal["A"] > 0 else ("B", "A")
        return {
            "summary": f"{self.label(owes)} owes {self.label(owed)} €{abs(bal['A']):.2f} for unsettled costs.",
            "owes": names[owes], "is_owed": names[owed], "amount_eur": abs(bal["A"]),
        }

    def list_expenses(self, args):
        self.need_plan()
        items = [e for e in self.read("cp-expenses", []) or [] if isinstance(e, dict)]
        month = args.get("month")
        if month and not MONTH_RE.match(str(month)):
            raise ToolError("month must look like 2026-11")
        shown = [e for e in items if (not month or str(e.get("date", "")).startswith(month)) and not (args.get("only_unsettled") and e.get("settled"))]
        shown.sort(key=lambda e: str(e.get("date", "")), reverse=True)
        total = round(sum(money(e.get("amount")) for e in shown), 2)
        return {"expenses": [self._expense_view(e) for e in shown[:100]], "count": len(shown), "total_eur": total, "balance": self._balance_view(items)}

    def get_balance(self, args):
        self.need_plan()
        items = [e for e in self.read("cp-expenses", []) or [] if isinstance(e, dict)]
        month = today_lu().isoformat()[:7]
        budget = (self.read("cp-money", {}) or {}).get("budget") or {}
        spent = {}
        for e in items:
            if str(e.get("date", "")).startswith(month):
                cat = e.get("category") if e.get("category") in EXPENSE_CATEGORIES else "other"
                spent[cat] = round(spent.get(cat, 0) + money(e.get("amount")), 2)
        this_month = [
            {"category": c, "spent_eur": spent.get(c, 0), **({"budget_eur": money(budget[c])} if money(budget.get(c)) else {})}
            for c in EXPENSE_CATEGORIES if spent.get(c) or money(budget.get(c))
        ]
        return {"balance": self._balance_view(items), "month": month, "this_month": this_month}

    def add_expense(self, args):
        self.need_plan()
        desc = " ".join(str(args.get("description", "")).split())[:120]
        if not desc:
            raise ToolError("An expense needs a short description")
        amount = money(args.get("amount"))
        if not amount or amount > 100000:
            raise ToolError("amount must be a positive number of euros")
        day = parse_day(args["date"]) if args.get("date") else today_lu()
        category = args.get("category", "other")
        if category not in EXPENSE_CATEGORIES:
            raise ToolError(f"category must be one of {', '.join(EXPENSE_CATEGORIES)}")
        paid = args.get("paid_by", "me")
        paid_by = "account" if paid == "shared_account" else self.side(paid, "paid_by")
        split_ref = args.get("split", "half")
        split = "50" if split_ref == "half" else self.side(split_ref, "split")
        items = [e for e in self.read("cp-expenses", []) or [] if isinstance(e, dict)]
        new_id = max([int(time.time() * 1000)] + [e["id"] + 1 for e in items if isinstance(e.get("id"), int)])
        item = {
            "id": new_id, "desc": desc, "amount": amount, "paidBy": paid_by, "split": split,
            "date": day.isoformat(), "category": category, "settled": False, "receipts": [],
        }
        items.append(item)
        self.write("cp-expenses", items)
        self.log("add_expense", f"added “{desc}” €{amount:.2f}")
        return {"ok": True, "expense": self._expense_view(item), "balance": self._balance_view(items),
                "note": "A receipt photo can be added to this expense in the app (Money tab)."}

    def mark_expenses_settled(self, args):
        self.need_plan()
        ids = args.get("expense_ids")
        if not isinstance(ids, list) or not 1 <= len(ids) <= 100:
            raise ToolError("expense_ids must list 1 to 100 ids from list_expenses")
        wanted = {str(i) for i in ids}
        items = [e for e in self.read("cp-expenses", []) or [] if isinstance(e, dict)]
        today = today_lu().isoformat()
        done = []
        for e in items:
            if str(e.get("id")) in wanted and not e.get("settled"):
                e["settled"] = True
                e["settledAt"] = today
                done.append(e.get("desc", ""))
        missing = wanted - {str(e.get("id")) for e in items}
        if missing:
            raise ToolError(f"No expense with id {', '.join(sorted(missing))}. Use list_expenses for the ids.")
        if done:
            self.write("cp-expenses", items)
            self.log("mark_expenses_settled", f"marked {len(done)} cost{'s' if len(done) > 1 else ''} settled")
        return {"ok": True, "settled": len(done), "balance": self._balance_view(items)}

    # ── Messages ──

    def list_messages(self, args):
        role, household_id, _ = self.need_plan()
        topic = args.get("topic", "")
        if topic and topic not in NOTE_TOPICS:
            raise ToolError(f"topic must be one of {', '.join(NOTE_TOPICS)}")
        limit = args.get("limit", 30)
        limit = limit if isinstance(limit, int) and 1 <= limit <= 100 else 30
        self.cur.execute(
            """
            select author, channel, fact, ask, by_when, urgent, sent_at, deliver_at from notes
            where household_id = %s and (%s = '' or channel = %s) and (deliver_at <= now() or author = %s)
            order by sent_at desc limit %s
            """,
            (household_id, topic, topic, role, limit),
        )
        rows = self.cur.fetchall()
        now = datetime.now(timezone.utc)
        out = []
        for author, channel, fact, ask, by_when, urgent, sent_at, ready in reversed(rows):
            item = {"from": self.label(author), "topic": channel, "message": fact,
                    "sent": sent_at.astimezone(LU).strftime("%Y-%m-%d %H:%M")}
            if ask:
                item["asks"] = ask
            if by_when:
                item["by_when"] = by_when
            if urgent:
                item["urgent"] = True
            if ready > now:
                item["delivered_at"] = ready.astimezone(LU).strftime("%Y-%m-%d %H:%M")
            out.append(item)
        return {"messages": out}

    def send_message(self, args):
        role, household_id, _ = self.need_plan()
        topic = args.get("topic", "handover")
        if topic not in NOTE_TOPICS:
            raise ToolError(f"topic must be one of {', '.join(NOTE_TOPICS)}")
        fact = str(args.get("message", "")).strip()[:1000]
        if not fact:
            raise ToolError("message is empty")
        ask = str(args.get("ask", "") or "").strip()[:500]
        by_when = str(args.get("by_when", "") or "").strip()[:80]
        urgent = args.get("urgent") is True
        if not LIMITS.allow(f"agent-note:{self.user_id}", 20, 3600):
            raise ToolError("Too many messages in the last hour.")
        when = deliver_at(urgent)
        self.cur.execute(
            "insert into notes (household_id, author, channel, fact, ask, by_when, urgent, deliver_at) values (%s, %s, %s, %s, %s, %s, %s, %s)",
            (household_id, role, topic, fact, ask, by_when, urgent, when),
        )
        self.log("send_message", f"wrote: {fact[:80]}")
        out = {"ok": True, "topic": topic}
        if when > datetime.now(timezone.utc) + timedelta(minutes=1):
            out["note"] = f"Quiet hours: the other parent sees it at {when.astimezone(LU):%H:%M} (Luxembourg time). Mark it urgent only if it cannot wait."
        return out


# Tool list for tools/list. Write tools say so, so the assistant asks before saving.
_ME_OTHER = {"type": "string", "enum": ["me", "other"]}
_READ = {"readOnlyHint": True, "openWorldHint": False}
_WRITE = {"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False}


def _tool(name, title, description, props=None, required=None, annotations=_WRITE):
    schema = {"type": "object", "properties": props or {}, "additionalProperties": False}
    if required:
        schema["required"] = required
    return {"name": name, "title": title, "description": description, "inputSchema": schema,
            "annotations": {"title": title, **annotations}}


AGENT_TOOLS = [
    _tool("get_started", "Where am I in CoParents",
          "Start here. Shows whether this parent has a shared plan, whether the other parent joined, whether the family details are filled in "
          "and confirmed, and what to do next. Call it at the start of every conversation about CoParents, and after each onboarding step.",
          annotations=_READ),
    _tool("join_waitlist", "Join the beta waitlist",
          "During the private beta only invited parents can create a new plan. Adds this parent's email to the waitlist. "
          "Ask the parent for consent to be emailed about the beta first. Joining the other parent's plan with a code never needs this.",
          {"consent": {"type": "boolean", "description": "The parent agreed to be contacted about the beta."},
           "first_name": {"type": "string"},
           "language": {"type": "string", "enum": ["en", "fr", "de", "lb"]},
           "children": {"type": "integer", "minimum": 0, "maximum": 12},
           "care": {"type": "string", "enum": ["alternating", "mostly-me", "mostly-other", "other"]},
           "other_parent": {"type": "string", "enum": ["yes", "no", "unsure"], "description": "Will the other parent use the app too?"}},
          ["consent"]),
    _tool("create_plan", "Create the shared plan",
          "Creates a new shared plan with this parent as the first parent and returns the 6-character code the other parent joins with. "
          "Only for invited parents during the beta. Do not use if the other parent already has a plan: join it instead."),
    _tool("join_plan", "Join the other parent's plan",
          "Joins the shared plan the other parent created, with the 6-character code they shared.",
          {"code": {"type": "string", "description": "6 characters, like K7M2QX"}}, ["code"]),
    _tool("get_invite", "Get the invite for the other parent",
          "The code, link and a ready-to-send message (with a WhatsApp link) inviting the other parent to join the plan.",
          {"language": {"type": "string", "enum": ["en", "fr", "de"], "description": "Language of the message. Default fr."}},
          annotations=_READ),
    _tool("get_family_details", "Show the family details",
          "The family details both parents share: names, children, crèche or school, activities, custody rhythm and handover, and who confirmed them.",
          annotations=_READ),
    _tool("save_family_details", "Save the family details",
          "Saves the family details, the same as the app's four setup screens. Only send the sections you have answers for; a section you send replaces "
          "that section (send the whole children list, not just one child). To finish, the parent's own first name and one child's name are needed. "
          "When a custody rhythm is set, empty calendar days for the next weeks are filled from it (planned days and locked months are left alone). "
          "If the other parent already finished the details and this changes them, they are asked to confirm again. "
          "Health notes are sensitive: only record one if the parent offers it.",
          {"my_first_name": {"type": "string"},
           "other_parent_first_name": {"type": "string"},
           "children": {"type": "array", "maxItems": 12, "items": {"type": "object", "additionalProperties": False, "required": ["name"], "properties": {
               "name": {"type": "string"},
               "birth_year": {"type": "string", "description": "Like 2019"},
               "care": {"type": "string", "enum": CARE_TYPES, "description": "Where the child goes during the day"},
               "place": {"type": "string", "description": "Name of the crèche, maison relais or school"},
               "group": {"type": "string", "description": "Class or group"},
               "health_note": {"type": "string", "description": "Optional: allergies, medication or needs the other parent should know"}}}},
           "activities": {"type": "array", "maxItems": 30, "items": {"type": "object", "additionalProperties": False, "required": ["name", "day"], "properties": {
               "name": {"type": "string"},
               "child": {"type": "string", "description": "The child's name, or all"},
               "day": {"type": "string", "enum": WEEKDAYS},
               "time": {"type": "string", "description": "HH:MM"},
               "who": {**_ME_OTHER, "description": "Which parent usually takes them. Leave out if either."}}}},
           "custody": {"type": "object", "additionalProperties": False, "properties": {
               "rhythm": {"type": "string", "enum": ["weeks", "2-2-3", "weekend-mid", "mostly-me", "mostly-other", "undecided"],
                          "description": "weeks: one week each. 2-2-3: two days, two days, three days. weekend-mid: one parent has weekdays, "
                                         "the other Wednesdays and every other weekend. mostly-me / mostly-other: mainly with one parent, every other weekend with the other."},
               "handover_day": {"type": "string", "enum": WEEKDAYS},
               "handover_time": {"type": "string", "description": "HH:MM"},
               "handover_place": {"type": "string"},
               "court_ruling": {"type": "string", "enum": RULINGS, "description": "Is there a court decision about custody?"}}},
           "finished": {"type": "boolean", "description": "Default true. false keeps a draft while answers are still being collected."},
           "fill_calendar_weeks": {"type": "integer", "minimum": 0, "maximum": 26, "description": "Weeks of calendar to fill from the rhythm. Default 12, 0 for none."}}),
    _tool("confirm_family_details", "Confirm the family details",
          "This parent confirms the family details the other parent filled in. Show them with get_family_details and get a clear yes first."),
    _tool("get_calendar", "Show the calendar",
          "Who has the children on each day, school and medical events, and which months are locked.",
          {"from_date": {"type": "string", "description": "YYYY-MM-DD, default today"},
           "days": {"type": "integer", "minimum": 1, "maximum": 92, "description": "Default 14"}},
          annotations=_READ),
    _tool("set_custody_days", "Set who has the children",
          "Sets who has the children on given days. Locked months cannot change. Changing days the other parent planned can upset them: "
          "say which days change and confirm with the parent first.",
          {"days": {"type": "array", "minItems": 1, "maxItems": 92, "items": {"type": "object", "additionalProperties": False, "required": ["date", "with"], "properties": {
              "date": {"type": "string", "description": "YYYY-MM-DD"},
              "with": {"type": "string", "enum": ["me", "other", "both"]}}}}},
          ["days"]),
    _tool("add_calendar_event", "Add a calendar event",
          "Adds a school event, medical appointment, handover or other event to the shared calendar.",
          {"title": {"type": "string"}, "date": {"type": "string", "description": "YYYY-MM-DD"},
           "type": {"type": "string", "enum": EVENT_TYPES}},
          ["title", "date"]),
    _tool("list_expenses", "List expenses",
          "Shared costs for the children, newest first, with the current balance between the parents.",
          {"month": {"type": "string", "description": "YYYY-MM"}, "only_unsettled": {"type": "boolean"}},
          annotations=_READ),
    _tool("get_balance", "Show the balance",
          "Who owes whom for costs not yet settled, and this month's spending per category against the agreed budget.",
          annotations=_READ),
    _tool("add_expense", "Add an expense",
          "Records a cost for the children. Example: 'I paid €42 for school shoes, split 50/50' is description 'School shoes', amount 42, "
          "category clothes, paid_by me, split half. Repeat what you will save in one line and get a yes before calling.",
          {"description": {"type": "string"},
           "amount": {"type": "number", "exclusiveMinimum": 0, "description": "Euros"},
           "date": {"type": "string", "description": "YYYY-MM-DD, default today"},
           "category": {"type": "string", "enum": EXPENSE_CATEGORIES},
           "paid_by": {"type": "string", "enum": ["me", "other", "shared_account"], "description": "Default me"},
           "split": {"type": "string", "enum": ["half", "me", "other"], "description": "Who carries the cost: half each (default), all me, or all the other parent"}},
          ["description", "amount", "category"]),
    _tool("mark_expenses_settled", "Mark expenses settled",
          "Marks costs as paid back, so they leave the balance. Use ids from list_expenses and confirm with the parent first.",
          {"expense_ids": {"type": "array", "minItems": 1, "maxItems": 100, "items": {"type": ["integer", "string"]}}},
          ["expense_ids"]),
    _tool("list_messages", "Read messages",
          "Messages between the parents, oldest first. Topics: handover, school, money, health.",
          {"topic": {"type": "string", "enum": NOTE_TOPICS}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}},
          annotations=_READ),
    _tool("send_message", "Send a message to the other parent",
          "Sends a short, factual message to the other parent in the app. Messages cannot be edited or deleted, so show the parent the exact text "
          "and get a yes first. Keep it calm and factual: one fact, and optionally one clear ask with a time. Outside 7:00 to 21:00 it waits for "
          "the morning unless urgent.",
          {"topic": {"type": "string", "enum": NOTE_TOPICS},
           "message": {"type": "string", "description": "The fact, in the parent's words"},
           "ask": {"type": "string", "description": "Optional: what you ask of the other parent"},
           "by_when": {"type": "string", "description": "Optional: by when, like 'Friday 18:00'"},
           "urgent": {"type": "boolean", "description": "Only for things that cannot wait for the morning"}},
          ["topic", "message"]),
]
AGENT_TOOL_NAMES = {tool["name"] for tool in AGENT_TOOLS}

MCP_INSTRUCTIONS = (
    "CoParents helps separated parents share one plan for their children: calendar, costs, messages and family details. "
    "You act for one parent, on their side of the plan only. Call get_started first: it says whether the parent still needs "
    "to create or join a plan and fill in the family details, and suggests the next step. Guide onboarding as a short, friendly "
    "conversation, one question at a time, in the parent's language (many use French, German or Luxembourgish). "
    "Before any tool that saves something, say in one line what you will save and get a yes. Stay neutral about the other parent."
)


def _html_escape(value) -> str:
    return (str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


OAUTH_COPY = {
    "en": {
        "title": "Connect an assistant", "signin": "Sign in to CoParents",
        "signin_lead": "Enter the email you use for CoParents. We send you a 6-digit code.",
        "email": "Email", "send": "Send code", "code": "Code from the email", "check": "Check your email",
        "code_lead": "We sent a 6-digit code to {email}. It expires in 15 minutes.", "continue": "Continue",
        "allow_title": "Allow {client} to use your CoParents plan?",
        "allow_lead": "Signed in as {email}.",
        "can": "It will be able to:",
        "can1": "read your shared plan: calendar, costs, messages and family details",
        "can2": "add costs and calendar events, change custody days, send messages and fill in the family details, as you",
        "can3": "help you create or join a plan",
        "cannot": "It cannot delete anything or change locked months. Every change it makes shows in the activity feed as made through the assistant. "
                  "It stays connected until you sign out of it in the assistant or delete your account.",
        "noplan": "You have no shared plan yet. The assistant can help you set one up.",
        "redirect": "After you allow, you go back to {host}.",
        "allow": "Allow", "deny": "Cancel", "bad": "This link is not valid", "bad_lead": "Start connecting again from your assistant.",
        "wrong_code": "That code is not right or has expired.", "bad_email": "Enter a valid email address.",
        "slow": "Too many attempts. Wait a few minutes and try again.", "unnamed": "An assistant",
    },
    "fr": {
        "title": "Connecter un assistant", "signin": "Se connecter à CoParents",
        "signin_lead": "Entrez l’adresse e-mail que vous utilisez pour CoParents. Nous vous envoyons un code à 6 chiffres.",
        "email": "E-mail", "send": "Envoyer le code", "code": "Code reçu par e-mail", "check": "Regardez vos e-mails",
        "code_lead": "Nous avons envoyé un code à 6 chiffres à {email}. Il expire dans 15 minutes.", "continue": "Continuer",
        "allow_title": "Autoriser {client} à utiliser votre planning CoParents ?",
        "allow_lead": "Connecté·e avec {email}.",
        "can": "Il pourra :",
        "can1": "lire votre planning partagé : calendrier, frais, messages et infos de la famille",
        "can2": "ajouter des frais et des événements, changer des jours de garde, envoyer des messages et remplir les infos de la famille, en votre nom",
        "can3": "vous aider à créer ou rejoindre un planning",
        "cannot": "Il ne peut rien supprimer ni modifier un mois verrouillé. Chaque changement apparaît dans l’activité comme fait via l’assistant. "
                  "Il reste connecté jusqu’à ce que vous le déconnectiez dans l’assistant ou supprimiez votre compte.",
        "noplan": "Vous n’avez pas encore de planning partagé. L’assistant peut vous aider à le créer.",
        "redirect": "Après autorisation, vous revenez sur {host}.",
        "allow": "Autoriser", "deny": "Annuler", "bad": "Ce lien n’est pas valable", "bad_lead": "Recommencez la connexion depuis votre assistant.",
        "wrong_code": "Ce code n’est pas bon ou a expiré.", "bad_email": "Entrez une adresse e-mail valable.",
        "slow": "Trop d’essais. Attendez quelques minutes et réessayez.", "unnamed": "Un assistant",
    },
    "de": {
        "title": "Assistenten verbinden", "signin": "Bei CoParents anmelden",
        "signin_lead": "Gib die E-Mail-Adresse ein, die du für CoParents nutzt. Wir schicken dir einen 6-stelligen Code.",
        "email": "E-Mail", "send": "Code senden", "code": "Code aus der E-Mail", "check": "Schau in deine E-Mails",
        "code_lead": "Wir haben einen 6-stelligen Code an {email} geschickt. Er läuft in 15 Minuten ab.", "continue": "Weiter",
        "allow_title": "{client} Zugriff auf deinen CoParents-Plan erlauben?",
        "allow_lead": "Angemeldet als {email}.",
        "can": "Der Assistent kann:",
        "can1": "deinen gemeinsamen Plan lesen: Kalender, Kosten, Nachrichten und Familienangaben",
        "can2": "Kosten und Termine eintragen, Betreuungstage ändern, Nachrichten senden und die Familienangaben ausfüllen, in deinem Namen",
        "can3": "dir helfen, einen Plan zu erstellen oder beizutreten",
        "cannot": "Er kann nichts löschen und keine gesperrten Monate ändern. Jede Änderung erscheint im Verlauf als über den Assistenten gemacht. "
                  "Er bleibt verbunden, bis du ihn im Assistenten trennst oder dein Konto löschst.",
        "noplan": "Du hast noch keinen gemeinsamen Plan. Der Assistent kann dir helfen, einen anzulegen.",
        "redirect": "Danach geht es zurück zu {host}.",
        "allow": "Erlauben", "deny": "Abbrechen", "bad": "Dieser Link ist ungültig", "bad_lead": "Starte die Verbindung im Assistenten neu.",
        "wrong_code": "Dieser Code stimmt nicht oder ist abgelaufen.", "bad_email": "Gib eine gültige E-Mail-Adresse ein.",
        "slow": "Zu viele Versuche. Warte ein paar Minuten.", "unnamed": "Ein Assistent",
    },
}

OAUTH_PARAMS = ("response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource")


class AgentRoutes:
    """OAuth and MCP routes, mixed into Handler."""

    # Plumbing

    def _send_raw(self, status, body: bytes, content_type, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _query(self):
        raw = self.path.split("?", 1)[1] if "?" in self.path else ""
        return {k: v[0] for k, v in parse_qs(raw, keep_blank_values=True).items()}

    def _form(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > 100_000:
            raise ValueError("body too large")
        raw = self.rfile.read(length).decode() if length else ""
        if self.headers.get("Content-Type", "").startswith("application/json"):
            body = json.loads(raw or "{}")
            return {k: str(v) for k, v in body.items()} if isinstance(body, dict) else {}
        return {k: v[0] for k, v in parse_qs(raw, keep_blank_values=True).items()}

    def _lang(self):
        accept = self.headers.get("Accept-Language", "").lower()
        for part in accept.split(","):
            code = part.strip()[:2]
            if code in OAUTH_COPY:
                return code
            if code == "lb":
                return "de"
        return "en"

    def _page(self, status, title, inner, headers=None):
        body = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_html_escape(title)} · CoParents</title><link rel="icon" href="/assets/favicon.svg">
<style>
:root{{--bg:#f6f4f0;--card:#fff;--ink:#22303c;--muted:#5d6b78;--accent:#e8875b;--line:#e3ded6}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151b21;--card:#1f2830;--ink:#eef1f4;--muted:#a7b3bf;--line:#33404c}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:440px;margin:40px auto;padding:0 16px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}}
h1{{font-size:1.3rem;line-height:1.3;margin:0 0 8px}} p,li{{color:var(--muted)}} ul{{padding-left:20px}}
label{{display:block;font-weight:600;margin:16px 0 6px}}
input{{box-sizing:border-box;width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--bg);color:var(--ink)}}
.row{{display:flex;gap:10px;margin-top:20px}}
button{{flex:1;padding:12px;border-radius:10px;border:1px solid var(--line);font:inherit;font-weight:600;cursor:pointer;background:var(--card);color:var(--ink)}}
button.primary{{background:var(--accent);border-color:var(--accent);color:#1b1b1b}}
.err{{color:#c0392b}} .brand{{font-weight:700;margin-bottom:12px;display:block;color:var(--ink);text-decoration:none}}
</style></head><body><main><a class="brand" href="/">CoParents</a><div class="card">{inner}</div></main></body></html>"""
        self._send_raw(status, body.encode(), "text/html; charset=utf-8", {
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'",
            # same-origin, not no-referrer: with no-referrer browsers send "Origin: null" on the form posts.
            "Referrer-Policy": "same-origin",
            **(headers or {}),
        })

    def _hidden(self, params):
        return "".join(f'<input type="hidden" name="{k}" value="{_html_escape(params.get(k, ""))}">' for k in OAUTH_PARAMS if params.get(k))

    def _bad_request_page(self):
        c = OAUTH_COPY[self._lang()]
        self._page(400, c["bad"], f"<h1>{c['bad']}</h1><p>{c['bad_lead']}</p>")

    def _check_request(self, cur, params):
        """The authorization request, checked. Returns (client_name, redirect_uri, error) or None when nothing can be trusted."""
        cur.execute("select name, redirect_uris from oauth_clients where client_id = %s", (params.get("client_id", ""),))
        row = cur.fetchone()
        if row is None:
            return None
        name, uris = row
        uris = _unpack(uris) or []
        redirect = params.get("redirect_uri") or (uris[0] if len(uris) == 1 else "")
        if redirect not in uris:
            return None
        params["redirect_uri"] = redirect
        error = ""
        if params.get("response_type") != "code":
            error = "unsupported_response_type"
        elif params.get("code_challenge_method") != "S256" or not CHALLENGE_RE.match(params.get("code_challenge", "")):
            error = "invalid_request"
        elif params.get("resource") and params["resource"].rstrip("/") not in (mcp_url(), APP_URL):
            error = "invalid_target"
        return name, redirect, error

    def _consent_token(self):
        session = self._session_token() or ""
        return token_hash("consent:" + session)[:32]

    # Metadata

    def _oauth_meta(self, path):
        if path in ("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp", "/api/oauth/protected-resource"):
            self._send(200, protected_resource_meta())
            return True
        if path in ("/.well-known/oauth-authorization-server", "/api/oauth/metadata", "/api/.well-known/oauth-authorization-server",
                    "/.well-known/oauth-authorization-server/api"):
            self._send(200, auth_server_meta())
            return True
        return False

    # Registration (RFC 7591), for public clients

    def _oauth_register(self):
        if not LIMITS.allow(f"register-ip:{self._client_ip()}", 20, 3600):
            self._send(429, {"error": "slow_down"})
            return
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {"error": "invalid_client_metadata"})
            return
        uris = body.get("redirect_uris") if isinstance(body, dict) else None
        if not isinstance(uris, list) or not 1 <= len(uris) <= 10 or not all(redirect_ok(u) for u in uris):
            self._send(400, {"error": "invalid_redirect_uri", "error_description": "redirect_uris must be https, localhost or an app scheme"})
            return
        grants = body.get("grant_types") or ["authorization_code"]
        if not isinstance(grants, list) or "authorization_code" not in grants:
            self._send(400, {"error": "invalid_client_metadata", "error_description": "authorization_code is required"})
            return
        name = " ".join(str(body.get("client_name", "")).split())[:80]
        client_id = "cp_" + secrets.token_urlsafe(18)
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                "insert into oauth_clients (client_id, name, redirect_uris) values (%s, %s, %s)",
                (client_id, name, psycopg2.extras.Json(uris)),
            )
        self._send(201, {
            "client_id": client_id, "client_id_issued_at": int(time.time()), "client_name": name,
            "redirect_uris": uris, "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"], "token_endpoint_auth_method": "none", "scope": AGENT_SCOPE,
        })

    # The pages a parent sees

    def _oauth_authorize_page(self, params=None, note=""):
        params = params if params is not None else {k: v for k, v in self._query().items() if k in OAUTH_PARAMS}
        c = OAUTH_COPY[self._lang()]
        with db() as conn, conn.cursor() as cur:
            checked = self._check_request(cur, params)
            if checked is None:
                self._bad_request_page()
                return
            client_name, redirect, error = checked
            if error:
                self._redirect(with_query(redirect, {"error": error, "state": params.get("state"), "iss": APP_URL}))
                return
            user = self._user(cur)
            member = member_from_user(cur, user[0]) if user else None
        err = f'<p class="err">{_html_escape(note)}</p>' if note else ""
        if user is None:
            self._page(200, c["signin"], f"""<h1>{c['signin']}</h1><p>{c['signin_lead']}</p>{err}
<form method="post" action="/api/oauth/email">{self._hidden(params)}
<label for="email">{c['email']}</label><input id="email" name="email" type="email" autocomplete="email" required autofocus>
<div class="row"><button class="primary" type="submit">{c['send']}</button></div></form>""")
            return
        who = _html_escape(client_name) if client_name else c["unnamed"]
        host = _html_escape(urlsplit(redirect).hostname or urlsplit(redirect).scheme)
        plan = "" if member else f"<p>{c['noplan']}</p>"
        self._page(200, c["title"], f"""<h1>{c['allow_title'].format(client=who)}</h1>
<p>{c['allow_lead'].format(email=_html_escape(user[1]))}</p>{plan}
<p>{c['can']}</p><ul><li>{c['can1']}</li><li>{c['can2']}</li><li>{c['can3']}</li></ul>
<p>{c['cannot']}</p><p>{c['redirect'].format(host=host)}</p>
<form method="post" action="/api/oauth/authorize">{self._hidden(params)}
<input type="hidden" name="csrf" value="{self._consent_token()}">
<div class="row"><button type="submit" name="decision" value="deny">{c['deny']}</button>
<button class="primary" type="submit" name="decision" value="allow">{c['allow']}</button></div></form>""")

    def _redirect(self, location, cookie=None):
        headers = {"Location": location}
        if cookie:
            headers["Set-Cookie"] = cookie
        self._send_raw(303, b"", "text/plain", headers)

    def _oauth_email(self):
        c = OAUTH_COPY[self._lang()]
        try:
            form = self._form()
        except ValueError:
            self._bad_request_page()
            return
        params = {k: form[k] for k in OAUTH_PARAMS if form.get(k)}
        email = form.get("email", "").strip().lower()
        if len(email) > 254 or not EMAIL_RE.match(email):
            self._oauth_authorize_page(params, c["bad_email"])
            return
        if not LIMITS.allow(f"mail:{email}", 3, 900) or not LIMITS.allow(f"mail-ip:{self._client_ip()}", 10, 3600):
            self._oauth_authorize_page(params, c["slow"])
            return
        with db() as conn, conn.cursor() as cur:
            if self._check_request(cur, dict(params)) is None:
                self._bad_request_page()
                return
            pending = secrets.token_urlsafe(24)
            code = f"{secrets.randbelow(1_000_000):06d}"
            cur.execute(
                "insert into login_tokens (token_hash, email, expires_at) values (%s, %s, %s)",
                (token_hash(f"oauth:{pending}:{code}"), email, datetime.now(timezone.utc) + LOGIN_TTL),
            )
        try:
            send_login_code(email, code)
        except Exception as exc:
            print(f"sign-in code email failed: {exc!r}", flush=True)
            self._oauth_authorize_page(params, c["slow"])
            return
        self._code_page(params, email, pending)

    def _code_page(self, params, email, pending, note=""):
        c = OAUTH_COPY[self._lang()]
        err = f'<p class="err">{_html_escape(note)}</p>' if note else ""
        self._page(200, c["check"], f"""<h1>{c['check']}</h1><p>{c['code_lead'].format(email=_html_escape(email))}</p>{err}
<form method="post" action="/api/oauth/code">{self._hidden(params)}
<input type="hidden" name="pending" value="{_html_escape(pending)}"><input type="hidden" name="email" value="{_html_escape(email)}">
<label for="code">{c['code']}</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" required autofocus>
<div class="row"><button class="primary" type="submit">{c['continue']}</button></div></form>""")

    def _oauth_code(self):
        c = OAUTH_COPY[self._lang()]
        try:
            form = self._form()
        except ValueError:
            self._bad_request_page()
            return
        params = {k: form[k] for k in OAUTH_PARAMS if form.get(k)}
        pending = form.get("pending", "")
        email = form.get("email", "").strip().lower()
        code = form.get("code", "").replace(" ", "")
        if not pending or not LIMITS.allow(f"code:{pending}", 5, 900) or not LIMITS.allow(f"verify-ip:{self._client_ip()}", 20, 600):
            self._code_page(params, email, pending, c["slow"])
            return
        session = secrets.token_urlsafe(32)
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                """
                update login_tokens set used_at = now()
                where token_hash = %s and used_at is null and expires_at > now()
                returning email
                """,
                (token_hash(f"oauth:{pending}:{code}"),),
            )
            row = cur.fetchone()
            if row is None:
                conn.rollback()
                self._code_page(params, email, pending, c["wrong_code"])
                return
            cur.execute(
                "insert into users (email) values (%s) on conflict (email) do update set email = excluded.email returning id",
                (row[0],),
            )
            user_id = cur.fetchone()[0]
            cur.execute(
                "insert into sessions (token_hash, user_id, expires_at) values (%s, %s, %s)",
                (token_hash(session), user_id, datetime.now(timezone.utc) + SESSION_TTL),
            )
        self._redirect("/api/oauth/authorize?" + urlencode(params), cookie=self._cookie(session, int(SESSION_TTL.total_seconds())))

    def _oauth_decide(self):
        try:
            form = self._form()
        except ValueError:
            self._bad_request_page()
            return
        params = {k: form[k] for k in OAUTH_PARAMS if form.get(k)}
        with db() as conn, conn.cursor() as cur:
            checked = self._check_request(cur, params)
            user = self._user(cur)
            if checked is None or checked[2] or user is None or not secrets.compare_digest(form.get("csrf", ""), self._consent_token()):
                self._bad_request_page()
                return
            _, redirect, _ = checked
            if form.get("decision") != "allow":
                self._redirect(with_query(redirect, {"error": "access_denied", "state": params.get("state"), "iss": APP_URL}))
                return
            code = secrets.token_urlsafe(32)
            cur.execute("delete from oauth_codes where expires_at < now() - interval '1 day'")
            cur.execute(
                """
                insert into oauth_codes (code_hash, client_id, user_id, redirect_uri, challenge, scope, expires_at)
                values (%s, %s, %s, %s, %s, %s, %s)
                """,
                (token_hash(code), params["client_id"], user[0], redirect, params["code_challenge"], AGENT_SCOPE,
                 datetime.now(timezone.utc) + OAUTH_CODE_TTL),
            )
        self._redirect(with_query(redirect, {"code": code, "state": params.get("state"), "iss": APP_URL}))

    # Tokens

    def _issue_tokens(self, cur, client_id, user_id):
        access = "cpa_" + secrets.token_urlsafe(32)
        refresh = "cpr_" + secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        cur.execute("delete from oauth_tokens where expires_at < now()")
        cur.execute(
            "insert into oauth_tokens (token_hash, kind, client_id, user_id, scope, expires_at) values (%s, 'access', %s, %s, %s, %s), (%s, 'refresh', %s, %s, %s, %s)",
            (token_hash(access), client_id, user_id, AGENT_SCOPE, now + ACCESS_TTL,
             token_hash(refresh), client_id, user_id, AGENT_SCOPE, now + REFRESH_TTL),
        )
        return {"access_token": access, "token_type": "Bearer", "expires_in": int(ACCESS_TTL.total_seconds()),
                "refresh_token": refresh, "scope": AGENT_SCOPE}

    def _oauth_token(self):
        try:
            form = self._form()
        except ValueError:
            self._send(400, {"error": "invalid_request"})
            return
        if not LIMITS.allow(f"token-ip:{self._client_ip()}", 60, 600):
            self._send(429, {"error": "slow_down"})
            return
        grant = form.get("grant_type")
        client_id = form.get("client_id", "")
        with db() as conn, conn.cursor() as cur:
            if grant == "authorization_code":
                cur.execute(
                    """
                    update oauth_codes set used_at = now()
                    where code_hash = %s and used_at is null and expires_at > now()
                    returning client_id, user_id, redirect_uri, challenge
                    """,
                    (token_hash(form.get("code", "")),),
                )
                row = cur.fetchone()
                if (row is None or row[0] != client_id or row[2] != form.get("redirect_uri", row[2])
                        or not pkce_ok(form.get("code_verifier", ""), row[3])):
                    self._send(400, {"error": "invalid_grant"})
                    return
                self._send(200, self._issue_tokens(cur, row[0], row[1]))
                return
            if grant == "refresh_token":
                cur.execute(
                    "delete from oauth_tokens where token_hash = %s and kind = 'refresh' and expires_at > now() returning client_id, user_id",
                    (token_hash(form.get("refresh_token", "")),),
                )
                row = cur.fetchone()
                if row is None or (client_id and row[0] != client_id):
                    conn.rollback()
                    self._send(400, {"error": "invalid_grant"})
                    return
                self._send(200, self._issue_tokens(cur, row[0], row[1]))
                return
        self._send(400, {"error": "unsupported_grant_type"})

    def _oauth_revoke(self):
        try:
            form = self._form()
        except ValueError:
            form = {}
        token = form.get("token", "")
        if token:
            with db() as conn, conn.cursor() as cur:
                cur.execute("delete from oauth_tokens where token_hash = %s", (token_hash(token),))
        self._send(200, {})

    # MCP

    def _mcp_unauthorized(self, invalid):
        challenge = f'Bearer resource_metadata="{APP_URL}/api/oauth/protected-resource", scope="{AGENT_SCOPE}"'
        if invalid:
            challenge += ', error="invalid_token"'
        body = json.dumps({"error": "sign in required"}).encode()
        self._send_raw(401, body, "application/json", {"WWW-Authenticate": challenge})

    def _mcp(self):
        token = self._bearer()
        row = None
        if token:
            with db() as conn, conn.cursor() as cur:
                cur.execute(
                    """
                    select t.user_id, u.email, c.name from oauth_tokens t
                    join users u on u.id = t.user_id
                    join oauth_clients c on c.client_id = t.client_id
                    where t.token_hash = %s and t.kind = 'access' and t.expires_at > now()
                    """,
                    (token_hash(token),),
                )
                row = cur.fetchone()
        if row is None:
            self._mcp_unauthorized(bool(token))
            return
        try:
            message = self._read_json()
        except ValueError:
            self._send(400, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}})
            return
        batch = isinstance(message, list)
        replies = [r for r in (self._mcp_one(m, row) for m in (message if batch else [message])) if r is not None]
        if not replies:
            self._send_raw(202, b"", "application/json")
            return
        self._send(200, replies if batch else replies[0])

    def _mcp_one(self, message, who):
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
            if isinstance(message, dict) and "method" not in message:
                return None  # a client's answer to something we never ask
            return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "invalid request"}}
        if "id" not in message:
            return None  # notifications need no answer
        msg_id = message["id"]
        method = message["method"]
        params = message.get("params") if isinstance(message.get("params"), dict) else {}
        ok = lambda result: {"jsonrpc": "2.0", "id": msg_id, "result": result}  # noqa: E731
        if method == "initialize":
            asked = params.get("protocolVersion")
            return ok({
                "protocolVersion": asked if asked in MCP_PROTOCOLS else MCP_PROTOCOLS[0],
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "coparents", "title": "CoParents", "version": "1.0.0", "websiteUrl": APP_URL},
                "instructions": MCP_INSTRUCTIONS,
            })
        if method == "ping":
            return ok({})
        if method == "tools/list":
            return ok({"tools": AGENT_TOOLS})
        if method == "tools/call":
            name = params.get("name")
            args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
            if name not in AGENT_TOOL_NAMES:
                return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32602, "message": f"unknown tool: {name}"}}
            return ok(self._run_tool(name, args, who))
        if method in ("resources/list", "prompts/list"):
            return ok({method.split("/")[0]: []})
        return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": f"method not found: {method}"}}

    def _run_tool(self, name, args, who):
        user_id, email, client_name = who
        if not LIMITS.allow(f"agent:{user_id}", 120, 600):
            return {"content": [{"type": "text", "text": "Too many requests. Wait a few minutes."}], "isError": True}
        try:
            with db() as conn, conn.cursor() as cur:
                session = AgentSession(cur, user_id, email, client_name, self._client_ip())
                try:
                    result = getattr(session, name)(args)
                    session.save()
                except ToolError:
                    conn.rollback()
                    raise
        except ToolError as exc:
            return {"content": [{"type": "text", "text": str(exc)}], "isError": True}
        except psycopg2.errors.UniqueViolation:
            return {"content": [{"type": "text", "text": "This parent already has a plan, or the plan already has two parents."}], "isError": True}
        except Exception as exc:
            print(f"tool {name} failed: {exc!r}", flush=True)
            return {"content": [{"type": "text", "text": "Something went wrong on the CoParents server. Nothing was saved."}], "isError": True}
        return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=1, default=str)}], "structuredContent": result}


class Handler(AgentRoutes, BaseHTTPRequestHandler):
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
        if self._oauth_meta(path):
            return
        if path == "/api/oauth/authorize":
            self._oauth_authorize_page()
            return
        if path == "/api/mcp":
            # No server-to-client stream: every answer comes back on the POST.
            self._send_raw(405, b"", "application/json", {"Allow": "POST"})
            return
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
        # Called by assistants' servers or apps, never with a cookie: no origin check.
        if path == "/api/mcp":
            self._mcp()
            return
        if path == "/api/oauth/register":
            self._oauth_register()
            return
        if path == "/api/oauth/token":
            self._oauth_token()
            return
        if path == "/api/oauth/revoke":
            self._oauth_revoke()
            return
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
        if path == "/api/oauth/email":
            self._oauth_email()
            return
        if path == "/api/oauth/code":
            self._oauth_code()
            return
        if path == "/api/oauth/authorize":
            self._oauth_decide()
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
            cur.execute(
                """
                select c.name, min(t.created_at), max(t.expires_at) from oauth_tokens t
                join oauth_clients c on c.client_id = t.client_id
                where t.user_id = %s and t.kind = 'refresh' group by c.client_id, c.name
                """,
                (user[0],),
            )
            payload["assistants"] = [
                {"name": name, "connected_since": since.astimezone(timezone.utc).isoformat(), "until": until.astimezone(timezone.utc).isoformat()}
                for name, since, until in cur.fetchall()
            ]
            cur.execute("select client_name, tool, summary, at from agent_log where user_id = %s order by at", (user[0],))
            payload["assistant_changes"] = [
                {"assistant": name, "tool": tool, "summary": summary, "at": at.astimezone(timezone.utc).isoformat()}
                for name, tool, summary, at in cur.fetchall()
            ]
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
            # Read what was sent first (nginx caps it at 1 MB), or the client gets a broken pipe instead of this answer.
            if length <= 2_000_000:
                self.rfile.read(length)
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
