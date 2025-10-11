import importlib.util
import sys
from pathlib import Path

import polars as pl
import pytest

MODULE_PATH = Path(__file__).resolve().parents[3] / "apps" / "model" / "causal_uplift.py"
spec = importlib.util.spec_from_file_location("causal_uplift_module", MODULE_PATH)
if spec is None or spec.loader is None:
    pytest.skip("causal uplift module spec unavailable", allow_module_level=True)
causal_uplift = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = causal_uplift
spec.loader.exec_module(causal_uplift)

compute_synthetic_report = causal_uplift.compute_synthetic_report
fit_causal_uplift = causal_uplift.fit_causal_uplift
generate_synthetic_dataset = causal_uplift.generate_synthetic_dataset
validate_incremental_lift = causal_uplift.validate_incremental_lift
save_report_as_json = causal_uplift.save_report_as_json


def test_fit_and_validate_causal_uplift_on_synthetic_data() -> None:
    frame = generate_synthetic_dataset(rows=1500, seed=7)
    model = fit_causal_uplift(frame, treatment_column="treatment", target_column="net_revenue")
    report = validate_incremental_lift(model, frame)

    assert report.sample_size == frame.height
    assert report.predicted_ate > 1.0
    assert report.observed_ate > 0.5
    assert 0.0 <= report.normalized_qini <= 1.0
    assert len(report.uplift_by_decile) == 10
    assert report.uplift_by_decile[0]["mean_predicted_uplift"] >= report.uplift_by_decile[-1]["mean_predicted_uplift"]


def test_compute_synthetic_report_is_consistent() -> None:
    report = compute_synthetic_report()
    assert report.sample_size == 2000
    assert 0.0 <= report.p_value <= 1.0
    # Doubly robust estimate should sit near predicted effect for the synthetic generator.
    assert abs(report.predicted_ate - report.observed_ate) < 0.5

    output_path = Path("experiments/causal/uplift_report.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    save_report_as_json(report, str(output_path))
    assert output_path.exists()


def test_fit_causal_uplift_requires_binary_treatment_column() -> None:
    frame = pl.DataFrame(
        {
            "net_revenue": [100.0, 110.0, 108.0, 95.0],
            "treatment": ["variant_a", "variant_b", "variant_c", "variant_a"],
            "feature": [0.1, 0.2, 0.3, 0.4],
        }
    )
    with pytest.raises(ValueError):
        fit_causal_uplift(frame, treatment_column="treatment", target_column="net_revenue")


def test_fit_causal_uplift_raises_with_single_arm() -> None:
    frame = generate_synthetic_dataset(rows=200, seed=11).with_columns(pl.lit(1).alias("treatment"))
    with pytest.raises(ValueError):
        fit_causal_uplift(frame, treatment_column="treatment", target_column="net_revenue")
