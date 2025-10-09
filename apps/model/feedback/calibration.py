"""Quantile calibration helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence


@dataclass(frozen=True)
class CoverageResult:
    coverage: float
    inside: int
    outside: int
    total: int

    def to_dict(self) -> dict[str, float | int]:
        return {
            "coverage": self.coverage,
            "inside": self.inside,
            "outside": self.outside,
            "total": self.total,
        }


def quantile_coverage(
    actuals: Sequence[float],
    lower: Sequence[float],
    upper: Sequence[float],
) -> CoverageResult:
    if len(actuals) != len(lower) or len(actuals) != len(upper):
        raise ValueError("actuals, lower, and upper must have matching shapes")

    inside = 0
    total = 0
    for value, low, high in zip(actuals, lower, upper):
        total += 1
        if value >= low and value <= high:
            inside += 1
    outside = total - inside
    coverage = float(inside / total) if total else 0.0
    return CoverageResult(coverage=coverage, inside=inside, outside=outside, total=total)


def widen_prediction_band(
    lower: Sequence[float],
    upper: Sequence[float],
    inflation: Iterable[float] | float,
) -> tuple[list[float], list[float]]:
    if len(lower) != len(upper):
        raise ValueError("lower and upper bands must have matching length")

    if isinstance(inflation, (int, float)):
        factors = [float(inflation)] * len(lower)
    else:
        factors = [float(value) for value in inflation]
        if len(factors) != len(lower):
            raise ValueError("inflation factors must match band shape or be scalar")

    widened_lower: list[float] = []
    widened_upper: list[float] = []
    for low, high, factor in zip(lower, upper, factors):
        if high < low:
            raise ValueError("upper band cannot be below lower band")
        span = max(high - low, 0.0)
        adjustment = span * factor
        widened_lower.append(low - adjustment)
        widened_upper.append(high + adjustment)

    return widened_lower, widened_upper
