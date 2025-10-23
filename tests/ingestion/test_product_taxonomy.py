from __future__ import annotations

import json
from typing import Iterable

from apps.api.services.product_taxonomy import ProductTaxonomyService
from shared.schemas.product_taxonomy import ProductSourceRecord
from shared.services.product_taxonomy import ProductTaxonomyClassifier


class _StubLLMResponse:
    def __init__(self, text: str, model: str = "claude-test") -> None:
        self.content = [{"type": "text", "text": text}]
        self.model = model


class _StubLLMMessages:
    def __init__(self, text: str) -> None:
        self._text = text

    def create(self, **_: object) -> _StubLLMResponse:
        return _StubLLMResponse(self._text)


class _StubLLMClient:
    def __init__(self, text: str) -> None:
        self.messages = _StubLLMMessages(text)


def _build_record(
    *,
    tenant_id: str = "tenant-1",
    canonical_product_id: str,
    product_id: str,
    source: str,
    product_name: str | None = None,
    title: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    vendor: str | None = None,
    brand: str | None = None,
    tags: Iterable[str] | None = None,
    description: str | None = None,
) -> ProductSourceRecord:
    return ProductSourceRecord(
        tenant_id=tenant_id,
        canonical_product_id=canonical_product_id,
        product_id=product_id,
        source=source,
        product_name=product_name,
        title=title,
        category=category,
        subcategory=subcategory,
        vendor=vendor,
        brand=brand,
        tags=list(tags or []),
        description=description,
    )


def test_winter_coat_classified_as_winter() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="winter-coat-001",
            product_id="shopify:123",
            source="shopify",
            product_name="Men's Arctic Down Parka",
            category="Apparel > Outerwear",
            tags=["Winter", "Parka", "Insulated"],
            vendor="NorthPeak",
            description="Insulated down parka designed for extreme cold weather patrols.",
        )
    ]

    [entry] = service.classify(records)

    assert entry.category_l1 == "outerwear"
    assert entry.category_l2 == "coats"
    assert entry.weather_affinity == "winter"
    assert entry.seasonality == "seasonal_q4_q1"
    assert "northpeak" in entry.brand_ids
    assert entry.confidence >= 0.8
    assert entry.evidence["matched_rule"] == "outerwear_coats_winter"
    assert "parka" in entry.evidence["matched_tokens"]


def test_umbrella_classified_as_rain() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="umbrella-777",
            product_id="shopify:umbrella-777",
            source="shopify",
            product_name="StormGuard Travel Umbrella",
            category="Accessories",
            tags=["Rain", "Waterproof", "Umbrella"],
            vendor="WeatherWorks",
            description="Compact waterproof travel umbrella with wind resistant frame.",
        ),
        _build_record(
            canonical_product_id="umbrella-777",
            product_id="meta:umbrella-creative",
            source="meta",
            title="StormGuard Umbrella | Stay dry in style",
            description="Meta creative highlighting the StormGuard umbrella with automatic open button.",
        ),
    ]

    [entry] = service.classify(records)

    assert entry.category_l1 == "accessories"
    assert entry.category_l2 == "umbrellas"
    assert entry.weather_affinity == "rain"
    assert entry.seasonality == "weather_triggered"
    assert entry.sources == ["meta", "shopify"]
    assert entry.confidence >= 0.8
    assert entry.evidence["matched_rule"] == "accessories_umbrellas"
    assert entry.cross_brand_key.startswith("umbrellas_rain")


def test_detects_gender_modifier_for_cross_brand_key() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="swim-009",
            product_id="google:swim-009",
            source="google",
            product_name="Women's Tidebreaker Swim Trunks",
            category="Apparel > Swimwear",
            tags=["Swim", "Women", "Summer"],
            description="Lightweight women's swim trunks ideal for summer heat and surf.",
        )
    ]

    [entry] = service.classify(records)

    assert entry.category_l2 == "swimwear"
    assert entry.weather_affinity in {"summer", "heat"}
    assert "womens" in entry.cross_brand_key
    assert entry.seasonality == "seasonal_q2_q3"


