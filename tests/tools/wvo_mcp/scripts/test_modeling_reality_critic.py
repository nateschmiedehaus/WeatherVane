from __future__ import annotations

import importlib.util
import sys
import textwrap
from pathlib import Path

def _load_module() -> object:
    root = Path(__file__).resolve().parents[4]
    script_path = root / "tools" / "wvo_mcp" / "scripts" / "run_modeling_reality_critic.py"
    spec = importlib.util.spec_from_file_location("run_modeling_reality_critic", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)  # type: ignore[assignment]
    return module


MODULE = _load_module()


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).strip() + "\n", encoding="utf-8")


def test_mmm_lightweight_detects_indirect_integration(tmp_path: Path) -> None:
    _write(
        tmp_path / "apps" / "model" / "pipelines" / "poc_models.py",
        """
        from apps.model.mmm import fit_mmm_model

        def train_poc_models(frame):
            return fit_mmm_model(frame, spend_cols=["facebook_spend"], revenue_col="net_revenue")
        """,
    )
    _write(tmp_path / "apps" / "model" / "mmm_lightweight.py", "def available():\n    return True\n")
    _write(
        tmp_path / "apps" / "model" / "mmm.py",
        """
        from . import mmm_lightweight

        def fit_mmm_model(frame, spend_cols, revenue_col):
            if mmm_lightweight.available():
                return mmm_lightweight.fit_lightweight_mmm(frame, spend_cols, frame[revenue_col])
            return _fit_heuristic_mmm(frame, spend_cols, revenue_col)

        def _fit_heuristic_mmm(*_args, **_kwargs):
            return {"source": "heuristic"}
        """,
    )

    ctx = MODULE.collect_context(tmp_path)
    assert ctx.pipeline_uses_lightweight is True
    findings = list(MODULE.check_mmm_lightweight(tmp_path, ctx))
    assert findings == []


def test_causal_method_warns_when_weather_service_not_wired(tmp_path: Path) -> None:
    _write(tmp_path / "shared" / "libs" / "causal" / "weather_shock.py", "def estimate_weather_shock_effect():\n    return None\n")
    _write(tmp_path / "apps" / "api" / "services" / "weather_service.py", "def analyze_weather_shock(payload):\n    return payload\n")

    ctx = MODULE.collect_context(tmp_path)
    findings = list(MODULE.check_causal_method(tmp_path, ctx))

    assert any(
        finding.severity == "CRITICAL" and "Weather API still bypasses the DID estimator" in finding.message
        for finding in findings
    ), "Expected a critical finding when weather_service missing the DID estimator integration"


def test_geo_hierarchy_accepts_dma_first_mapper(tmp_path: Path) -> None:
    _write(tmp_path / "shared" / "libs" / "geography" / "mapper.py", "class GeographyMapper:\n    ...\n")
    _write(tmp_path / "shared" / "data" / "geography" / "dma_county_crosswalk.csv", "county_fips,dma_code\n01001,100\n")
    _write(
        tmp_path / "docs" / "MODELING_REALITY_CHECK.md",
        """
        # Modeling Reality Check

        Reality check (Oct 2025 update): DMA-first hierarchy is live.
        """,
    )

    ctx = MODULE.collect_context(tmp_path)
    findings = list(MODULE.check_geo_hierarchy(tmp_path, ctx))

    assert findings == []
