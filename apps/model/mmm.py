"""Media mix modelling scaffold."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import polars as pl


@dataclass
class MMMModel:
    base_roas: float
    elasticity: Dict[str, float]
    features: List[str]

    def marginal_roas(self, spend: Dict[str, float]) -> float:
        roas = self.base_roas
        for feature, coef in self.elasticity.items():
            roas += coef * spend.get(feature, 0.0)
        return roas


def fit_mmm_model(frame: pl.DataFrame, spend_cols: List[str], revenue_col: str) -> MMMModel:
    if frame.is_empty():
        return MMMModel(base_roas=0.0, elasticity={}, features=spend_cols)

    total_spend = sum(frame[col].sum() for col in spend_cols if col in frame.columns)
    total_rev = frame[revenue_col].sum() if revenue_col in frame.columns else 0.0
    base_roas = (total_rev / total_spend) if total_spend else 0.0
    elasticity = {col: 0.0 for col in spend_cols}
    # TODO(mmm): replace heuristic with Robyn/LightweightMMM once integrated.
    return MMMModel(base_roas=base_roas, elasticity=elasticity, features=spend_cols)
