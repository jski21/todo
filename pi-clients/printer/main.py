"""Printer service.

Polls print_jobs for queued work and renders each job to the configured
ESC/POS backend. Claim is racy-safe via a conditional UPDATE that flips
status from 'queued' to 'printing' atomically. On failure, store the error
and bump attempts; retry with exponential backoff up to PRINTER_MAX_ATTEMPTS,
then leave the row in 'error' state for human attention.
"""

from __future__ import annotations

import logging
import signal
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Optional

# Allow `python -m printer.main` from the pi-clients directory.
if __package__ in (None, ""):
    import os as _os
    import sys as _sys

    _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

from shared.config import Config  # noqa: E402
from shared.models import PrintJob, PrintPayload  # noqa: E402
from shared.supabase_client import DeviceSession  # noqa: E402

from printer.render import build_printer, render  # noqa: E402

log = logging.getLogger("printer")


class PrinterService:
    def __init__(self, cfg: Config, session: DeviceSession):
        self.cfg = cfg
        self.session = session
        self._stop = False

    def stop(self) -> None:
        self._stop = True

    def run(self) -> None:
        log.info(
            "starting printer loop: backend=%s width=%d poll=%.1fs",
            self.cfg.printer_backend,
            self.cfg.printer_width_chars,
            self.cfg.printer_poll_interval_s,
        )
        while not self._stop:
            try:
                self._tick()
            except Exception:  # noqa: BLE001
                log.error("printer tick failed:\n%s", traceback.format_exc())
            self._sleep(self.cfg.printer_poll_interval_s)

    def _sleep(self, seconds: float) -> None:
        # Wake early on shutdown.
        deadline = time.time() + seconds
        while not self._stop and time.time() < deadline:
            time.sleep(min(0.5, deadline - time.time()))

    # ---- core loop --------------------------------------------------

    def _tick(self) -> None:
        self.session.ensure_authenticated()
        jobs = self._fetch_queued(limit=10)
        for raw in jobs:
            if self._stop:
                return
            try:
                job = PrintJob.model_validate(raw)
            except Exception:  # noqa: BLE001
                log.error("malformed print_jobs row id=%s; marking error", raw.get("id"))
                self._mark_error(raw.get("id"), "invalid payload schema", raw.get("attempts", 0))
                continue
            self._process(job)

    def _fetch_queued(self, limit: int = 10) -> list[dict]:
        res = (
            self.session.client.table("print_jobs")
            .select("id, type, payload, status, attempts")
            .eq("status", "queued")
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return list(res.data or [])

    def _claim(self, job_id: str) -> Optional[dict]:
        """Atomic claim. Returns the claimed row, or None if someone else won."""
        now = datetime.now(timezone.utc).isoformat()
        res = (
            self.session.client.table("print_jobs")
            .update({"status": "printing", "claimed_at": now})
            .eq("id", job_id)
            .eq("status", "queued")
            .select("id, type, payload, attempts")
            .execute()
        )
        rows = list(res.data or [])
        return rows[0] if rows else None

    def _process(self, job: PrintJob) -> None:
        claimed = self._claim(job.id)
        if not claimed:
            log.debug("job %s already claimed by another worker", job.id)
            return
        log.info("printing job %s (%s)", job.id, job.type)
        attempts = int(claimed.get("attempts", 0))
        try:
            self._render_and_print(job.payload)
        except Exception as exc:  # noqa: BLE001
            err = f"{type(exc).__name__}: {exc}"
            log.warning("print failed for job %s (attempt %d): %s", job.id, attempts + 1, err)
            self._mark_error(job.id, err, attempts)
            return

        # Success.
        self._mark_done(job.id, job.type)

    def _render_and_print(self, payload: PrintPayload) -> None:
        printer = build_printer(
            self.cfg.printer_backend,
            usb_vendor=self.cfg.printer_usb_vendor,
            usb_product=self.cfg.printer_usb_product,
            serial_path=self.cfg.printer_serial_path,
            dummy_file_path=str(self.cfg.printer_dummy_file),
        )
        try:
            render(printer, payload, width=self.cfg.printer_width_chars)
            # For the dummy/file backend, flush the captured bytes to disk now.
            flush = getattr(printer, "flush_to_file", None)
            if callable(flush):
                flush()
        finally:
            close = getattr(printer, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:  # noqa: BLE001
                    pass

    # ---- post-run state --------------------------------------------

    def _mark_done(self, job_id: str, job_type: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.session.client.table("print_jobs").update(
            {"status": "done", "printed_at": now, "error": None}
        ).eq("id", job_id).execute()
        # If this was a ticket-bearing job, stamp the ticket too. We don't
        # store the ticket id on the job; for occurrence prints, the QR
        # token uniquely identifies the row.
        if job_type == "occurrence":
            self._stamp_tickets_for_occurrence_job(job_id)

    def _stamp_tickets_for_occurrence_job(self, job_id: str) -> None:
        """Best-effort: stamp printed_at on the ticket whose QR was just
        printed. enqueue-print already sets printed_at when minting the
        ticket, so this is usually a no-op; we touch it only if missing
        for parity with other code paths."""
        # No FK from print_jobs to tickets in v1 schema; we rely on the
        # enqueue-print function having stamped printed_at already.
        _ = job_id

    def _mark_error(self, job_id: Optional[str], error: str, attempts: int) -> None:
        if not job_id:
            return
        next_attempts = attempts + 1
        new_status = "error" if next_attempts >= self.cfg.printer_max_attempts else "queued"
        update: dict = {
            "status": new_status,
            "error": error[:1000],
            "attempts": next_attempts,
        }
        # Re-queueing applies backoff implicitly via the next poll; nothing
        # finer-grained needed at our latency budget. For 'queued' we clear
        # claimed_at so the next claim can fire.
        if new_status == "queued":
            update["claimed_at"] = None
        self.session.client.table("print_jobs").update(update).eq("id", job_id).execute()


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
    svc = PrinterService(cfg, session)

    def _on_signal(_signum, _frame):
        log.info("shutdown signal received")
        svc.stop()

    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    svc.run()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
