import math
import pytest

from apps.model.feedback import quantile_coverage, widen_prediction_band


@pytest.mark.parametrize(
    "actuals, lower, upper, expected",
    [
        ([100, 110, 90, 105], [80, 85, 75, 80], [120, 125, 115, 120], 1.0),
        ([150, 160, 170], [140, 150, 160], [155, 165, 165], 2 / 3),
    ],
)
def test_quantile_coverage(actuals, lower, upper, expected):
    result = quantile_coverage(actuals, lower, upper)
    assert pytest.approx(result.coverage, abs=0.1) == expected
    assert result.total == len(actuals)


def test_widen_prediction_band_scalar():
    lower = [10, 12]
    upper = [20, 22]
    w_lower, w_upper = widen_prediction_band(lower, upper, inflation=0.2)
    assert all(math.isclose(value, expected, rel_tol=1e-6) for value, expected in zip(w_lower, [8, 10]))
    assert all(math.isclose(value, expected, rel_tol=1e-6) for value, expected in zip(w_upper, [22, 24]))


def test_widen_prediction_band_vector():
    lower = [100, 90]
    upper = [140, 110]
    factors = [0.1, 0.5]
    w_lower, w_upper = widen_prediction_band(lower, upper, factors)
    assert all(math.isclose(value, expected, rel_tol=1e-6) for value, expected in zip(w_lower, [96, 80]))
    assert all(math.isclose(value, expected, rel_tol=1e-6) for value, expected in zip(w_upper, [144, 120]))
