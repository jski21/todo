from scanner.keymap import KeyAssembler, KEY_ENTER


def test_assembles_digits_and_terminates_on_enter():
    asm = KeyAssembler()
    # "123" + ENTER → "123"
    assert asm.feed(2, True) is None   # 1
    assert asm.feed(3, True) is None   # 2
    assert asm.feed(4, True) is None   # 3
    assert asm.feed(KEY_ENTER, True) == "123"
    # buffer cleared after enter
    assert asm.feed(KEY_ENTER, True) == ""


def test_shift_produces_uppercase_and_symbols():
    asm = KeyAssembler()
    # Hold SHIFT, press '1' which becomes '!', release SHIFT, ENTER.
    asm.feed(42, True)              # left shift down
    asm.feed(2, True)               # 1 -> !
    asm.feed(42, False)             # left shift up
    asm.feed(30, True)              # a -> a
    assert asm.feed(KEY_ENTER, True) == "!a"


def test_releases_ignored_for_buffering():
    asm = KeyAssembler()
    assert asm.feed(2, True) is None     # press 1
    assert asm.feed(2, False) is None    # release — must NOT re-buffer
    assert asm.feed(KEY_ENTER, True) == "1"
