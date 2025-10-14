from pathlib import Path

import pytest

from shared.libs.storage.lake import LakeWriter, read_parquet


def test_write_and_read_parquet(tmp_path: Path):
    writer = LakeWriter(root=tmp_path)
    dataset = "tenant_promos"
    record = {
        "tenant_id": "tenant-1",
        "campaign_id": "promo-123",
        "name": "Launch Campaign",
        "channel": "email",
        "scheduled_at": "2024-01-01T00:00:00Z",
        "status": "scheduled",
    }
    path = writer.write_records(dataset, [record])
    assert path.exists()

    latest = writer.latest(dataset)
    assert latest == path

    frame = read_parquet(path)
    assert frame.shape == (1, len(record))
    assert frame[0, "campaign_id"] == "promo-123"


def test_write_empty_records(tmp_path: Path):
    writer = LakeWriter(root=tmp_path)
    path = writer.write_records("empty", [])
    frame = read_parquet(path)
    assert frame.shape == (0, 0)


def test_write_records_unknown_dataset_raises(tmp_path: Path):
    writer = LakeWriter(root=tmp_path)
    with pytest.raises(ValueError, match="unknown_dataset"):
        writer.write_records("tenant_unknown_dataset", [{"tenant_id": "tenant-1"}])
