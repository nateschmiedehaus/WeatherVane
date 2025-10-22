from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import json
import polars as pl
import pytest

from apps.model.mmm_backtest import (
    BacktestSummary,
    BacktestWindow,
    execute_backtest_to_report,
    run_walk_forward_backtest,
    save_report,
)
from tools.wvo_mcp.scripts import nightly_mmm_backtest


def _build_synthetic_dataset(rows: int = 24) -> pl.DataFrame:
    """Construct a synthetic marketing dataset with stable MMM structure."""

    start = date(2024, 1, 1)
    weeks = [start + timedelta(weeks=index) for index in range(rows)]
    meta_spend = []
    search_spend = []
    revenue = []

    for index in range(rows):
        meta = 90 + 10 * ((index % 4) - 1.5)
        search = 70 + 6 * ((index % 3) - 1)
        noise = ((index % 5) - 2) * 1.5
        meta_spend.append(meta)
        search_spend.append(search)
        # Revenue is a linear combination of channels with small noise.
        revenue.append(meta * 2.0 + search * 1.5 + noise)

    return pl.DataFrame(
        {
            "week": weeks,
            "meta": meta_spend,
            "search": search_spend,
            "revenue": revenue,
        }
    )


def test_walk_forward_backtest_beats_trailing_baseline():
    frame = _build_synthetic_dataset()
    windows, summary = run_walk_forward_backtest(
        frame,
        spend_cols=["meta", "search"],
        revenue_col="revenue",
        date_col="week",
        window_size=12,
    )

    assert len(windows) == frame.height - 12
    assert summary.window_count == len(windows)
    assert summary.mae_mmm < summary.mae_baseline
    assert summary.relative_mae_improvement > 0.05

    first_window = windows[0]
    assert isinstance(first_window, BacktestWindow)

    # Ensure chronological ordering is preserved
    assert first_window.train_start < first_window.train_end < first_window.holdout


def test_save_report_creates_artifact(tmp_path: Path):
    frame = _build_synthetic_dataset()
    windows, summary = run_walk_forward_backtest(
        frame,
        spend_cols=["meta", "search"],
        revenue_col="revenue",
        date_col="week",
        window_size=12,
    )

    output_path = tmp_path / "artifacts" / "modeling" / "mmm_backtest.json"
    save_report(
        windows,
        summary,
        output_path,
        metadata={"dataset": "synthetic-demo"},
    )

    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["window_count"] == summary.window_count
    assert payload["metrics"]["mae_mmm"] == pytest.approx(summary.mae_mmm)
    assert payload["windows"], "Expected serialized window details"
    assert payload["metadata"]["dataset"] == "synthetic-demo"


def test_nightly_script_posts_deltas(tmp_path: Path):
    frame = _build_synthetic_dataset()
    artifact_path = tmp_path / "artifacts" / "modeling" / "mmm_backtest.json"
    snapshot_path = tmp_path / "state" / "analytics" / "mmm_backtest_snapshot.json"
    inbox_path = tmp_path / "state" / "roadmap_inbox.json"

    windows, summary = execute_backtest_to_report(
        frame,
        spend_cols=["meta", "search"],
        revenue_col="revenue",
        date_col="week",
        window_size=12,
        output_path=artifact_path,
        metadata={"dataset": "synthetic-demo"},
    )

    assert isinstance(summary, BacktestSummary)
    # Seed a previous snapshot with lower improvement to force delta emission
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(
        json.dumps(
            {
                "generated_at": "2024-01-01T00:00:00Z",
                "metrics": {
                    "relative_mae_improvement": summary.relative_mae_improvement - 0.2,
                    "mae_mmm": summary.mae_mmm + 5,
                    "mae_baseline": summary.mae_baseline + 5,
                },
            }
        ),
        encoding="utf-8",
    )

    nightly_mmm_backtest.main(
        [
            f"--artifact={artifact_path}",
            f"--snapshot={snapshot_path}",
            f"--inbox={inbox_path}",
            "--threshold=0.01",
        ]
    )

    artifact_payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    inbox_entries = json.loads(inbox_path.read_text(encoding="utf-8"))
    assert inbox_entries, "Expected nightly script to record a roadmap inbox entry"
    entry = inbox_entries[-1]
    assert "MMM backtest" in entry["title"]
    assert entry["status"] == "pending_review"
    assert entry["signals"] == artifact_payload["generated_at"]
