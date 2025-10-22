from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient
import pytest

from apps.api.main import app


def _observations(treated_delta: float) -> list[dict[str, object]]:
    start = date(2024, 1, 1)
    rows: list[dict[str, object]] = []
    for offset in range(14):
        current = start + timedelta(days=offset)
        trend = 95.0 + 1.2 * offset
        post = offset >= 7
        treated_value = trend + (treated_delta if post else 0.0)
        control_value = trend
        rows.append({"geo": "treated", "date": current.isoformat(), "value": treated_value, "is_treated": True})
        rows.append({"geo": "control", "date": current.isoformat(), "value": control_value, "is_treated": False})
    return rows


def test_weather_shock_analysis_endpoint_returns_effect() -> None:
    client = TestClient(app)
    payload = {
        "observations": _observations(treated_delta=5.5),
        "shock_start": "2024-01-08",
        "synthetic_control": False,
    }

    response = client.post("/v1/weather/shock-analysis", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["effect"] == pytest.approx(5.5, abs=0.3)
    assert body["weights"]["control"] == pytest.approx(1.0, abs=1e-6)
    assert body["n_pre"] == 7
    assert body["n_post"] == 7


def test_weather_shock_analysis_endpoint_handles_invalid_frame() -> None:
    client = TestClient(app)
    payload = {
        "observations": [
            {"geo": "treated", "date": "2024-01-01", "value": 100.0, "is_treated": True},
        ],
        "shock_start": "2024-01-08",
    }

    response = client.post("/v1/weather/shock-analysis", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert "detail" in body
