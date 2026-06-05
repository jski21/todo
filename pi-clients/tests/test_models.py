"""Round-trip models against the on-the-wire shape declared in
supabase/functions/_shared/types.ts. If this test breaks, the contract
has drifted on one side; reconcile both."""

from shared.models import PrintJob, PrintPayload, ResolveScanResponse


def test_print_job_validates_real_payload():
    raw = {
        "id": "00000000-0000-0000-0000-000000000001",
        "type": "shopping_list",
        "status": "queued",
        "attempts": 0,
        "payload": {
            "format": "list",
            "title": "Groceries",
            "subtitle": None,
            "lines": [
                {"text": "Milk", "qty": "1 gal", "checkbox": True},
                {"text": "Bread", "qty": None, "checkbox": True},
            ],
            "qr": None,
            "barcode": None,
            "footer": None,
            "cut": True,
        },
    }
    job = PrintJob.model_validate(raw)
    assert job.payload.format == "list"
    assert len(job.payload.lines) == 2
    assert job.payload.lines[0].qty == "1 gal"


def test_resolve_scan_response_all_actions_parse():
    for action in ("completed_task", "added_item", "incremented_item", "needs_name", "unknown"):
        resp = ResolveScanResponse.model_validate({"action": action, "message": "ok"})
        assert resp.action == action


def test_payload_default_cut_true():
    p = PrintPayload(format="custom", title="x")
    assert p.cut is True
