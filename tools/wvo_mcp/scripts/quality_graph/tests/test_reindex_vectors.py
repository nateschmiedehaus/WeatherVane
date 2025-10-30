"""
Tests for quality_graph.reindex_vectors CLI.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import pytest

from .. import reindex_vectors
from ..embeddings import EMBEDDING_DIM


def _write_vectors(path: Path, vectors: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for vector in vectors:
            handle.write(json.dumps(vector) + "\n")


def _make_vector(task_id: str, title: str) -> dict:
    embedding = np.zeros(EMBEDDING_DIM, dtype=float)
    embedding[-1] = 1.0  # normalized unit vector
    return {
        "task_id": task_id,
        "embedding": embedding.tolist(),
        "timestamp": "2025-10-29T00:00:00Z",
        "outcome": {"status": "success"},
        "title": title,
        "description": f"{title} description",
        "files_touched": ["src/example.ts"],
        "quality": "medium",
    }


def test_dry_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    workspace = tmp_path
    corpus_path = workspace / "state" / "quality_graph" / "task_vectors.jsonl"
    original = [_make_vector("TASK-1", "Dry run task")]
    _write_vectors(corpus_path, original)

    monkeypatch.setenv("PYTHONWARNINGS", "ignore")  # silence sklearn warnings if any
    argv = [
        "reindex_vectors.py",
        str(workspace),
        "--dry-run",
    ]
    monkeypatch.setattr("sys.argv", argv)

    exit_code = reindex_vectors.main()
    assert exit_code == 0

    # File should remain unchanged
    with corpus_path.open("r", encoding="utf-8") as handle:
        lines = handle.readlines()
    assert lines[0].strip() == json.dumps(original[0])


def test_reindex_updates_embedding(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    workspace = tmp_path
    corpus_path = workspace / "state" / "quality_graph" / "task_vectors.jsonl"
    vectors = [
        _make_vector("TASK-1", "Reindex me"),
        _make_vector("TASK-2", "Leave me for limit"),
    ]
    _write_vectors(corpus_path, vectors)

    argv = [
        "reindex_vectors.py",
        str(workspace),
        "--limit",
        "1",
    ]
    monkeypatch.setattr("sys.argv", argv)

    exit_code = reindex_vectors.main()
    assert exit_code == 0

    # First vector should have new embedding, second untouched
    with corpus_path.open("r", encoding="utf-8") as handle:
        updated = [json.loads(line) for line in handle if line.strip()]

    assert len(updated) == 2
    assert updated[1]["task_id"] == "TASK-2"
    assert updated[1]["embedding"] == vectors[1]["embedding"]

    assert updated[0]["task_id"] == "TASK-1"
    assert updated[0]["embedding"] != vectors[0]["embedding"]
    assert abs(np.linalg.norm(np.array(updated[0]["embedding"])) - 1.0) < 0.01


def test_backup_file_created(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    workspace = tmp_path
    corpus_path = workspace / "state" / "quality_graph" / "task_vectors.jsonl"
    _write_vectors(corpus_path, [_make_vector("TASK-1", "Backup test")])

    argv = [
        "reindex_vectors.py",
        str(workspace),
        "--backup",
    ]
    monkeypatch.setattr("sys.argv", argv)

    exit_code = reindex_vectors.main()
    assert exit_code == 0

    backups = list(corpus_path.parent.glob("task_vectors.jsonl.bak.*"))
    assert backups, "Expected backup file to be created"
    for backup in backups:
        assert backup.is_file()
        assert os.path.getsize(backup) > 0
