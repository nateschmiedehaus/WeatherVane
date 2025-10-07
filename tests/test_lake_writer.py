from pathlib import Path

import polars as pl

from shared.libs.storage.lake import LakeWriter, read_parquet


def test_write_and_read_parquet(tmp_path: Path):
    writer = LakeWriter(root=tmp_path)
    path = writer.write_records("sample", [{"id": 1, "value": "foo"}])
    assert path.exists()

    latest = writer.latest("sample")
    assert latest == path

    frame = read_parquet(path)
    assert frame.shape == (1, 2)
    assert frame[0, "value"] == "foo"


def test_write_empty_records(tmp_path: Path):
    writer = LakeWriter(root=tmp_path)
    path = writer.write_records("empty", [])
    frame = read_parquet(path)
    assert frame.shape == (0, 0)
