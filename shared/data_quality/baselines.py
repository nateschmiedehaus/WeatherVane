from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Mapping, MutableMapping, Sequence


Number = float | int


@dataclass(frozen=True)
class GuardrailTargets:
    """Recommended guardrail thresholds derived from research baselines."""

    geocoded_ratio_warning: float = 0.88
    geocoded_ratio_critical: float = 0.75
    row_count_drop_warning: float = 0.8
    row_count_drop_critical: float = 0.6


def _load_json(path: Path) -> Mapping[str, object]:
    if not path.exists():
        raise FileNotFoundError(f"Expected JSON source missing: {path}")
    return json.loads(path.read_text())


def _quantile(sorted_values: Sequence[Number], q: float) -> float:
    """Return linear-interpolated quantile."""
    if not sorted_values:
        raise ValueError("quantile requires at least one value")
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    clamped = min(1.0, max(0.0, q))
    idx = (len(sorted_values) - 1) * clamped
    lower = math.floor(idx)
    upper = math.ceil(idx)
    if lower == upper:
        return float(sorted_values[lower])
    weight = idx - lower
    lower_val = float(sorted_values[lower])
    upper_val = float(sorted_values[upper])
    return lower_val + (upper_val - lower_val) * weight


def _summarise(values: Iterable[Number]) -> Mapping[str, Number]:
    data = [float(v) for v in values if v is not None]
    if not data:
        return {}
    data.sort()
    return {
        "count": len(data),
        "min": data[0],
        "max": data[-1],
        "mean": sum(data) / len(data),
        "p05": _quantile(data, 0.05),
        "p50": _quantile(data, 0.5),
        "p95": _quantile(data, 0.95),
    }


def compute_dataset_baselines(history_runs: Sequence[Mapping[str, object]]) -> Mapping[str, Mapping[str, object]]:
    datasets: MutableMapping[str, dict[str, object]] = defaultdict(lambda: {
        "row_count": [],
        "new_rows": [],
        "updated_rows": [],
        "geocoded_ratio": [],
        "alerts": Counter(),
        "severities": Counter(),
    })

    for run in history_runs:
        datasets_payload = run.get("datasets") or {}
        for dataset_name, dataset_payload in datasets_payload.items():
            bucket = datasets[dataset_name]
            bucket["row_count"].append(dataset_payload.get("row_count"))

            metadata = dataset_payload.get("metrics") or dataset_payload.get("metadata") or {}
            bucket["new_rows"].append(metadata.get("new_rows"))
            bucket["updated_rows"].append(metadata.get("updated_rows"))
            bucket["geocoded_ratio"].append(metadata.get("geocoded_ratio"))

            for alert in dataset_payload.get("alerts", []):
                bucket["alerts"][alert] += 1
            severity = dataset_payload.get("severity")
            if severity:
                bucket["severities"][severity] += 1

    summary: dict[str, dict[str, object]] = {}
    guardrails = GuardrailTargets()

    for dataset_name, bucket in datasets.items():
        dataset_summary: dict[str, object] = {
            "row_count": _summarise(bucket["row_count"]),
            "new_rows": _summarise(bucket["new_rows"]),
            "updated_rows": _summarise(bucket["updated_rows"]),
            "geocoded_ratio": _summarise(bucket["geocoded_ratio"]),
        }

        alerts_counter: Counter[str] = bucket["alerts"]
        if alerts_counter:
            dataset_summary["top_alerts"] = [
                {"code": code, "count": count}
                for code, count in alerts_counter.most_common()
            ]
        severities_counter: Counter[str] = bucket["severities"]
        if severities_counter:
            dataset_summary["severity_distribution"] = dict(severities_counter)

        dataset_summary["recommended_guardrails"] = {
            "geocoded_ratio": {
                "warning": guardrails.geocoded_ratio_warning,
                "critical": guardrails.geocoded_ratio_critical,
            },
            "row_count_drop": {
                "warning": guardrails.row_count_drop_warning,
                "critical": guardrails.row_count_drop_critical,
            },
        }

        summary[dataset_name] = dataset_summary

    return summary


def build_baseline_payload(dq_monitoring_path: Path) -> Mapping[str, object]:
    monitoring = _load_json(dq_monitoring_path)
    runs = monitoring.get("runs") or []
    baseline = compute_dataset_baselines(runs)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": str(dq_monitoring_path),
        "run_count": len(runs),
        "datasets": baseline,
    }


def compute_geocoding_stats(geocoding_files: Sequence[Path]) -> Mapping[str, object]:
    tenants: list[dict[str, object]] = []
    ratios: list[float] = []
    below_threshold: list[str] = []

    for path in geocoding_files:
        payload = _load_json(path)
        ratio = float(payload.get("ratio", 0))
        threshold = float((payload.get("details") or {}).get("threshold", 0.0))
        tenant_entry = {
            "tenant_id": payload.get("tenant_id"),
            "ratio": ratio,
            "row_count": payload.get("row_count"),
            "threshold": threshold,
            "status": payload.get("status"),
            "source": str(path),
        }
        tenants.append(tenant_entry)
        ratios.append(ratio)
        if ratio < threshold:
            below_threshold.append(str(payload.get("tenant_id")))

    return {
        "tenants": tenants,
        "ratio_summary": _summarise(ratios),
        "tenants_below_threshold": below_threshold,
    }


def build_geocoding_report(
    geocoding_root: Path,
    weather_join_report: Path,
) -> Mapping[str, object]:
    geocoding_files = sorted(geocoding_root.glob("*.json"))
    stats = compute_geocoding_stats(geocoding_files)
    weather_report = _load_json(weather_join_report)

    coverage = weather_report.get("coverage") or {}
    join = weather_report.get("join") or {}

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "geocoding": str(geocoding_root),
            "weather_join_report": str(weather_join_report),
        },
        "geocoding": stats,
        "weather": {
            "unique_geohash_count": coverage.get("unique_geohash_count"),
            "geohash_summaries": coverage.get("geohashes"),
            "geocoded_order_ratio": join.get("geocoded_order_ratio"),
            "feature_rows": join.get("feature_rows"),
            "orders_rows": join.get("orders_rows"),
            "weather_rows": join.get("weather_rows"),
        },
    }


def generate_reports(
    dq_monitoring_path: Path,
    geocoding_root: Path,
    weather_join_report: Path,
    baseline_output: Path,
    coverage_output: Path,
) -> None:
    baseline_payload = build_baseline_payload(dq_monitoring_path)
    coverage_payload = build_geocoding_report(geocoding_root, weather_join_report)

    baseline_output.parent.mkdir(parents=True, exist_ok=True)
    coverage_output.parent.mkdir(parents=True, exist_ok=True)

    baseline_output.write_text(json.dumps(baseline_payload, indent=2, sort_keys=True))
    coverage_output.write_text(json.dumps(coverage_payload, indent=2, sort_keys=True))
