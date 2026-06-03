"""Runtime config loaded from environment.

Production: systemd EnvironmentFile=/etc/donelist/config.env.
Development: .env file in the working directory (dotenv).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def _load_dotenv_if_present() -> None:
    """Load .env from CWD if present. Skip silently if dotenv isn't installed
    or the file doesn't exist — production gets env from systemd."""
    try:
        from dotenv import load_dotenv  # type: ignore
    except ImportError:
        return
    for candidate in (Path.cwd() / ".env", Path(__file__).resolve().parents[1] / ".env"):
        if candidate.exists():
            load_dotenv(candidate, override=False)
            return


_load_dotenv_if_present()


def _env(name: str, default: Optional[str] = None, required: bool = False) -> Optional[str]:
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"missing required env var: {name}")
    return value


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Config:
    # ---- Supabase ----------------------------------------------------
    supabase_url: str
    supabase_anon_key: str
    refresh_token_path: Path

    # ---- printer -----------------------------------------------------
    printer_backend: str  # "dummy" | "usb" | "serial" | "file"
    printer_usb_vendor: Optional[int]
    printer_usb_product: Optional[int]
    printer_serial_path: Optional[str]
    printer_dummy_file: Path
    printer_width_chars: int
    printer_poll_interval_s: float
    printer_max_attempts: int

    # ---- scanner -----------------------------------------------------
    scanner_backend: str  # "evdev" | "stdin"
    scanner_device_path: Optional[str]
    scanner_grab_exclusive: bool

    # ---- offline buffer ---------------------------------------------
    buffer_db_path: Path
    network_retry_interval_s: float

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            supabase_url=_env("SUPABASE_URL", required=True),  # type: ignore[arg-type]
            supabase_anon_key=_env("SUPABASE_ANON_KEY", required=True),  # type: ignore[arg-type]
            refresh_token_path=Path(
                _env("DEVICE_REFRESH_TOKEN_PATH", "/var/lib/donelist/refresh_token") or ""
            ),
            printer_backend=(_env("PRINTER_BACKEND", "dummy") or "dummy").lower(),
            printer_usb_vendor=_maybe_hex_int(_env("PRINTER_USB_VENDOR")),
            printer_usb_product=_maybe_hex_int(_env("PRINTER_USB_PRODUCT")),
            printer_serial_path=_env("PRINTER_SERIAL_PATH"),
            printer_dummy_file=Path(_env("PRINTER_DUMMY_FILE", "/tmp/donelist-printer.out") or ""),
            printer_width_chars=_env_int("PRINTER_WIDTH_CHARS", 32),
            printer_poll_interval_s=float(_env("PRINTER_POLL_INTERVAL_S", "3") or 3),
            printer_max_attempts=_env_int("PRINTER_MAX_ATTEMPTS", 5),
            scanner_backend=(_env("SCANNER_BACKEND", "stdin") or "stdin").lower(),
            scanner_device_path=_env("SCANNER_DEVICE_PATH"),
            scanner_grab_exclusive=_env_bool("SCANNER_GRAB_EXCLUSIVE", True),
            buffer_db_path=Path(_env("BUFFER_DB_PATH", "/var/lib/donelist/buffer.sqlite") or ""),
            network_retry_interval_s=float(_env("NETWORK_RETRY_INTERVAL_S", "10") or 10),
        )


def _maybe_hex_int(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    raw = raw.strip()
    try:
        if raw.lower().startswith("0x"):
            return int(raw, 16)
        return int(raw, 16) if any(c in raw.lower() for c in "abcdef") else int(raw)
    except ValueError:
        return None
