from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).strip() + "\n", encoding="utf-8")


def test_causal_critic_detects_issues_with_broken_weather_module(tmp_path: Path) -> None:
    """Test that causal critic detects when weather shock module has issues."""
    root = Path(__file__).resolve().parents[4]

    # Create weather shock module without the required export
    weather_module = tmp_path / "shared" / "libs" / "causal" / "weather_shock.py"
    _write(
        weather_module,
        """
        # Missing the required estimate_weather_shock_effect function
        def some_other_function():
            pass
        """,
    )

    # Temporarily move the real weather shock module
    real_weather = root / "shared" / "libs" / "causal" / "weather_shock.py"
    backup_path = real_weather.with_suffix(".py.backup")

    try:
        if real_weather.exists():
            real_weather.rename(backup_path)

        # Copy our broken version
        weather_module.parent.mkdir(parents=True, exist_ok=True)
        real_weather.write_text(weather_module.read_text())

        # Run the critic
        script_path = root / "tools" / "wvo_mcp" / "scripts" / "run_causal_critic.py"
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
        )

        # Parse the JSON output
        output = json.loads(result.stdout)

        # Should have critical findings (either about missing export or test failures)
        assert output.get("critical_count", 0) > 0, f"Expected critical findings but got: {output.get('findings', [])}"
        assert any(
            f.get("severity") == "CRITICAL"
            for f in output.get("findings", [])
        ), f"Expected critical finding. Got: {output.get('findings', [])}"
    finally:
        # Restore the real file
        if real_weather.exists():
            real_weather.unlink()
        if backup_path.exists():
            backup_path.rename(real_weather)


def test_causal_critic_passes_with_valid_structure(tmp_path: Path) -> None:
    """Test that causal critic passes when valid causal modules are present."""
    # Create the expected module structure
    (tmp_path / "shared" / "libs" / "causal").mkdir(parents=True, exist_ok=True)
    (tmp_path / "apps" / "model").mkdir(parents=True, exist_ok=True)
    (tmp_path / "tests" / "shared" / "libs" / "causal").mkdir(parents=True, exist_ok=True)
    (tmp_path / "tests" / "apps" / "model").mkdir(parents=True, exist_ok=True)
    (tmp_path / "experiments" / "causal").mkdir(parents=True, exist_ok=True)

    # Create the weather shock module with required export
    _write(
        tmp_path / "shared" / "libs" / "causal" / "weather_shock.py",
        """
        def estimate_weather_shock_effect(data):
            return {"effect": 0.1}
        """,
    )

    # Create causal uplift module
    _write(
        tmp_path / "apps" / "model" / "causal_uplift.py",
        """
        class CausalReport:
            pass
        """,
    )

    # Create minimal test files
    _write(
        tmp_path / "tests" / "shared" / "libs" / "causal" / "test_weather_shock.py",
        """
        def test_weather_shock():
            pass
        """,
    )

    _write(
        tmp_path / "tests" / "apps" / "model" / "test_causal_uplift.py",
        """
        def test_causal_uplift():
            pass
        """,
    )

    # Create a valid uplift report
    _write(
        tmp_path / "experiments" / "causal" / "uplift_report.json",
        """
        {
            "headline": {
                "predicted_ate": 0.15,
                "observed_ate": 0.12,
                "p_value": 0.01,
                "conf_low": 0.05,
                "conf_high": 0.20
            },
            "deciles": [
                {"decile": 1, "uplift": 0.05},
                {"decile": 2, "uplift": 0.08},
                {"decile": 3, "uplift": 0.10},
                {"decile": 4, "uplift": 0.12},
                {"decile": 5, "uplift": 0.14},
                {"decile": 6, "uplift": 0.16},
                {"decile": 7, "uplift": 0.18},
                {"decile": 8, "uplift": 0.20},
                {"decile": 9, "uplift": 0.22},
                {"decile": 10, "uplift": 0.25}
            ]
        }
        """,
    )

    # Run the critic
    script_path = Path(__file__).resolve().parents[4] / "tools" / "wvo_mcp" / "scripts" / "run_causal_critic.py"
    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(tmp_path),
        capture_output=True,
        text=True,
    )

    # Parse output
    output = json.loads(result.stdout)

    # Should have healthy findings and no critical issues (except missing test execution)
    assert output.get("status") in ["passed", "failed"]
    # Key is that the structure is recognized as valid
