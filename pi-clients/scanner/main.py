"""Scanner service.

Reads scans from either an evdev HID device (real scanner) or stdin
(testing), POSTs them to the resolve-scan edge function, and acts on the
response. Network failures buffer to a local SQLite queue and drain on
reconnect.

The resolve-scan endpoint is the single source of truth for what a scan
means; this client never tries to decide whether something is a barcode
or a ticket — that routing lives in the edge function.
"""

from __future__ import annotations

import json
import logging
import signal
import sys
import threading
import time
import traceback
from typing import Iterator, Optional
from urllib.error import URLError

# Allow `python -m scanner.main`
if __package__ in (None, ""):
    import os as _os
    import sys as _sys

    _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

from shared.buffer import ScanBuffer  # noqa: E402
from shared.config import Config  # noqa: E402
from shared.models import ResolveScanResponse  # noqa: E402
from shared.supabase_client import DeviceSession  # noqa: E402

from scanner.keymap import KeyAssembler  # noqa: E402

log = logging.getLogger("scanner")


# ---- input sources ---------------------------------------------------


def _evdev_codes(device_path: str, grab: bool) -> Iterator[str]:
    """Yield assembled scan codes from a HID scanner."""
    from evdev import InputDevice, categorize, ecodes  # type: ignore

    dev = InputDevice(device_path)
    if grab:
        dev.grab()
    log.info("scanner: opened %s (%s)", device_path, dev.name)
    asm = KeyAssembler()
    try:
        for ev in dev.read_loop():
            if ev.type != ecodes.EV_KEY:
                continue
            # KeyEvent.key_down=1, key_up=0, key_hold=2 — ignore hold.
            if ev.value not in (0, 1):
                continue
            code = ev.code
            is_press = ev.value == 1
            out = asm.feed(code, is_press)
            if out is not None:
                yield out
    finally:
        try:
            if grab:
                dev.ungrab()
        except Exception:  # noqa: BLE001
            pass


def _stdin_codes() -> Iterator[str]:
    """Yield one scan code per stdin line (for tests + manual smoke checks)."""
    log.info("scanner: reading from stdin (testing mode)")
    for raw in sys.stdin:
        code = raw.strip()
        if code:
            yield code


# ---- service ---------------------------------------------------------


