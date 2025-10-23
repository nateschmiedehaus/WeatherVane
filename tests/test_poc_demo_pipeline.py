"""Integration test for the PoC demo pipeline.

This test verifies that the minimal ML demo script can run end-to-end with
synthetic data, including data generation, feature building, model training,
and recommendation generation.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_minimal_ml_demo_runs():
    """Test that the minimal ML demo script runs successfully."""
    demo_script = Path("scripts/minimal_ml_demo.py")
    assert demo_script.exists(), f"Demo script not found: {demo_script}"

    # Run the demo script with minimal parameters
    result = subprocess.run(
        [sys.executable, str(demo_script), "--days", "30"],
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert result.returncode == 0, f"Demo script failed:\n{result.stderr}"
    assert "✅ Minimal ML demo pipeline complete" in result.stdout


def test_minimal_ml_demo_with_weather_shock():
    """Test that the demo script runs with weather shock enabled."""
    demo_script = Path("scripts/minimal_ml_demo.py")
    assert demo_script.exists(), f"Demo script not found: {demo_script}"

    # Run the demo script with weather shock
    result = subprocess.run(
        [sys.executable, str(demo_script), "--days", "90", "--seed-weather-shock"],
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert result.returncode == 0, f"Demo script with weather shock failed:\n{result.stderr}"
    assert "✅ Minimal ML demo pipeline complete" in result.stdout
    assert "📊 Marketing mix recommendation" in result.stdout


def test_minimal_ml_demo_generates_outputs():
    """Test that the demo script generates all expected output files."""
    demo_script = Path("scripts/minimal_ml_demo.py")
    output_dir = Path("tmp/demo_ml")

    # Run the demo script
    result = subprocess.run(
        [sys.executable, str(demo_script), "--days", "30", "--output", str(output_dir)],
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert result.returncode == 0, f"Demo script failed:\n{result.stderr}"

    # Verify expected output directories exist
    lake_dir = output_dir / "lake"
    models_dir = output_dir / "models"

    assert lake_dir.exists(), f"Lake directory not created: {lake_dir}"
    assert models_dir.exists(), f"Models directory not created: {models_dir}"

    # Verify data was generated
    assert list(lake_dir.glob("*_*.parquet")) or list(lake_dir.iterdir()), \
        f"No data generated in lake: {list(lake_dir.glob('**/*'))}"

    # Verify models were trained
    assert list(models_dir.glob("**/baseline_model.pkl")), \
        f"No baseline model generated in: {list(models_dir.glob('**/*'))}"
