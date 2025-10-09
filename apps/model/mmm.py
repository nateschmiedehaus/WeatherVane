"""Media mix modelling scaffold."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import polars as pl


@dataclass
class MMMModel:
    base_roas: float
    elasticity: Dict[str, float]
    mean_roas: Dict[str, float]
    mean_spend: Dict[str, float]
    features: List[str]

    def roas_for(self, feature: str, spend: float) -> float:
        base = self.mean_roas.get(feature, self.base_roas)
        mean = self.mean_spend.get(feature, 0.0)
        elasticity = self.elasticity.get(feature, 0.0)
        if mean <= 0:
            return max(base, 0.0)
        ratio = (spend - mean) / max(mean, 1e-6)
        return max(base + elasticity * ratio, 0.0)

    def marginal_roas(self, spend: Dict[str, float]) -> float:
        if not spend:
            return self.base_roas
        total_spend = 0.0
        total_revenue = 0.0
        for feature, amount in spend.items():
            total_spend += amount
            roas = self.roas_for(feature, amount)
            total_revenue += roas * amount
        if total_spend <= 0:
            return self.base_roas
        return total_revenue / total_spend


def fit_mmm_model(frame: pl.DataFrame, spend_cols: List[str], revenue_col: str) -> MMMModel:
    if frame.is_empty():
        return MMMModel(
            base_roas=0.0,
            elasticity={col: 0.0 for col in spend_cols},
            mean_roas={col: 0.0 for col in spend_cols},
            mean_spend={col: 0.0 for col in spend_cols},
            features=spend_cols,
        )

    total_spend = sum(frame[col].sum() for col in spend_cols if col in frame.columns)
    total_rev = frame[revenue_col].sum() if revenue_col in frame.columns else 0.0
    base_roas = (total_rev / total_spend) if total_spend else 0.0
    elasticity: Dict[str, float] = {}
    mean_roas: Dict[str, float] = {}
    mean_spend: Dict[str, float] = {}

    if spend_cols:
        total_spend_expr = pl.sum_horizontal(
            [pl.col(col).fill_null(0.0) for col in spend_cols if col in frame.columns]
        )
        frame = frame.with_columns(total_spend_expr.alias("__total_spend"))

    for col in spend_cols:
        if col not in frame.columns:
            elasticity[col] = 0.0
            mean_roas[col] = base_roas
            mean_spend[col] = 0.0
            continue

        spend_series = frame[col].fill_null(0.0)
        spend_sum = float(spend_series.sum())
        mean_spend_val = float(spend_series.mean() or 0.0)
        mean_spend[col] = mean_spend_val

        if spend_sum > 0:
            share_expr = pl.when(pl.col("__total_spend") <= 0).then(0.0).otherwise(pl.col(col) / pl.col("__total_spend"))
            revenue_share = float(
                frame.select((share_expr * pl.col(revenue_col)).fill_null(0.0).sum()).item()
            )
            channel_roas = revenue_share / spend_sum if spend_sum else base_roas
        else:
            revenue_share = 0.0
            channel_roas = base_roas

        mean_roas[col] = channel_roas

        variance = float(spend_series.var() or 0.0)
        if variance > 0:
            cov = float(frame.select(pl.cov(pl.col(col), pl.col(revenue_col))).item())
            elasticity_raw = cov / variance if variance else 0.0
        else:
            elasticity_raw = 0.0

        elasticity[col] = elasticity_raw

    # TODO(mmm): replace heuristic with Robyn/LightweightMMM once integrated.
    return MMMModel(
        base_roas=base_roas,
        elasticity=elasticity,
        mean_roas=mean_roas,
        mean_spend=mean_spend,
        features=spend_cols,
    )