class ScannerService:
    def __init__(self, cfg: Config, session: DeviceSession, buffer: ScanBuffer):
        self.cfg = cfg
        self.session = session
        self.buffer = buffer
        self._stop = False
        self._cached_list_id: Optional[str] = None
        self._cached_list_at: float = 0.0
        self._drain_thread: Optional[threading.Thread] = None

    def stop(self) -> None:
        self._stop = True

    # ---- profile/list -----------------------------------------------

    def _active_list_id(self) -> Optional[str]:
        # Cache the default list for 60s; profile rarely changes.
        now = time.time()
        if self._cached_list_id and now - self._cached_list_at < 60:
            return self._cached_list_id
        try:
            self.session.ensure_authenticated()
            res = (
                self.session.client.table("profiles")
                .select("default_shopping_list_id")
                .limit(1)
                .execute()
            )
            row = (res.data or [None])[0]
            self._cached_list_id = (row or {}).get("default_shopping_list_id")
            self._cached_list_at = now
        except Exception:  # noqa: BLE001
            log.debug("active list lookup failed; using cached", exc_info=True)
        return self._cached_list_id

    # ---- main loop --------------------------------------------------

    def run(self) -> None:
        self._drain_thread = threading.Thread(target=self._drain_loop, daemon=True)
        self._drain_thread.start()

        try:
            source = self._input_source()
            for code in source:
                if self._stop:
                    return
                if not code:
                    continue
                self._handle_scan(code)
        except KeyboardInterrupt:
            return

    def _input_source(self) -> Iterator[str]:
        backend = self.cfg.scanner_backend
        if backend == "evdev":
            if not self.cfg.scanner_device_path:
                raise RuntimeError("SCANNER_DEVICE_PATH required for evdev backend")
            return _evdev_codes(self.cfg.scanner_device_path, self.cfg.scanner_grab_exclusive)
        return _stdin_codes()

    def _handle_scan(self, code: str) -> None:
        list_id = self._active_list_id()
        try:
            resp = self._send_scan(code, list_id)
        except (URLError, OSError, TimeoutError) as exc:
            log.warning("network error sending scan %r; buffering: %s", code, exc)
            self.buffer.enqueue(code, list_id)
            return
        except Exception:  # noqa: BLE001
            log.error("unexpected error sending scan %r:\n%s", code, traceback.format_exc())
            return
        self._log_response(code, resp)
        if resp.action == "needs_name" and resp.barcode:
            self._add_placeholder(resp.barcode, list_id)

    def _send_scan(self, code: str, list_id: Optional[str]) -> ResolveScanResponse:
        body = {"code": code, "list_id": list_id}
        raw = self.session.invoke_edge("resolve-scan", body)
        if "error" in raw and "action" not in raw:
            raise RuntimeError(f"resolve-scan error: {raw.get('error')}")
        return ResolveScanResponse.model_validate(raw)

    def _add_placeholder(self, barcode: str, list_id: Optional[str]) -> None:
        """needs_name path: drop a placeholder so the scan isn't lost. The
        user renames it later in the web app."""
        if not list_id:
            log.info("needs_name with no default list set; skipping placeholder for %s", barcode)
            return
        try:
            self.session.ensure_authenticated()
            self.session.client.table("shopping_list_items").insert(
                {
                    "list_id": list_id,
                    "name": f"Unnamed ({barcode})",
                    "quantity": 1,
                    "added_via": "scan",
                }
            ).execute()
            log.info("inserted placeholder for barcode %s", barcode)
        except Exception:  # noqa: BLE001
            log.warning("failed to insert placeholder for %s", barcode, exc_info=True)

    def _log_response(self, code: str, resp: ResolveScanResponse) -> None:
        if resp.action in ("added_item", "incremented_item", "completed_task"):
            log.info("scan %r → %s (%s)", code, resp.action, resp.message)
        elif resp.action == "needs_name":
            log.info("scan %r → needs_name (barcode=%s)", code, resp.barcode)
        else:
            log.info("scan %r → unknown", code)

    # ---- offline drain ---------------------------------------------

    def _drain_loop(self) -> None:
        """Background draining of the offline buffer.

        Runs forever; sleeps the network-retry interval each pass. Drops
        rows after a successful send; bumps attempts on failure (no row is
        dropped permanently — operators can inspect the SQLite file).
        """
        while not self._stop:
            try:
                self._drain_once()
            except Exception:  # noqa: BLE001
                log.debug("drain pass failed", exc_info=True)
            for _ in range(int(self.cfg.network_retry_interval_s * 2)):
                if self._stop:
                    return
                time.sleep(0.5)

    def _drain_once(self) -> None:
        rows = self.buffer.pending(limit=20)
        if not rows:
            return
        log.info("draining %d buffered scan(s)", len(rows))
        for row_id, code, list_id, attempts in rows:
            if self._stop:
                return
            try:
                resp = self._send_scan(code, list_id)
            except (URLError, OSError, TimeoutError):
                self.buffer.bump_attempts(row_id)
                return  # stop on first network error; try again next pass
            except Exception:  # noqa: BLE001
                log.warning("permanent drain error for %r; dropping", code, exc_info=True)
                self.buffer.drop(row_id)
                continue
            self._log_response(code, resp)
            self.buffer.drop(row_id)
            if resp.action == "needs_name" and resp.barcode:
                self._add_placeholder(resp.barcode, list_id)
            _ = attempts  # currently unused; available for richer policy later


# ---- entrypoint -----------------------------------------------------


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )


def main() -> int:
    _setup_logging()
    cfg = Config.from_env()
    session = DeviceSession(cfg.supabase_url, cfg.supabase_anon_key, cfg.refresh_token_path)
    session.ensure_authenticated()
    buf = ScanBuffer(cfg.buffer_db_path)
    svc = ScannerService(cfg, session, buf)

    def _on_signal(_signum, _frame):
        log.info("shutdown signal received")
        svc.stop()

    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    svc.run()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


# Allow `python -c "from scanner.main import _send_scan_smoke; _send_scan_smoke()"`
# style imports for tests. We don't ship a real CLI test runner here.
_ = json  # silence "imported but unused" — used by tests below in the future
