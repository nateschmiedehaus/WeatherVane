import json
from pathlib import Path

from apps.worker.run import _append_log


def test_append_log_writes_ndjson(tmp_path):
    log_path = tmp_path / "logs" / "events.ndjson"
    payload = {"foo": "bar"}
    _append_log(str(log_path), "test.event", payload)
    content = log_path.read_text().strip()
    record = json.loads(content)
    assert record["event"] == "test.event"
    assert record["payload"] == payload
    assert "timestamp" in record


def test_append_log_no_path(tmp_path):
    # Should not raise when log_file is None
    _append_log(None, "test.event", {"foo": "bar"})
