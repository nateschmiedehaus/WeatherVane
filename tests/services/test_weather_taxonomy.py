from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest

from shared.schemas.product_taxonomy import ProductSourceRecord
from shared.services.weather_taxonomy import WeatherTaxonomyClassifier, WeatherTaxonomyResult

@dataclass
class MockLLMResponse:
    content: List[Dict[str, str]]
    model: str = "mock-model"

@dataclass
class MockLLMClient:
    responses: List[Dict[str, Any]]
    current_index: int = 0

    def messages_create(self, **kwargs) -> MockLLMResponse:
        if self.current_index >= len(self.responses):
            raise ValueError("No more mock responses")
        response = self.responses[self.current_index]
        self.current_index += 1
        return MockLLMResponse(content=[{"text": json.dumps(response)}])

def test_classifier_initialization():
    classifier = WeatherTaxonomyClassifier()
    assert classifier is not None
    assert isinstance(classifier.logger.name, str)

def test_weather_taxonomy_result_from_llm():
    base_payload = {
        "category_l1": "outdoor",
        "category_l2": "sun_protection",
        "weather_affinity": "heat",
        "seasonality": "seasonal_q2_q3",
        "confidence": 0.95,
        "reasoning": "Test reasoning",
        "weather_signals": {
            "sensitivity": 0.9,
            "correlations": {
                "temperature": "positive",
                "uv_index": "strong_positive",
                "precipitation": "negative"
            }
        }
    }

    base_result = WeatherTaxonomyResult(
        category_l1="outdoor",
        category_l2="sun_protection",
        weather_affinity="heat",
        seasonality="seasonal_q2_q3",
        confidence=0.95,
        reasoning="Test reasoning",
        model="test-model",
        raw_payload=base_payload,
        weather_sensitivity=0.9,
        temperature_correlation="positive",
        uv_correlation="strong_positive",
        precipitation_correlation="negative"
    )

    weather_signals = base_payload["weather_signals"]
    result = WeatherTaxonomyResult.from_llm_result(base_result, weather_signals)

    assert result.weather_sensitivity == 0.9
    assert result.temperature_correlation == "positive"
    assert result.uv_correlation == "strong_positive"
    assert result.precipitation_correlation == "negative"

def test_classify_with_weather_success():
    mock_response = {
        "category_l1": "outdoor",
        "category_l2": "sun_protection",
        "weather_affinity": "heat",
        "seasonality": "seasonal_q2_q3",
        "confidence": 0.95,
        "reasoning": "Test reasoning",
        "weather_signals": {
            "sensitivity": 0.9,
            "correlations": {
                "temperature": "positive",
                "uv_index": "strong_positive",
                "precipitation": "negative"
            }
        }
    }

    mock_client = MockLLMClient(responses=[mock_response])
    classifier = WeatherTaxonomyClassifier(llm_client=mock_client)

    records = [
        ProductSourceRecord(
            tenant_id="test",
            canonical_product_id="test-1",
            product_id="1",
            source="shopify",
            title="UV Protection Beach Umbrella",
            category="Outdoor",
            subcategory="Beach",
            vendor="BeachCo",
            brand="SunSafe",
            tags=["summer", "beach", "sun protection"],
            description="High-quality beach umbrella with UV protection",
            raw_attributes={}
        )
    ]

    result = classifier.classify_with_weather(records)
    assert result is not None
    assert result.category_l1 == "outdoor"
    assert result.category_l2 == "sun_protection"
    assert result.weather_affinity == "heat"
    assert result.weather_sensitivity == 0.9
    assert result.temperature_correlation == "positive"
    assert result.uv_correlation == "strong_positive"
    assert result.precipitation_correlation == "negative"

def test_classify_with_weather_no_signals():
    mock_response = {
        "category_l1": "outdoor",
        "category_l2": "sun_protection",
        "weather_affinity": "heat",
        "seasonality": "seasonal_q2_q3",
        "confidence": 0.95,
        "reasoning": "Test reasoning"
        # No weather_signals
    }

    mock_client = MockLLMClient(responses=[mock_response])
    classifier = WeatherTaxonomyClassifier(llm_client=mock_client)

    records = [
        ProductSourceRecord(
            tenant_id="test",
            canonical_product_id="test-1",
            product_id="1",
            source="shopify",
            title="UV Protection Beach Umbrella",
            category="Outdoor",
            subcategory="Beach",
            vendor="BeachCo",
            brand="SunSafe",
            tags=["summer", "beach", "sun protection"],
            description="High-quality beach umbrella with UV protection",
            raw_attributes={}
        )
    ]

    result = classifier.classify_with_weather(records)
    assert result is None

def test_classify_with_weather_invalid_signals():
    mock_response = {
        "category_l1": "outdoor",
        "category_l2": "sun_protection",
        "weather_affinity": "heat",
        "seasonality": "seasonal_q2_q3",
        "confidence": 0.95,
        "reasoning": "Test reasoning",
        "weather_signals": {
            "sensitivity": "invalid",  # Should be float
            "correlations": {
                "temperature": "invalid",
                "uv_index": 123,  # Should be string
                "precipitation": None  # Should be string
            }
        }
    }

    mock_client = MockLLMClient(responses=[mock_response])
    classifier = WeatherTaxonomyClassifier(llm_client=mock_client)

    records = [
        ProductSourceRecord(
            tenant_id="test",
            canonical_product_id="test-1",
            product_id="1",
            source="shopify",
            title="UV Protection Beach Umbrella",
            category="Outdoor",
            subcategory="Beach",
            vendor="BeachCo",
            brand="SunSafe",
            tags=["summer", "beach", "sun protection"],
            description="High-quality beach umbrella with UV protection",
            raw_attributes={}
        )
    ]

    result = classifier.classify_with_weather(records)
    assert result is None

def test_classification_prompt_formatting():
    classifier = WeatherTaxonomyClassifier()

    records = [
        ProductSourceRecord(
            tenant_id="test",
            canonical_product_id="test-1",
            product_id="1",
            source="shopify",
            title="UV Protection Beach Umbrella",
            category="Outdoor",
            subcategory="Beach",
            vendor="BeachCo",
            brand="SunSafe",
            tags=["summer", "beach", "sun protection"],
            description="High-quality beach umbrella with UV protection",
            raw_attributes={}
        )
    ]

    prompt = classifier._classification_prompt(records)

    # Verify prompt structure
    assert "### Example" in prompt
    assert "### Task" in prompt
    assert "Catalog records:" in prompt
    assert "source=shopify" in prompt
    assert "title=UV Protection Beach Umbrella" in prompt
    assert "Return JSON with standard taxonomy plus weather_signals" in prompt
    assert "weather_signals" in prompt
    assert "sensitivity" in prompt
    assert "correlations" in prompt