"""Render a PrintPayload into ESC/POS commands.

The renderer is agnostic about the underlying printer backend — it operates
on anything that quacks like a python-escpos printer (text/set/qr/barcode/cut).
Width is configurable so the same code drives 58mm (32 chars) and 80mm (48 chars).
"""

from __future__ import annotations

from typing import Optional, Protocol

from shared.models import PrintLine, PrintPayload


class _EscposLike(Protocol):
    """Just the bits of python-escpos we lean on. Keeps this file mockable."""

    def text(self, txt: str) -> None: ...
    def set(self, **kwargs) -> None: ...  # noqa: A003
    def qr(self, content: str, size: int = ...) -> None: ...
    def barcode(self, code: str, bc: str, **kwargs) -> None: ...
    def cut(self) -> None: ...
    def ln(self, count: int = ...) -> None: ...


def render(printer: _EscposLike, payload: PrintPayload, width: int = 32) -> None:
    """Render payload to printer commands. Order: title, subtitle, lines, qr,
    barcode, footer, optional cut."""
    if width < 16:
        width = 16  # paranoia: don't divide by zero in layout math

    # ---- title (double height + bold, centered) -------------------
    printer.set(align="center", bold=True, double_height=True, double_width=False)
    printer.text(_truncate(payload.title, width) + "\n")
    printer.set(align="center", bold=False, double_height=False, double_width=False)

    # ---- subtitle (centered, normal) ------------------------------
    if payload.subtitle:
        printer.text(_truncate(payload.subtitle, width) + "\n")
    printer.text("-" * width + "\n")

    # ---- body lines ----------------------------------------------
    printer.set(align="left")
    for line in payload.lines:
        for visual in _layout_line(line, width):
            printer.text(visual + "\n")

    # ---- qr -------------------------------------------------------
    if payload.qr:
        printer.text("\n")
        printer.set(align="center")
        try:
            printer.qr(payload.qr, size=8)
        except TypeError:
            # Some escpos versions don't accept the kwarg.
            printer.qr(payload.qr)
        printer.set(align="left")

    # ---- 1D barcode ----------------------------------------------
    if payload.barcode:
        printer.text("\n")
        printer.set(align="center")
        try:
            printer.barcode(payload.barcode, "CODE128", width=2, height=64)
        except Exception:  # noqa: BLE001
            printer.text(payload.barcode + "\n")
        printer.set(align="left")

    # ---- footer ---------------------------------------------------
    if payload.footer:
        printer.text("\n")
        printer.set(align="center")
        printer.text(_truncate(payload.footer, width) + "\n")
        printer.set(align="left")

    printer.text("\n\n\n")  # feed before cut so blade clears content
    if payload.cut:
        try:
            printer.cut()
        except Exception:  # noqa: BLE001 — Dummy backend may not support cut
            pass


# ---- layout helpers ----------------------------------------------


def _truncate(s: str, width: int) -> str:
    if len(s) <= width:
        return s
    return s[: max(1, width - 1)] + "…"


def _layout_line(line: PrintLine, width: int) -> list[str]:
    """Wrap a single PrintLine into one or more visual lines.

    Layout (width=32 example):
        [ ] <name padded with spaces><qty right-aligned>
    Continuation lines indent under the text column.
    """
    prefix = "[ ] " if line.checkbox else ""
    qty = line.qty or ""
    body_width = width - len(prefix)
    qty_pad = (" " + qty) if qty else ""
    text_room = body_width - len(qty_pad)
    if text_room < 8:
        # Pathological: just stack qty on its own line.
        first = prefix + _truncate(line.text, body_width)
        return [first] + ([" " * len(prefix) + qty] if qty else [])

    text = line.text or ""
    wrapped = _word_wrap(text, text_room)
    out: list[str] = []
    for i, chunk in enumerate(wrapped):
        if i == 0:
            pad = " " * (text_room - len(chunk))
            out.append(prefix + chunk + pad + qty_pad)
        else:
            out.append(" " * len(prefix) + chunk)
    return out


def _word_wrap(text: str, width: int) -> list[str]:
    """Trivial word wrap; greedy. width >= 1."""
    if width < 1:
        return [text]
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    cur = ""
    for w in words:
        if not cur:
            cur = w if len(w) <= width else w[:width]
            if len(w) > width:
                lines.append(cur)
                cur = w[width:]
            continue
        if len(cur) + 1 + len(w) <= width:
            cur = f"{cur} {w}"
        else:
            lines.append(cur)
            cur = w if len(w) <= width else w[:width]
            if len(w) > width:
                lines.append(cur)
                cur = w[width:]
    if cur:
        lines.append(cur)
    return lines


# ---- backend factory ---------------------------------------------


def build_printer(
    backend: str,
    *,
    usb_vendor: Optional[int],
    usb_product: Optional[int],
    serial_path: Optional[str],
    dummy_file_path: Optional[str],
):
    """Construct a python-escpos backend by name. Raises on misconfiguration."""
    backend = (backend or "dummy").lower()
    if backend == "dummy" or backend == "file":
        from escpos.printer import Dummy  # type: ignore

        class _DummyToFile(Dummy):  # type: ignore[misc]
            """Dummy that appends its captured bytes to a file on close/flush."""

            def __init__(self, path: str):
                super().__init__()
                self._out_path = path

            def flush_to_file(self) -> None:
                if not self._out_path:
                    return
                with open(self._out_path, "ab") as fh:
                    fh.write(self.output)
                self._buffer = b""
                self._output = b""

        return _DummyToFile(dummy_file_path or "/tmp/donelist-printer.out")

    if backend == "usb":
        if usb_vendor is None or usb_product is None:
            raise RuntimeError("PRINTER_USB_VENDOR and PRINTER_USB_PRODUCT required for usb backend")
        from escpos.printer import Usb  # type: ignore

        return Usb(usb_vendor, usb_product, timeout=0, in_ep=0x82, out_ep=0x01)

    if backend == "serial":
        if not serial_path:
            raise RuntimeError("PRINTER_SERIAL_PATH required for serial backend")
        from escpos.printer import Serial  # type: ignore

        return Serial(devfile=serial_path, baudrate=19200, timeout=1)

    raise RuntimeError(f"unknown PRINTER_BACKEND={backend!r}")
