"""Tests for the render layer. Uses a fake printer that records calls
so we never need a real ESC/POS backend or python-escpos installed."""

from dataclasses import dataclass, field
from typing import Any, List, Tuple

from printer.render import render
from shared.models import PrintLine, PrintPayload


@dataclass
class FakePrinter:
    calls: List[Tuple[str, tuple, dict]] = field(default_factory=list)

    def text(self, txt):
        self.calls.append(("text", (txt,), {}))

    def set(self, **kwargs):
        self.calls.append(("set", (), kwargs))

    def qr(self, content, size=None):
        self.calls.append(("qr", (content,), {"size": size}))

    def barcode(self, code, bc, **kwargs):
        self.calls.append(("barcode", (code, bc), kwargs))

    def cut(self):
        self.calls.append(("cut", (), {}))

    def ln(self, count=1):
        self.calls.append(("ln", (count,), {}))

    def text_blob(self) -> str:
        return "".join(args[0] for name, args, _ in self.calls if name == "text")


def test_renders_title_lines_and_cut():
    payload = PrintPayload(
        format="list",
        title="Groceries",
        subtitle="Sat, Nov 9",
        lines=[
            PrintLine(text="Milk", qty="1 gal", checkbox=True),
            PrintLine(text="Bread", qty=None, checkbox=True),
        ],
        cut=True,
    )
    p = FakePrinter()
    render(p, payload, width=32)

    blob = p.text_blob()
    assert "Groceries" in blob
    assert "Sat, Nov 9" in blob
    assert "[ ] Milk" in blob
    assert "1 gal" in blob
    assert "[ ] Bread" in blob
    assert any(name == "cut" for name, *_ in p.calls)


def test_qr_invoked_when_payload_has_qr():
    payload = PrintPayload(format="ticket", title="Task", qr="https://example.com/t/abc123")
    p = FakePrinter()
    render(p, payload, width=32)
    assert any(name == "qr" for name, *_ in p.calls)


def test_footer_centered_when_present():
    payload = PrintPayload(format="ticket", title="Task", footer="Scan to complete")
    p = FakePrinter()
    render(p, payload, width=32)
    assert "Scan to complete" in p.text_blob()


def test_long_line_wraps_within_width():
    payload = PrintPayload(
        format="list",
        title="X",
        lines=[PrintLine(text="A very very very long item name that should wrap nicely", checkbox=True)],
    )
    p = FakePrinter()
    render(p, payload, width=24)
    # Every text fragment that came out of the body should fit width.
    for name, args, _ in p.calls:
        if name == "text":
            for line in args[0].split("\n"):
                assert len(line) <= 24, f"line too wide ({len(line)}): {line!r}"
