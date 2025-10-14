from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import polars as pl

from shared.feature_store.feature_builder import FeatureMatrix


def _to_lowercase(series: pl.Series) -> pl.Series:
    if series.dtype != pl.Utf8:
        series = series.cast(pl.Utf8)
    return series.str.to_lowercase()


def _observation_types(series: pl.Series) -> List[str]:
    if series.is_null().all():
        return []
    lowered = _to_lowercase(series.fill_null("none"))
    values = {str(value) for value in lowered.unique().to_list() if value is not None}
    if "none" in values:
        values.remove("none")
    return sorted(values)


def _as_of_range(frame: pl.DataFrame) -> Optional[Dict[str, str]]:
    if "as_of_utc" not in frame.columns or frame.is_empty():
        return None
    series = frame.get_column("as_of_utc").drop_nulls()
    if series.is_empty():
        return None
    values = [str(value) for value in series.to_list()]
    return {"min": min(values), "max": max(values)}


def generate_weather_join_report(
    matrix: FeatureMatrix,
    *,
    tenant_id: str,
    window_start: datetime,
    window_end: datetime,
    geocoded_ratio: Optional[float],
    output_path: str | Path,
) -> Dict[str, Any]:
    """
    Persist a JSON report describing the weather join quality for a tenant.

    The report highlights join mode, geocoding coverage, leakage guardrail status,
    and per-geohash observation summaries so analysts can spot future leakage risks.
    """

    frame = matrix.frame
    coverage: List[Dict[str, Any]] = []
    unique_geohashes: List[Optional[str]] = []

    if "geohash" in frame.columns and not frame.is_empty():
        partitions = frame.partition_by("geohash", maintain_order=True)
        for partition in partitions:
            if partition.is_empty():
                continue
            geohash_value = partition.get_column("geohash")[0] if "geohash" in partition.columns else None
            unique_geohashes.append(geohash_value if geohash_value is not None else None)

            target_rows = int(partition.filter(pl.col("target_available")).height) if "target_available" in partition.columns else 0
            if "observation_type" in partition.columns:
                obs_series = partition.get_column("observation_type")
                observation_types = _observation_types(obs_series)
                obs_lower = _to_lowercase(obs_series.fill_null("none"))
                forecast_rows = int((obs_lower == "forecast").sum())
            else:
                observation_types = []
                forecast_rows = 0
            missing_dates = sorted(
                {
                    record.get("date")
                    for record in matrix.weather_missing_records
                    if record.get("geohash") == geohash_value
                }
            )

            entry: Dict[str, Any] = {
                "geohash": geohash_value,
                "row_count": int(partition.height),
                "target_rows": target_rows,
                "observation_types": observation_types,
                "forecast_rows": forecast_rows,
                "missing_weather_dates": [date for date in missing_dates if date is not None],
            }

            as_of_range = _as_of_range(partition)
            if as_of_range:
                entry["as_of_utc"] = as_of_range

            coverage.append(entry)

    geocoded_ratio_value = None if geocoded_ratio is None else round(float(geocoded_ratio), 4)

    weather_missing_dates = sorted(
        {record.get("date") for record in matrix.weather_missing_records if record.get("date") is not None}
    )

    issues: List[str] = []
    if matrix.join_mode == "date_only":
        issues.append("Orders lacked reliable geohashes; weather join fell back to date-only mode.")
    if geocoded_ratio is None:
        issues.append("Orders dataset missing ship_geohash column; unable to compute geocoding ratio.")
    elif geocoded_ratio < 0.8:
        issues.append(f"Low geocoded order ratio detected ({geocoded_ratio_value}); investigate geocoding coverage.")
    if matrix.weather_missing_rows > 0:
        issues.append(
            f"Missing weather metrics on {matrix.weather_missing_rows} rows covering dates {weather_missing_dates}."
        )
    if matrix.leakage_risk_rows > 0:
        issues.append(
            "Leakage guardrail activated; forward or forecast rows were removed before producing the matrix."
        )

    report: Dict[str, Any] = {
        "tenant_id": tenant_id,
        "generated_at": datetime.utcnow().isoformat(),
        "window": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
        },
        "join": {
            "mode": matrix.join_mode,
            "orders_rows": matrix.orders_rows,
            "weather_rows": matrix.weather_rows,
            "feature_rows": int(frame.height),
            "observed_target_rows": matrix.observed_rows,
            "geocoded_order_ratio": geocoded_ratio_value,
        },
        "leakage": {
            "total_rows": matrix.leakage_risk_rows,
            "dates": matrix.leakage_risk_dates,
            "forward_rows": matrix.forward_leakage_rows,
            "forward_dates": matrix.forward_leakage_dates,
            "forecast_rows": matrix.forecast_leakage_rows,
            "forecast_dates": matrix.forecast_leakage_dates,
        },
        "weather_gaps": {
            "rows": matrix.weather_missing_rows,
            "dates": weather_missing_dates,
        },
        "coverage": {
            "geohashes": coverage,
            "unique_geohash_count": len({value for value in unique_geohashes if value is not None}),
        },
        "issues": issues,
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report
