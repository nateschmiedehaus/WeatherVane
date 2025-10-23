from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import taxonomy
from apps.api.services.product_taxonomy import ProductTaxonomyService
from shared.services.weather_taxonomy import WeatherTaxonomyClassifier


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_classify_products_endpoint_returns_taxonomy(api_app):
    payload = {
        "records": [
            {
                "tenant_id": "tenant-umbrella",
                "canonical_product_id": "umbrella-123",
                "product_id": "shopify:umbrella-123",
                "source": "shopify",
                "product_name": "StormGuard Travel Umbrella",
                "category": "Accessories > Umbrella",
                "tags": ["Umbrella", "Rain", "Waterproof"],
                "description": "Compact umbrella designed for heavy rain days.",
            }
        ]
    }

    with TestClient(api_app) as client:
        response = client.post("/v1/taxonomy/classify", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    [entry] = data["entries"]
    assert entry["category_l2"] == "umbrellas"
    assert entry["weather_affinity"] == "rain"
    assert entry["seasonality"] == "weather_triggered"


def test_classify_products_requires_records(api_app):
    with TestClient(api_app) as client:
        response = client.post("/v1/taxonomy/classify", json={"records": []})

    assert response.status_code == 422


def test_classify_products_handles_service_errors(api_app):
    class _FailingTaxonomyService(ProductTaxonomyService):
        def classify(self, records):
            raise ValueError("synthetic failure")

    api_app.dependency_overrides[taxonomy.get_taxonomy_service] = lambda: _FailingTaxonomyService()

    payload = {
        "records": [
            {
                "tenant_id": "tenant-umbrella",
                "canonical_product_id": "umbrella-123",
                "product_id": "shopify:umbrella-123",
                "source": "shopify",
                "product_name": "StormGuard Travel Umbrella",
            }
        ]
    }

    with TestClient(api_app) as client:
        response = client.post("/v1/taxonomy/classify", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "synthetic failure"


def test_classify_weather_returns_enhanced_taxonomy(api_app):
    payload = {
        "records": [
            {
                "tenant_id": "tenant-umbrella",
                "canonical_product_id": "umbrella-123",
                "product_id": "shopify:umbrella-123",
                "source": "shopify",
                "title": "UV Protection Beach Umbrella",
                "category": "Outdoor",
                "subcategory": "Beach",
                "vendor": "BeachCo",
                "brand": "SunSafe",
                "tags": ["summer", "beach", "sun protection"],
                "description": "High-quality beach umbrella with UV protection",
                "raw_attributes": {}
            }
        ]
    }

    class _MockWeatherTaxonomyClassifier(WeatherTaxonomyClassifier):
        def __init__(self):
            super().__init__()
            self.llm_client = None

        def classify_with_weather(self, records, **kwargs):
            return WeatherTaxonomyResult(
                category_l1="outdoor",
                category_l2="sun_protection",
                weather_affinity="heat",
                seasonality="seasonal_q2_q3",
                confidence=0.95,
                reasoning="Test reasoning",
                model="mock-model",
                raw_payload={},
                weather_sensitivity=0.9,
                temperature_correlation="strong_positive",
                uv_correlation="strong_positive",
                precipitation_correlation="negative"
            )

    api_app.dependency_overrides[taxonomy.get_weather_taxonomy_service] = lambda: _MockWeatherTaxonomyClassifier()

    with TestClient(api_app) as client:
        response = client.post("/v1/taxonomy/classify-weather", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["category_l1"] == "outdoor"
    assert data["category_l2"] == "sun_protection"
    assert data["weather_affinity"] == "heat"
    assert data["seasonality"] == "seasonal_q2_q3"
    assert data["confidence"] == pytest.approx(0.95)
    assert data["weather_sensitivity"] == pytest.approx(0.9)
    assert data["temperature_correlation"] == "strong_positive"
    assert data["uv_correlation"] == "strong_positive"
    assert data["precipitation_correlation"] == "negative"


def test_classify_weather_requires_records(api_app):
    with TestClient(api_app) as client:
        response = client.post("/v1/taxonomy/classify-weather", json={"records": []})

    assert response.status_code == 422


def test_classify_weather_handles_service_errors(api_app):
    class _FailingWeatherTaxonomyClassifier(WeatherTaxonomyClassifier):
        def classify_with_weather(self, records, **kwargs):
            raise ValueError("synthetic failure")

    api_app.dependency_overrides[taxonomy.get_weather_taxonomy_service] = lambda: _FailingWeatherTaxonomyClassifier()

    payload = {
        "records": [
            {
                "tenant_id": "tenant-umbrella",
                "canonical_product_id": "umbrella-123",
                "product_id": "shopify:umbrella-123",
                "source": "shopify",
                "title": "UV Protection Beach Umbrella",
                "category": "Outdoor",
                "raw_attributes": {}
            }
        ]
    }

    with TestClient(api_app) as client:
        response = client.post("/v1/taxonomy/classify-weather", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "synthetic failure"

