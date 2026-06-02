"""Local SQLite queue for offline scan retry.

When the scanner can't reach Supabase, we drop the scan code (and active list)
into this queue and drain it on reconnect. Idempotency note: re-sending a
ticket scan is a no-op; product scans may bump quantity by one extra — the
backend prompt explicitly accepts that tradeoff.
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, List, Optional, Tuple


_SCHEMA = """
CREATE TABLE IF NOT EXISTS pending_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  list_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pending_scans_id_idx ON pending_scans(id);
"""


class ScanBuffer:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._path = path
        self._lock = threading.Lock()
        with self._conn() as c:
            c.executescript(_SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self._path), timeout=10, isolation_level=None)
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            yield conn
        finally:
            conn.close()

    def enqueue(self, code: str, list_id: Optional[str]) -> int:
        with self._lock, self._conn() as c:
            cur = c.execute(
                "INSERT INTO pending_scans(code, list_id) VALUES (?, ?)",
                (code, list_id),
            )
            return int(cur.lastrowid)

    def pending(self, limit: int = 100) -> List[Tuple[int, str, Optional[str], int]]:
        with self._lock, self._conn() as c:
            rows = c.execute(
                "SELECT id, code, list_id, attempts FROM pending_scans "
                "ORDER BY id ASC LIMIT ?",
                (limit,),
            ).fetchall()
            return [(int(r[0]), str(r[1]), r[2], int(r[3])) for r in rows]

    def drop(self, row_id: int) -> None:
        with self._lock, self._conn() as c:
            c.execute("DELETE FROM pending_scans WHERE id = ?", (row_id,))

    def bump_attempts(self, row_id: int) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE pending_scans SET attempts = attempts + 1 WHERE id = ?",
                (row_id,),
            )

    def count(self) -> int:
        with self._lock, self._conn() as c:
            (n,) = c.execute("SELECT COUNT(*) FROM pending_scans").fetchone()
            return int(n)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
