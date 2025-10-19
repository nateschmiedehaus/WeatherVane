from __future__ import annotations

from typing import Iterable

from apps.api.services.product_taxonomy import ProductTaxonomyService
from shared.schemas.product_taxonomy import ProductSourceRecord


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


def test_classifies_winter_coat_with_high_confidence() -> None:
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


def test_merges_multi_source_records_and_detects_rain_boots() -> None:
    service = ProductTaxonomyService()
    records = [
        _build_record(
            canonical_product_id="rain-boot-777",
            product_id="shopify:rain-boot-777",
            source="shopify",
            product_name="StormGuard Rain Boot",
            category="Footwear",
            tags=["Rain", "Waterproof", "Boot"],
            vendor="WeatherWorks",
            description="Waterproof rubber rain boot with sealed seams.",
        ),
        _build_record(
            canonical_product_id="rain-boot-777",
            product_id="meta:rain-boot-creative",
            source="meta",
            title="StormGuard Waterproof Rain Boot | Stay dry in style",
            description="Meta creative featuring the StormGuard rain boot, waterproof rubber outsole.",
        ),
    ]

    [entry] = service.classify(records)

    assert entry.category_l1 == "footwear"
    assert entry.category_l2 == "rain_boots"
    assert entry.weather_affinity == "rain"
    assert entry.seasonality == "weather_triggered"
    assert entry.sources == ["meta", "shopify"]
    assert entry.confidence >= 0.8
    assert entry.evidence["matched_rule"] == "footwear_rain_boots"
    assert entry.cross_brand_key.startswith("rain_boots_rain")


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
