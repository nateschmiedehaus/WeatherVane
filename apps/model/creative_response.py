"""Creative-level response modelling with brand safety guardrails.

This module scores individual creatives using smoothed performance metrics,
applies brand-safety guardrails, and produces a JSON report that downstream
dashboards can consume.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import json
import random

import polars as pl


REQUIRED_COLUMNS = {
    "creative_id",
    "channel",
    "impressions",
    "clicks",
    "conversions",
    "spend",
    "revenue",
    "brand_safety_score",
}


@dataclass(frozen=True)
class BrandSafetyPolicy:
    """Guardrails controlling creative activation."""

    roas_floor: float = 1.25
    warn_threshold: float = 0.6
    block_threshold: float = 0.3
    min_impressions: int = 250
    impression_prior: float = 80.0
    click_prior: float = 6.0
    conversion_prior: float = 3.0
    revenue_prior: float = 120.0
    spend_prior: float = 40.0

    def validate(self) -> None:
        if not (0.0 <= self.block_threshold <= 1.0):
            raise ValueError("block_threshold must be within [0, 1]")
        if not (0.0 <= self.warn_threshold <= 1.0):
            raise ValueError("warn_threshold must be within [0, 1]")
        if self.warn_threshold <= self.block_threshold:
            raise ValueError("warn_threshold must be greater than block_threshold")
        if self.roas_floor <= 0.0:
            raise ValueError("roas_floor must be positive")
        if self.min_impressions <= 0:
            raise ValueError("min_impressions must be positive")
        if any(value <= 0.0 for value in (self.impression_prior, self.click_prior, self.conversion_prior,
                                          self.revenue_prior, self.spend_prior)):
            raise ValueError("priors must be positive")


def _ensure_columns(frame: pl.DataFrame) -> pl.DataFrame:
    missing = REQUIRED_COLUMNS.difference(frame.columns)
    if missing:
        missing_str = ", ".join(sorted(missing))
        raise ValueError(f"Dataset is missing required columns: {missing_str}")
    return frame


def _brand_safety_factor(policy: BrandSafetyPolicy) -> pl.Expr:
    # Linear interpolation between block -> warn thresholds.
    span = max(policy.warn_threshold - policy.block_threshold, 1e-6)
    score = pl.col("brand_safety_score").fill_null(0.0).clip(0.0, 1.0)
    return (
        pl.when(score <= policy.block_threshold)
        .then(0.0)
        .when(score <= policy.warn_threshold)
        .then((score - policy.block_threshold) / span)
        .otherwise(1.0)
    )


def _sample_size_factor(policy: BrandSafetyPolicy) -> pl.Expr:
    impressions = pl.col("impressions").fill_null(0).cast(pl.Float64)
    return (
        pl.when(impressions <= 0)
        .then(0.0)
        .when(impressions < policy.min_impressions)
        .then(impressions / float(policy.min_impressions))
        .otherwise(1.0)
    )


def score_creatives(frame: pl.DataFrame, policy: BrandSafetyPolicy | None = None) -> pl.DataFrame:
    """Return smoothed creative scores with guardrail annotations."""

    policy = policy or BrandSafetyPolicy()
    policy.validate()
    if frame.is_empty():
        schema = {
            "creative_id": pl.Utf8,
            "channel": pl.Utf8,
            "impressions": pl.Int64,
            "clicks": pl.Int64,
            "conversions": pl.Int64,
            "spend": pl.Float64,
            "revenue": pl.Float64,
            "brand_safety_score": pl.Float64,
            "ctr": pl.Float64,
            "cvr": pl.Float64,
            "aov": pl.Float64,
            "roas_smoothed": pl.Float64,
            "roas_adjusted": pl.Float64,
            "guardrail_factor": pl.Float64,
            "status": pl.Utf8,
            "guardrail": pl.Utf8,
            "brand_safety_tier": pl.Utf8,
            "spend_share": pl.Float64,
            "profit_expectation": pl.Float64,
        }
        return pl.DataFrame(schema=schema)

    frame = _ensure_columns(frame)
    revenue = pl.col("revenue").fill_null(0.0).cast(pl.Float64)
    spend = pl.col("spend").fill_null(0.0).cast(pl.Float64)
    clicks = pl.col("clicks").fill_null(0).cast(pl.Float64)
    impressions = pl.col("impressions").fill_null(0).cast(pl.Float64)
    conversions = pl.col("conversions").fill_null(0).cast(pl.Float64)

    brand_safety_factor = _brand_safety_factor(policy)
    sample_size_factor = _sample_size_factor(policy)
    guardrail_factor = (brand_safety_factor * sample_size_factor).clip(0.0, 1.0)

    scored = frame.with_columns(
        [
            ((clicks + policy.click_prior) / (impressions + policy.impression_prior)).alias("ctr"),
            (
                (conversions + policy.conversion_prior)
                / (clicks + policy.click_prior)
            ).alias("cvr"),
            (
                (revenue + policy.revenue_prior)
                / (conversions + policy.conversion_prior)
            ).alias("aov"),
            (
                (revenue + policy.revenue_prior)
                / (spend + policy.spend_prior)
            ).alias("roas_smoothed"),
            brand_safety_factor.alias("brand_safety_factor"),
            sample_size_factor.alias("sample_size_factor"),
            guardrail_factor.alias("guardrail_factor"),
        ]
    ).with_columns(
        [
            (pl.col("roas_smoothed") * pl.col("guardrail_factor")).alias("roas_adjusted"),
            pl.when(pl.col("brand_safety_score") <= policy.block_threshold)
            .then(pl.lit("blocked"))
            .when(pl.col("brand_safety_score") <= policy.warn_threshold)
            .then(pl.lit("watchlist"))
            .otherwise(pl.lit("safe"))
            .alias("brand_safety_tier"),
        ]
    )

    scored = scored.with_columns(
        [
            pl.when(pl.col("guardrail_factor") <= 0.0)
            .then(pl.lit("blocked"))
            .when(pl.col("brand_safety_factor") < 1.0)
            .then(pl.lit("watchlist"))
            .when(pl.col("sample_size_factor") < 1.0)
            .then(pl.lit("watchlist"))
            .when(pl.col("roas_adjusted") < policy.roas_floor)
            .then(pl.lit("watchlist"))
            .otherwise(pl.lit("active"))
            .alias("status"),
            pl.when(pl.col("guardrail_factor") <= 0.0)
            .then(pl.lit("brand_safety_block"))
            .when(pl.col("brand_safety_factor") < 1.0)
            .then(pl.lit("brand_safety_watch"))
            .when(pl.col("sample_size_factor") < 1.0)
            .then(pl.lit("limited_sample"))
            .when(pl.col("roas_adjusted") < policy.roas_floor)
            .then(pl.lit("low_roas"))
            .otherwise(pl.lit(None))
            .alias("guardrail"),
            (
                pl.col("roas_adjusted") - policy.roas_floor
            ).alias("profit_expectation"),
        ]
    )

    total_spend = float(scored.get_column("spend").fill_null(0.0).sum())
    spend_share = (
        pl.col("spend").fill_null(0.0) / total_spend if total_spend > 0 else pl.lit(0.0)
    ).alias("spend_share")
    scored = scored.with_columns(spend_share)

    return scored.sort("roas_adjusted", descending=True)


def _build_channel_guardrails(scored: pl.DataFrame) -> List[Dict[str, Any]]:
    """Aggregate guardrail posture by channel with spend + status mix."""

    channel_frames = scored.partition_by("channel", maintain_order=True)
    summaries: List[Dict[str, Any]] = []

    for frame in channel_frames:
        metrics = frame.select(
            [
                pl.first("channel").alias("channel"),
                pl.len().alias("creative_count"),
                pl.col("status").eq("active").cast(pl.Int64).sum().alias("active_creatives"),
                pl.col("status").eq("watchlist").cast(pl.Int64).sum().alias("watchlist_creatives"),
                pl.col("status").eq("blocked").cast(pl.Int64).sum().alias("blocked_creatives"),
                pl.when(pl.col("status") == "active")
                .then(pl.col("spend_share"))
                .otherwise(0.0)
                .sum()
                .alias("active_spend_share"),
                pl.when(pl.col("status") == "watchlist")
                .then(pl.col("spend_share"))
                .otherwise(0.0)
                .sum()
                .alias("watchlist_spend_share"),
                pl.when(pl.col("status") == "blocked")
                .then(pl.col("spend_share"))
                .otherwise(0.0)
                .sum()
                .alias("blocked_spend_share"),
                pl.col("roas_adjusted").mean().alias("average_roas"),
                pl.col("brand_safety_score").mean().alias("average_brand_safety"),
            ]
        ).to_dicts()[0]

        guardrail_counts = (
            frame.filter(pl.col("guardrail").is_not_null())
            .group_by("guardrail")
            .agg(pl.len().alias("count"))
            .sort("count", descending=True)
            .to_dicts()
        )
        top_guardrail = guardrail_counts[0]["guardrail"] if guardrail_counts else None
        top_guardrail_count = int(guardrail_counts[0]["count"]) if guardrail_counts else 0

        flagged = frame.filter(pl.col("status") != "active")
        representative_creative = None
        representative_status = None
        if flagged.height > 0:
            representative_data = (
                flagged.sort(["guardrail_factor", "roas_adjusted"], descending=[False, True])
                .select(["creative_id", "status"])
                .to_dicts()[0]
            )
            representative_creative = representative_data["creative_id"]
            representative_status = representative_data["status"]

        watchlist_creatives = int(metrics["watchlist_creatives"])
        blocked_creatives = int(metrics["blocked_creatives"])
        watchlist_spend_share = float(metrics["watchlist_spend_share"])
        blocked_spend_share = float(metrics["blocked_spend_share"])

        summaries.append(
            {
                "channel": metrics["channel"],
                "creative_count": int(metrics["creative_count"]),
                "active_creatives": int(metrics["active_creatives"]),
                "watchlist_creatives": watchlist_creatives,
                "blocked_creatives": blocked_creatives,
                "flagged_creatives": watchlist_creatives + blocked_creatives,
                "active_spend_share": float(metrics["active_spend_share"]),
                "watchlist_spend_share": watchlist_spend_share,
                "blocked_spend_share": blocked_spend_share,
                "flagged_spend_share": watchlist_spend_share + blocked_spend_share,
                "average_roas": float(metrics["average_roas"] or 0.0),
                "average_brand_safety": float(metrics["average_brand_safety"] or 0.0),
                "top_guardrail": top_guardrail,
                "top_guardrail_count": top_guardrail_count,
                "representative_creative": representative_creative,
                "representative_status": representative_status,
            }
        )

    return sorted(summaries, key=lambda row: row["flagged_spend_share"], reverse=True)


def _round_columns(frame: pl.DataFrame, decimals: int) -> pl.DataFrame:
    numeric_cols = [
        name
        for name, dtype in zip(frame.columns, frame.dtypes)
        if dtype.is_numeric()
    ]
    if not numeric_cols:
        return frame
    return frame.with_columns([pl.col(col).round(decimals) for col in numeric_cols])


def generate_response_report(
    frame: pl.DataFrame,
    policy: BrandSafetyPolicy | None = None,
    *,
    output_path: str | Path,
) -> Dict[str, Any]:
    """Persist a JSON report capturing creative response metrics."""

    scored = score_creatives(frame, policy)
    policy = policy or BrandSafetyPolicy()
    status_rollup = (
        scored.group_by("status")
        .agg(
            pl.len().alias("count"),
            pl.col("spend_share").sum().alias("spend_share"),
        )
        .to_dicts()
    )
    status_lookup = {row["status"]: row for row in status_rollup}
    summary = {
        "creative_count": int(scored.height),
        "active_creatives": int(status_lookup.get("active", {}).get("count", 0)),
        "blocked_creatives": int(status_lookup.get("blocked", {}).get("count", 0)),
        "watchlist_creatives": int(status_lookup.get("watchlist", {}).get("count", 0)),
        "average_roas": float(scored.get_column("roas_adjusted").mean() or 0.0),
        "median_roas": float(scored.get_column("roas_adjusted").median() or 0.0),
        "active_spend_share": float(
            status_lookup.get("active", {}).get("spend_share", 0.0)
        ),
        "watchlist_spend_share": float(
            status_lookup.get("watchlist", {}).get("spend_share", 0.0)
        ),
        "blocked_spend_share": float(
            status_lookup.get("blocked", {}).get("spend_share", 0.0)
        ),
        "guardrail_counts": {},
    }

    guardrail_counts = (
        scored.filter(pl.col("guardrail").is_not_null())
        .group_by("guardrail")
        .agg(pl.len().alias("count"))
        .to_dicts()
    )
    if guardrail_counts:
        summary["guardrail_counts"] = {
            row["guardrail"]: int(row["count"]) for row in guardrail_counts
        }

    top_creatives = _round_columns(
        scored.head(5).select(
            [
                "creative_id",
                "channel",
                "roas_adjusted",
                "brand_safety_score",
                "status",
            ]
        ),
        decimals=4,
    )

    presentation = _round_columns(
        scored.select(
            [
                "creative_id",
                "channel",
                "impressions",
                "clicks",
                "conversions",
                "spend",
                "revenue",
                "brand_safety_score",
                "brand_safety_tier",
                "brand_safety_factor",
                "sample_size_factor",
                "ctr",
                "cvr",
                "aov",
                "roas_smoothed",
                "roas_adjusted",
                "guardrail_factor",
                "status",
                "guardrail",
                "spend_share",
                "profit_expectation",
            ]
        ),
        decimals=4,
    )

    channel_guardrails = _build_channel_guardrails(scored)

    report: Dict[str, Any] = {
        "generated_at": datetime.utcnow().isoformat(),
        "policy": {
            "roas_floor": policy.roas_floor,
            "warn_threshold": policy.warn_threshold,
            "block_threshold": policy.block_threshold,
            "min_impressions": policy.min_impressions,
        },
        "summary": summary,
        "top_creatives": top_creatives.to_dicts(),
        "creatives": presentation.to_dicts(),
        "channel_guardrails": channel_guardrails,
    }

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def generate_synthetic_creative_dataset(
    *,
    creatives: int = 12,
    seed: int = 11,
) -> pl.DataFrame:
    """Generate a reproducible synthetic dataset for modelling/tests."""

    rng = random.Random(seed)
    channels = ["meta", "search", "display"]
    records: List[Dict[str, Any]] = []
    for idx in range(creatives):
        channel = rng.choice(channels)
        impressions = rng.randint(400, 8000)
        ctr = rng.uniform(0.004, 0.045)
        clicks = max(1, int(impressions * ctr))
        cvr = rng.uniform(0.01, 0.08)
        conversions = max(0, int(clicks * cvr))
        spend = round(rng.uniform(180.0, 2200.0), 2)
        base_roas = rng.uniform(1.1, 3.8)
        revenue = round(spend * base_roas, 2)
        brand_safety = max(0.0, min(1.0, rng.gauss(0.72, 0.18)))
        # Force a couple of low-safety creatives for guardrail validation.
        if idx % 7 == 0:
            brand_safety = max(0.0, min(1.0, rng.uniform(0.1, 0.35)))
        records.append(
            {
                "creative_id": f"cr_{idx:03d}",
                "channel": channel,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "spend": float(spend),
                "revenue": float(revenue),
                "brand_safety_score": float(round(brand_safety, 4)),
            }
        )
    return pl.DataFrame(records)


__all__ = [
    "BrandSafetyPolicy",
    "generate_response_report",
    "generate_synthetic_creative_dataset",
    "score_creatives",
]
