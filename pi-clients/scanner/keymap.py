"""US-QWERTY scancode → character mapping for HID barcode scanners.

USB barcode scanners enumerate as HID keyboards. We read raw key events via
evdev and translate them to printable characters, honoring SHIFT (most
scanners emit only digits + a terminating ENTER, but accept-all is cheap).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# evdev key code constants (subset of linux/input-event-codes.h)
KEY_RESERVED = 0
KEY_ENTER = 28
KEY_LEFTSHIFT = 42
KEY_RIGHTSHIFT = 54
KEY_TAB = 15
KEY_SPACE = 57


_NORMAL = {
    2: "1",  3: "2",  4: "3",  5: "4",  6: "5",  7: "6",  8: "7",  9: "8", 10: "9", 11: "0",
    12: "-", 13: "=",
    16: "q", 17: "w", 18: "e", 19: "r", 20: "t", 21: "y", 22: "u", 23: "i", 24: "o", 25: "p",
    26: "[", 27: "]",
    30: "a", 31: "s", 32: "d", 33: "f", 34: "g", 35: "h", 36: "j", 37: "k", 38: "l",
    39: ";", 40: "'", 41: "`", 43: "\\",
    44: "z", 45: "x", 46: "c", 47: "v", 48: "b", 49: "n", 50: "m",
    51: ",", 52: ".", 53: "/",
    KEY_SPACE: " ",
    KEY_TAB: "\t",
}

_SHIFTED = {
    2: "!",  3: "@",  4: "#",  5: "$",  6: "%",  7: "^",  8: "&",  9: "*", 10: "(", 11: ")",
    12: "_", 13: "+",
    16: "Q", 17: "W", 18: "E", 19: "R", 20: "T", 21: "Y", 22: "U", 23: "I", 24: "O", 25: "P",
    26: "{", 27: "}",
    30: "A", 31: "S", 32: "D", 33: "F", 34: "G", 35: "H", 36: "J", 37: "K", 38: "L",
    39: ":", 40: '"', 41: "~", 43: "|",
    44: "Z", 45: "X", 46: "C", 47: "V", 48: "B", 49: "N", 50: "M",
    51: "<", 52: ">", 53: "?",
    KEY_SPACE: " ",
}


@dataclass
class KeyAssembler:
    """Stateful translator: feed it key events, get a string when ENTER fires."""

    shift_down: bool = False
    buf: str = ""

    def feed(self, code: int, is_press: bool) -> Optional[str]:
        """Returns the assembled string when ENTER is pressed, else None.

        ``is_press`` is True on key down (evdev value=1), False on release (value=0).
        Key repeat (value=2) should not be passed in — barcode scanners don't repeat.
        """
        if code in (KEY_LEFTSHIFT, KEY_RIGHTSHIFT):
            self.shift_down = is_press
            return None
        if not is_press:
            return None
        if code == KEY_ENTER:
            out = self.buf
            self.buf = ""
            return out
        ch = (_SHIFTED if self.shift_down else _NORMAL).get(code)
        if ch is not None:
            self.buf += ch
        return None

    def reset(self) -> None:
        self.shift_down = False
        self.buf = ""
