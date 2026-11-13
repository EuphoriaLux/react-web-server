#!/usr/bin/env python3
"""CoParents API. Binds to localhost. Nginx proxies /api/ here.

Auth is a household token, not a user account. Parent A creates the plan,
parent B joins with the code. The plan is one JSON document.
"""
import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras

HOST = os.environ.get("COPARENTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("COPARENTS_PORT", "8787"))
DSN = os.environ["DATABASE_URL"]
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
LU = ZoneInfo("Europe/Luxembourg")


def db():
    return psycopg2.connect(DSN)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_code(cur) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        cur.execute("select 1 from households where code = %s", (code,))
        if cur.fetchone() is None:
            return code
    raise RuntimeError("could not allocate a household code")


def deliver_at(urgent: bool):
    now = datetime.now(LU)
    if urgent or now.hour < 21:
        return datetime.now(timezone.utc)
    morning = (now + timedelta(days=1)).replace(hour=7, minute=0, second=0, microsecond=0)
    return morning.astimezone(timezone.utc)


def member_from_token(cur, token: str):
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


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}")

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

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
        if path == "/api/state":
            self._get_state()
            return
        if path == "/api/notes":
            self._get_notes()
            return
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
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
        if self.path.split("?", 1)[0] == "/api/state":
            self._put_state()
            return
        self._send(404, {"error": "not found"})

    def _create(self):
        token = secrets.token_urlsafe(32)
        with db() as conn, conn.cursor() as cur:
            code = new_code(cur)
            cur.execute(
                "insert into households (code) values (%s) returning id",
                (code,),
            )
            household_id = cur.fetchone()[0]
            cur.execute(
                "insert into members (household_id, role, token_hash) values (%s, 'A', %s)",
                (household_id, token_hash(token)),
            )
            cur.execute(
                "insert into plans (household_id, state) values (%s, %s)",
                (household_id, psycopg2.extras.Json({})),
            )
        self._send(201, {"code": code, "token": token, "role": "A"})

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
        token = secrets.token_urlsafe(32)
        with db() as conn, conn.cursor() as cur:
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
                "insert into members (household_id, role, token_hash) values (%s, 'B', %s)",
                (household_id, token_hash(token)),
            )
        self._send(200, {"code": code, "token": token, "role": "B"})

    def _get_state(self):
        token = self._bearer()
        if not token:
            self._send(401, {"error": "missing token"})
            return
        with db() as conn, conn.cursor() as cur:
            member = member_from_token(cur, token)
            if member is None:
                self._send(401, {"error": "unknown token"})
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
        token = self._bearer()
        if not token:
            self._send(401, {"error": "missing token"})
            return
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
            member = member_from_token(cur, token)
            if member is None:
                self._send(401, {"error": "unknown token"})
                return
            _, household_id, code = member
            now = datetime.now(timezone.utc)
            cur.execute(
                "update plans set state = %s, updated_at = %s where household_id = %s",
                (psycopg2.extras.Json(state), now, household_id),
            )
        self._send(200, {"code": code, "updated_at": now.isoformat()})

    def _get_notes(self):
        token = self._bearer()
        if not token:
            self._send(401, {"error": "missing token"})
            return
        channel = ""
        if "?" in self.path:
            for part in self.path.split("?", 1)[1].split("&"):
                if part.startswith("channel="):
                    channel = unquote(part.split("=", 1)[1])
        with db() as conn, conn.cursor() as cur:
            member = member_from_token(cur, token)
            if member is None:
                self._send(401, {"error": "unknown token"})
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
        token = self._bearer()
        if not token:
            self._send(401, {"error": "missing token"})
            return
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
            member = member_from_token(cur, token)
            if member is None:
                self._send(401, {"error": "unknown token"})
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
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"coparents api on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
