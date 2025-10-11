from pathlib import Path

from shared.observability.metrics import purge_run_artifacts


def test_purge_run_artifacts_removes_child_paths(tmp_path):
    base_dir = tmp_path / "metrics"
    run_dir = base_dir / "20250101T010101Z"
    nested_file = run_dir / "metrics.jsonl"
    stray_file = base_dir / "orphan.jsonl"

    nested_file.parent.mkdir(parents=True)
    nested_file.write_text("data\n", encoding="utf-8")
    stray_file.write_text("{}", encoding="utf-8")

    removed = purge_run_artifacts(str(base_dir))

    remaining = list(base_dir.iterdir())
    assert run_dir not in remaining
    assert stray_file not in remaining
    assert not remaining
    assert base_dir.exists()
    assert all(not Path(path).exists() for path in removed)


def test_purge_run_artifacts_dry_run_preserves_files(tmp_path):
    base_dir = tmp_path / "metrics"
    run_dir = base_dir / "20250101T010101Z"
    run_dir.mkdir(parents=True)

    removed = purge_run_artifacts(str(base_dir), dry_run=True)

    assert run_dir.exists()
    assert removed == [run_dir]
