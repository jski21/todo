"""Supabase session for the device.

Authenticates as a normal user via a stored refresh token, so RLS applies
naturally. Persists the rotated refresh token after each refresh — Supabase
rotates it every time, and forgetting to write the new one back will lock
the device out on the next restart.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Optional

from supabase import Client, create_client  # type: ignore

log = logging.getLogger(__name__)


class DeviceSession:
    """Wraps a supabase-py Client whose auth state is driven by a refresh
    token persisted on disk. Call ``ensure_authenticated()`` before each
    DB op; it refreshes when the access token is near expiry and re-persists.
    """

    # Refresh access token when it has less than this much life left.
    _REFRESH_MARGIN_S = 60

    def __init__(self, url: str, anon_key: str, refresh_token_path: Path):
        self._refresh_token_path = refresh_token_path
        self._client: Client = create_client(url, anon_key)
        self._lock = threading.Lock()
        self._access_token_exp: float = 0.0
        self._refresh_token: Optional[str] = self._read_refresh_token()

    # ---- public ------------------------------------------------------

    @property
    def client(self) -> Client:
        return self._client

    def ensure_authenticated(self) -> None:
        with self._lock:
            now = time.time()
            if self._access_token_exp - now > self._REFRESH_MARGIN_S:
                return
            self._refresh_locked()

    def get_user_id(self) -> Optional[str]:
        user = self._client.auth.get_user()
        return getattr(getattr(user, "user", None), "id", None) if user else None

    # ---- internals --------------------------------------------------

    def _read_refresh_token(self) -> Optional[str]:
        if not self._refresh_token_path.exists():
            return None
        token = self._refresh_token_path.read_text().strip()
        return token or None

    def _persist_refresh_token(self, token: str) -> None:
        self._refresh_token_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._refresh_token_path.with_suffix(self._refresh_token_path.suffix + ".tmp")
        tmp.write_text(token)
        os.chmod(tmp, 0o600)
        os.replace(tmp, self._refresh_token_path)

    def _refresh_locked(self) -> None:
        token = self._refresh_token or self._read_refresh_token()
        if not token:
            raise RuntimeError(
                f"no refresh token at {self._refresh_token_path}; "
                "see pi-clients/README.md for pairing instructions"
            )
        # supabase-py 2.x exposes refresh_session(refresh_token=...) on auth.
        resp = self._client.auth.refresh_session(refresh_token=token)  # type: ignore[arg-type]
        session = getattr(resp, "session", None) or resp
        access_token = getattr(session, "access_token", None)
        new_refresh_token = getattr(session, "refresh_token", None) or token
        expires_at = getattr(session, "expires_at", None)
        if not access_token:
            raise RuntimeError("refresh_session returned no access_token")
        # Persist the (possibly rotated) refresh token.
        if new_refresh_token != token:
            self._persist_refresh_token(new_refresh_token)
            log.info("rotated refresh token persisted")
        self._refresh_token = new_refresh_token
        # If the SDK didn't already set the session, do it so PostgREST + realtime
        # see the new JWT.
        try:
            self._client.auth.set_session(access_token, new_refresh_token)
        except Exception:  # noqa: BLE001 — best-effort; SDK API drifts
            log.debug("set_session not supported; relying on SDK-internal state")
        self._access_token_exp = float(expires_at) if expires_at else time.time() + 3500
        log.info("authenticated; access token valid for ~%ds", int(self._access_token_exp - time.time()))

    # ---- edge function call -----------------------------------------

    def invoke_edge(self, name: str, body: dict) -> dict:
        """Call an edge function; returns the parsed JSON body."""
        self.ensure_authenticated()
        # Use functions.invoke if available; fall back to direct HTTP for robustness.
        try:
            res = self._client.functions.invoke(name, invoke_options={"body": body})
            # supabase-py returns the raw response object in some versions, parsed in others.
            if isinstance(res, (bytes, bytearray)):
                import json as _json

                return _json.loads(res)
            if isinstance(res, dict):
                return res
            data = getattr(res, "data", None)
            if data is not None:
                if isinstance(data, (bytes, bytearray)):
                    import json as _json

                    return _json.loads(data)
                if isinstance(data, dict):
                    return data
        except Exception:  # noqa: BLE001 — fall back to raw HTTP
            log.debug("functions.invoke failed; using direct HTTP", exc_info=True)
        return self._invoke_via_http(name, body)

    def _invoke_via_http(self, name: str, body: dict) -> dict:
        import json as _json
        import urllib.request

        url = f"{self._client.supabase_url.rstrip('/')}/functions/v1/{name}"
        access_token = self._current_access_token()
        req = urllib.request.Request(
            url,
            data=_json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {access_token}",
                # Edge functions also accept apikey; some setups require it.
                "apikey": self._client.supabase_key,
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return _json.loads(resp.read().decode("utf-8"))

    def _current_access_token(self) -> str:
        session = self._client.auth.get_session()
        token = getattr(session, "access_token", None) if session else None
        if not token:
            self.ensure_authenticated()
            session = self._client.auth.get_session()
            token = getattr(session, "access_token", None) if session else None
        if not token:
            raise RuntimeError("no access token after auth")
        return token
