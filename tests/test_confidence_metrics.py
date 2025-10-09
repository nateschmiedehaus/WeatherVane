from apps.worker.flows.poc_pipeline import _confidence_from_metrics
from shared.schemas.base import ConfidenceLevel


def test_confidence_from_metrics_low_default():
    metrics = {"row_count": 10, "holdout_r2": 0.0, "cv_mean": 0.0}
    assert _confidence_from_metrics(metrics) == ConfidenceLevel.LOW


def test_confidence_from_metrics_medium():
    metrics = {"row_count": 150, "holdout_r2": 0.3, "cv_mean": 0.1}
    assert _confidence_from_metrics(metrics) == ConfidenceLevel.MEDIUM


def test_confidence_from_metrics_high():
    metrics = {
        "row_count": 400,
        "holdout_r2": 0.7,
        "cv_mean": 0.25,
        "mae": 10.0,
        "rmse": 3.0,
    }
    assert _confidence_from_metrics(metrics) == ConfidenceLevel.HIGH
