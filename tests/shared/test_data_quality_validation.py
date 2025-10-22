from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from shared.services.data_quality import DataQualityConfig, run_data_quality_validation


def _build_design_matrix(
    row_count: int,
    *,
    missing_ratio: float = 0.0,
    include_outlier: bool = False,
    gap_after_days: int | None = None,
) -> dict[str, list[object]]:
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    dates = [start + timedelta(days=idx) for idx in range(row_count)]
    if gap_after_days is not None and 0 <= gap_after_days < row_count - 1:
        missing_date = dates[gap_after_days] + timedelta(days=1)
        dates = [date for date in dates if date != missing_date]
        while len(dates) < row_count:
            dates.append(dates[-1] + timedelta(days=1))

    spend = [10.0 for _ in range(len(dates))]
    revenue = [100.0 for _ in range(len(dates))]

    if include_outlier and spend:
        spend[0] = 5000.0

    target_available = [True for _ in range(len(dates))]
    missing_entries = int(len(dates) * missing_ratio)
    if missing_entries:
        for idx in range(missing_entries):
            spend[idx] = None

    return {
        "date": [value.isoformat() for value in dates],
        "paid_search_spend": spend,
        "net_revenue": revenue,
        "target_available": target_available,
    }


def test_detects_insufficient_rows(tmp_path: Path) -> None:
    design_matrix = _build_design_matrix(30)
    output_path = tmp_path / "state" / "analytics" / "data_quality.json"

    report = run_data_quality_validation(
        "tenant-1",
        (
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            datetime(2024, 3, 1, tzinfo=timezone.utc),
        ),
        design_matrix=design_matrix,
        metadata={},
        weather_join_report={"join": {"geocoded_order_ratio": 0.95}},
        output_path=output_path,
    )

    assert report["checks"]["volume"]["status"] == "fail"
    saved = json.loads(output_path.read_text())
    assert saved["status"] == "fail"


def test_detects_missing_data_above_threshold(tmp_path: Path) -> None:
    design_matrix = _build_design_matrix(120, missing_ratio=0.25)
    output_path = tmp_path / "dq" / "report.json"

    report = run_data_quality_validation(
        "tenant-2",
        (
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            datetime(2024, 5, 1, tzinfo=timezone.utc),
        ),
        design_matrix=design_matrix,
        metadata={},
        weather_join_report={"join": {"geocoded_order_ratio": 0.95}},
        output_path=output_path,
    )

    completeness = report["checks"]["completeness"]
    assert completeness["status"] == "fail"
    assert any(issue.startswith("missing_ratio:paid_search_spend") for issue in completeness["issues"])


def test_detects_outliers(tmp_path: Path) -> None:
    design_matrix = _build_design_matrix(120, include_outlier=True)
    output_path = tmp_path / "dq" / "outliers.json"

    report = run_data_quality_validation(
        "tenant-3",
        (
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            datetime(2024, 5, 1, tzinfo=timezone.utc),
        ),
        design_matrix=design_matrix,
        metadata={},
        weather_join_report={"join": {"geocoded_order_ratio": 0.95}},
        output_path=output_path,
        config=DataQualityConfig(outlier_std_threshold=2.0),
    )

    outliers = report["checks"]["outliers"]
    assert outliers["status"] == "warning"
    assert "paid_search_spend" in outliers["columns"]
    assert outliers["columns"]["paid_search_spend"][0]["index"] == 0


def test_detects_date_gaps(tmp_path: Path) -> None:
    design_matrix = _build_design_matrix(120, gap_after_days=10)
    output_path = tmp_path / "dq" / "coverage.json"

    report = run_data_quality_validation(
        "tenant-4",
        (
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            datetime(2024, 5, 1, tzinfo=timezone.utc),
        ),
        design_matrix=design_matrix,
        metadata={},
        weather_join_report={"join": {"geocoded_order_ratio": 0.95}},
        output_path=output_path,
    )

    coverage = report["checks"]["coverage"]
    assert coverage["status"] == "fail"
    assert coverage["missing_dates"], "Expected missing dates to be recorded"
