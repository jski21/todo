from pathlib import Path

from shared.buffer import ScanBuffer


def test_enqueue_pending_drop(tmp_path: Path):
    buf = ScanBuffer(tmp_path / "buf.sqlite")
    assert buf.count() == 0
    a = buf.enqueue("049000028904", "list-1")
    b = buf.enqueue("049000028905", None)
    assert buf.count() == 2
    rows = buf.pending()
    assert [r[1] for r in rows] == ["049000028904", "049000028905"]
    assert rows[0][2] == "list-1" and rows[1][2] is None
    buf.bump_attempts(a)
    rows = buf.pending()
    assert rows[0][3] == 1   # attempts bumped
    buf.drop(a)
    buf.drop(b)
    assert buf.count() == 0


def test_persistence_across_instances(tmp_path: Path):
    p = tmp_path / "buf.sqlite"
    ScanBuffer(p).enqueue("x", None)
    again = ScanBuffer(p)
    assert again.count() == 1
