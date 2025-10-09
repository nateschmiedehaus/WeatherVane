from datetime import datetime

import pytest

pytest.importorskip("sqlalchemy", reason="PlanService context test requires SQLAlchemy")

from apps.api.services.plan_service import PlanService, _incrementality_store
from shared.data_context.service import ContextService
from shared.data_context.models import DatasetProfile


class DummyPlanRepository:
    async def latest_plan(self, tenant_id: str):  # pragma: no cover - simple stub
        return None


@pytest.mark.asyncio
async def test_plan_service_includes_context_tags(tmp_path):
    context_service = ContextService(root=tmp_path)
    profile = DatasetProfile(
        name="orders",
        row_count=5,
        null_ratios={"net_revenue": 0.0},
        latest_timestamp=datetime.utcnow(),
        coverage={"net_revenue": 1.0},
    )
    context_service.record_profile("tenant", profile)
    context_service.snapshot("tenant", metadata={"weather_source": "stub"})

    plan_service = PlanService(DummyPlanRepository(), context_service)
    response = await plan_service.get_latest_plan("tenant", horizon_days=3)

    assert "weather.stubbed" in response.context_tags
    assert response.data_context is not None
    assert any(warning.code == "weather_stubbed" for warning in response.context_warnings)


@pytest.mark.asyncio
async def test_plan_service_includes_incrementality_summary(tmp_path, monkeypatch):
    monkeypatch.setenv("INCREMENTALITY_STORE_ROOT", str(tmp_path))
    _incrementality_store.cache_clear()
    try:
        store = _incrementality_store()
        design_payload = {
            "status": "ready",
            "geo_count": 6,
            "holdout_count": 2,
            "holdout_ratio": 0.25,
            "control_share": 0.33,
            "assignment": [
                {"geo": "geo_a", "group": "treatment", "weight": 0.5},
                {"geo": "geo_b", "group": "control", "weight": 0.5},
            ],
        }
        summary_payload = {
            "treatment_mean": 120.0,
            "control_mean": 100.0,
            "absolute_lift": 20.0,
            "lift": 0.2,
            "p_value": 0.03,
            "conf_low": 5.0,
            "conf_high": 35.0,
            "sample_size_treatment": 10,
            "sample_size_control": 8,
            "generated_at": datetime.utcnow().isoformat(),
            "is_significant": True,
        }
        store.save(
            "designs",
            "tenant",
            {
                "design": design_payload,
                "summary": summary_payload,
            },
        )

        plan_service = PlanService(DummyPlanRepository())
        response = await plan_service.get_latest_plan("tenant", horizon_days=1)

        assert response.incrementality_design is not None
        assert response.incrementality_design.status == "ready"
        assert response.incrementality_summary is not None
        assert response.incrementality_summary.lift == summary_payload["lift"]
        assert response.incrementality_summary.sample_size_control == summary_payload["sample_size_control"]
    finally:
        _incrementality_store.cache_clear()
