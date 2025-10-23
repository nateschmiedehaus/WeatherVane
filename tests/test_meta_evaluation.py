import json
import os
from datetime import datetime
from pathlib import Path

import pytest

from shared.contracts.meta_evaluation_report import ModelingMetaEvaluator

@pytest.fixture
def meta_evaluator():
    return ModelingMetaEvaluator()

def test_evaluation_id_format(meta_evaluator):
    eval_id = meta_evaluator.generate_evaluation_id()
    assert eval_id.startswith("ME-")
    assert len(eval_id) == 19  # ME-YYYYMMDD-XXXXXXXX

def test_data_integrity_evaluation(meta_evaluator):
    score, findings = meta_evaluator.evaluate_data_integrity()
    assert isinstance(score, float)
    assert 0 <= score <= 100
    assert isinstance(findings, list)
    assert all(isinstance(f, str) for f in findings)

def test_model_performance_evaluation(meta_evaluator):
    score, findings = meta_evaluator.evaluate_model_performance()
    assert isinstance(score, float)
    assert 0 <= score <= 100
    assert isinstance(findings, list)
    assert all(isinstance(f, str) for f in findings)

def test_robustness_evaluation(meta_evaluator):
    score, findings = meta_evaluator.evaluate_robustness()
    assert isinstance(score, float)
    assert 0 <= score <= 100
    assert isinstance(findings, list)
    assert all(isinstance(f, str) for f in findings)

def test_observability_evaluation(meta_evaluator):
    score, findings = meta_evaluator.evaluate_observability()
    assert isinstance(score, float)
    assert 0 <= score <= 100
    assert isinstance(findings, list)
    assert all(isinstance(f, str) for f in findings)

def test_responsible_ai_evaluation(meta_evaluator):
    score, findings = meta_evaluator.evaluate_responsible_ai()
    assert isinstance(score, float)
    assert 0 <= score <= 100
    assert isinstance(findings, list)
    assert all(isinstance(f, str) for f in findings)

def test_report_generation(meta_evaluator):
    report = meta_evaluator.generate_report()

    # Check required fields
    assert "timestamp" in report
    assert "evaluation_id" in report
    assert "metrics" in report
    assert "criteria" in report
    assert "conclusion" in report

    # Check metrics
    metrics = report["metrics"]
    assert 0 <= metrics["model_pass_rate"] <= 1
    assert isinstance(metrics["mean_r2"], float)
    assert isinstance(metrics["mean_mape"], float)
    assert 0 <= metrics["quality_score"] <= 100

    # Check criteria scores
    criteria = report["criteria"]
    for key in ["data_integrity", "model_performance", "robustness", "observability", "responsible_ai"]:
        assert key in criteria
        assert "score" in criteria[key]
        assert "findings" in criteria[key]
        assert 0 <= criteria[key]["score"] <= 100
        assert isinstance(criteria[key]["findings"], list)

    # Check conclusion
    conclusion = report["conclusion"]
    assert "overall_status" in conclusion
    assert conclusion["overall_status"] in ["excellent", "good", "needs_improvement", "at_risk", "critical"]
    assert "key_risks" in conclusion
    assert "recommendations" in conclusion

def test_report_schema_validation(meta_evaluator):
    report = meta_evaluator.generate_report()
    # This will raise a ValidationError if schema validation fails
    meta_evaluator.schema.validate(report)

def test_report_file_output(meta_evaluator, tmp_path):
    report = meta_evaluator.generate_report()
    output_dir = tmp_path / "analytics"
    output_dir.mkdir()

    output_path = output_dir / f"meta_evaluation_{report['evaluation_id']}.json"
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)

    assert output_path.exists()
    with open(output_path) as f:
        loaded_report = json.load(f)
    assert loaded_report == report

def test_exit_code_based_on_quality(meta_evaluator, monkeypatch):
    def mock_exit(code):
        return code

    monkeypatch.setattr("sys.exit", mock_exit)

    # Test passing case (quality score >= 75)
    report = meta_evaluator.generate_report()
    if report["metrics"]["quality_score"] >= 75:
        assert meta_evaluator.main() == 0
    else:
        assert meta_evaluator.main() == 1