def test_tshirt_classified_as_summer() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="tee-101",
            product_id="google:tee-101",
            source="google",
            product_name="Sunrise Graphic Tee",
            category="Apparel > Tops",
            tags=["Tee", "Summer", "Cotton"],
            description="Lightweight cotton t-shirt designed for summer weather adventures.",
        )
    ]

    [entry] = service.classify(records)

    assert entry.category_l1 == "apparel"
    assert entry.category_l2 == "tshirts"
    assert entry.weather_affinity == "summer"
    assert entry.seasonality == "seasonal_q2_q3"
    assert entry.confidence >= 0.7


def test_llm_classification_overrides_rule_based_result() -> None:
    llm_payload = {
        "category_l1": "electronics",
        "category_l2": "smart_home_fans",
        "weather_affinity": "heat",
        "seasonality": "seasonal_q2_q3",
        "confidence": 0.88,
        "reasoning": "Smart fan clearly used for cooling in warm weather",
    }
    client = _StubLLMClient(json.dumps(llm_payload))
    classifier = ProductTaxonomyClassifier(llm_client=client)
    service = ProductTaxonomyService(classifier=classifier)

    records = [
        _build_record(
            canonical_product_id="smart-fan-001",
            product_id="shopify:smart-fan-001",
            source="shopify",
            product_name="Eco Breeze Smart Fan",
            category="Home > Cooling",
            tags=["smart", "fan", "cooling"],
            description="Wi-Fi enabled smart fan with adaptive cooling modes and voice integration.",
        )
    ]

    [entry] = service.classify(records)

    assert entry.category_l1 == "electronics"
    assert entry.category_l2 == "smart_home_fans"
    assert entry.weather_affinity == "heat"
    assert entry.seasonality == "seasonal_q2_q3"
    assert entry.cross_brand_key.startswith("smart_home_fans_heat")
    assert entry.evidence["llm_reasoning"].startswith("Smart fan")


def test_falls_back_to_neutral_when_no_rule_matches() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="gadget-42",
            product_id="shopify:gadget-42",
            source="shopify",
            product_name="USB Desk Organizer",
            category="Accessories > Office",
            description="Minimalist aluminum desk organizer with USB hub.",
        )
    ]

    [entry] = service.classify(records)

    assert entry.category_l1 == "general"
    assert entry.weather_affinity == "neutral"
    assert entry.seasonality == "evergreen"
    assert entry.confidence <= 0.55
    assert entry.cross_brand_key


def test_handles_explicit_heat_products() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="sunscreen-900",
            product_id="shopify:sunscreen-900",
            source="shopify",
            product_name="SunShield SPF 50 Sunscreen",
            tags=["SPF50", "Sunscreen", "Beach"],
            description="Broad spectrum SPF 50 sunscreen protects during extreme heat.",
        )
    ]

    [entry] = service.classify(records)

    assert entry.category_l2 == "sunscreen"
    assert entry.weather_affinity == "heat"
    assert entry.seasonality == "seasonal_q2_q3"
    assert entry.confidence >= 0.8


def test_cross_brand_key_consistent() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="umbrella-1",
            product_id="shopify:umbrella-1",
            source="shopify",
            product_name="NorthPeak Storm Umbrella",
            category="Accessories > Umbrellas",
            vendor="NorthPeak",
            brand="NorthPeak",
            tags=["Umbrella", "Windproof"],
            description="NorthPeak windproof umbrella with vented canopy for heavy rain.",
        ),
        _build_record(
            canonical_product_id="umbrella-2",
            product_id="shopify:umbrella-2",
            source="shopify",
            product_name="WeatherWorks Storm Umbrella",
            category="Accessories > Umbrellas",
            vendor="WeatherWorks",
            brand="WeatherWorks",
            tags=["Umbrella", "Windproof"],
            description="WeatherWorks windproof umbrella with vented canopy for heavy rain.",
        ),
    ]

    entries = service.classify(records)
    assert len(entries) == 2

    cross_brand_keys = {entry.cross_brand_key for entry in entries}
    assert len(cross_brand_keys) == 1
    for entry in entries:
        assert "northpeak" not in entry.cross_brand_key
        assert "weatherworks" not in entry.cross_brand_key
