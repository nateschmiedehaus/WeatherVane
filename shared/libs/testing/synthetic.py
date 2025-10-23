"""Synthetic data helpers for tests and local experimentation."""
from __future__ import annotations

import hashlib
import math
import random
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, Sequence

import geohash2  # type: ignore
import polars as pl

from shared.libs.storage.lake import LakeWriter


SYNTHETIC_ANCHOR_DATE = datetime(2024, 1, 7)


@dataclass
class WeatherShock:
    start_day: int
    end_day: int
    temp_delta: float = 0.0
    rain_mm: float = 0.0

    def applies(self, day_index: int) -> bool:
        return self.start_day <= day_index <= self.end_day


DEFAULT_GEOS = [
    (37.7749, -122.4194),  # San Francisco
    (40.7128, -74.0060),   # New York
    (34.0522, -118.2437),  # Los Angeles
    (41.8781, -87.6298),   # Chicago
    (29.7604, -95.3698),   # Houston
    (47.6062, -122.3321),  # Seattle
]

DEFAULT_OPEN_METEO_PATH = Path("storage/seeds/open_meteo/chicago_il_daily.parquet")


@dataclass(frozen=True)
class WeatherSensitivityProfile:
    temp: float = 0.0
    rain: float = 0.0
    snow: float = 0.0
    humidity: float = 0.0
    wind: float = 0.0


@dataclass(frozen=True)
class MarketingProfile:
    meta_base: float
    google_base: float
    meta_growth: float = 0.0
    google_growth: float = 0.0
    weather_amplifier: float = 0.0
    revenue_per_spend: float = 0.35
    promo_rate: float = 0.5
    promo_channels: tuple[str, ...] = ("email", "sms")


@dataclass(frozen=True)
class ProductCategoryProfile:
    name: str
    weight: float
    temp: float = 0.0
    rain: float = 0.0
    snow: float = 0.0


@dataclass(frozen=True)
class BrandScenario:
    tenant_id: str
    brand_name: str
    product_categories: tuple[ProductCategoryProfile, ...]
    weather: WeatherSensitivityProfile
    marketing: MarketingProfile
    base_revenue: float = 140.0
    revenue_growth: float = 1.5
    revenue_noise: float = 5.0
    temperature_offset: float = 0.0
    precipitation_offset: float = 0.0
    geo_overrides: tuple[tuple[float, float], ...] | None = None
    seasonality_strength: float = 0.15
    weather_expectations: dict[str, str] = field(default_factory=dict)

    def normalized_categories(self) -> tuple[ProductCategoryProfile, ...]:
        total = sum(category.weight for category in self.product_categories)
        if total <= 0:
            return (ProductCategoryProfile(name="General Merchandise", weight=1.0),)
        return tuple(
            ProductCategoryProfile(
                name=category.name,
                weight=category.weight / total,
                temp=category.temp,
                rain=category.rain,
                snow=category.snow,
            )
            for category in self.product_categories
        )


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _scale_weather_signal(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    # Use sigmoid scaling for smoother transitions at extremes
    signal = 2.0 * (1.0 / (1.0 + math.exp(-value / 35.0)) - 0.5)
    return _clamp(signal * 3.5, -3.5, 3.5)


def _build_product_rows(
    tenant_id: str,
    scenario: BrandScenario,
    categories: Sequence[ProductCategoryProfile],
) -> list[dict[str, object]]:
    base_created = SYNTHETIC_ANCHOR_DATE - timedelta(days=120)
    rows: list[dict[str, object]] = []
    for idx, category in enumerate(categories):
        created_at = (base_created - timedelta(days=idx * 3)).strftime("%Y-%m-%dT08:00:00Z")
        rows.append(
            {
                "tenant_id": tenant_id,
                "product_id": f"{tenant_id}-product-{idx}",
                "title": f"{scenario.brand_name} {category.name}",
                "product_type": category.name,
                "vendor": scenario.brand_name,
                "created_at": created_at,
                "updated_at": created_at,
            }
        )
    return rows


def _marketing_spend(
    profile: MarketingProfile,
    sequence_index: int,
    weather_scale: float,
    rng: random.Random,
) -> tuple[float, float, float, float, int, int, int, int]:
    meta_trend = profile.meta_base + profile.meta_growth * sequence_index
    google_trend = profile.google_base + profile.google_growth * sequence_index

    weather_multiplier_meta = _clamp(1.0 + profile.weather_amplifier * weather_scale, 0.35, 2.5)
    weather_multiplier_google = _clamp(1.0 + (profile.weather_amplifier * 0.75) * weather_scale, 0.35, 2.2)

    meta_spend = max(5.0, meta_trend * weather_multiplier_meta)
    google_spend = max(4.0, google_trend * weather_multiplier_google)

    # Add seasonality to conversion rates
    season_factor = 1.0 + 0.2 * math.sin(sequence_index / 45.0)

    # Weather impacts both spend efficiency and total volume
    weather_conv_boost = _clamp(1.0 + weather_scale * 0.35 * season_factor, 0.6, 1.8)
    conversions_meta = max(0.5, meta_spend * 0.08 * weather_conv_boost)
    conversions_google = max(0.3, google_spend * 0.07 * weather_conv_boost)

    # Add weather and seasonal variation to impressions
    impression_scale = season_factor * _clamp(1 + weather_scale * 0.25, 0.7, 1.5)
    impressions_meta = int(max(600.0, meta_spend * 45.0 * impression_scale + 850.0 + rng.uniform(-80.0, 80.0)))
    impressions_google = int(max(500.0, google_spend * 42.0 * impression_scale + 720.0 + rng.uniform(-70.0, 70.0)))

    click_rate_meta = _clamp(0.06 + weather_scale * 0.012, 0.02, 0.12)
    click_rate_google = _clamp(0.055 + weather_scale * 0.01, 0.02, 0.11)
    clicks_meta = int(max(10.0, impressions_meta * click_rate_meta))
    clicks_google = int(max(8.0, impressions_google * click_rate_google))

    return (
        round(meta_spend, 2),
        round(google_spend, 2),
        round(conversions_meta, 2),
        round(conversions_google, 2),
        impressions_meta,
        impressions_google,
        clicks_meta,
        clicks_google,
    )


DEFAULT_BRAND_SCENARIOS: tuple[BrandScenario, ...] = (
    BrandScenario(
        tenant_id="brand-harbor-cafe",
        brand_name="Harbor Cafe",
        product_categories=(
            ProductCategoryProfile("Warm Beverages", 0.45, temp=-4.0, rain=2.6),
            ProductCategoryProfile("Baked Goods", 0.35, temp=-2.5, rain=1.9),
            ProductCategoryProfile("Cold Brew", 0.20, temp=2.6, rain=-0.4),
        ),
        weather=WeatherSensitivityProfile(temp=-6.0, rain=7.8, snow=1.5, humidity=1.5),
        marketing=MarketingProfile(
            meta_base=55.0,
            google_base=35.0,
            meta_growth=0.45,
            google_growth=0.25,
            weather_amplifier=0.8,
            revenue_per_spend=0.42,
            promo_rate=0.65,
            promo_channels=("email", "push"),
        ),
        base_revenue=150.0,
        revenue_growth=1.8,
        revenue_noise=5.2,
        temperature_offset=-2.0,
        precipitation_offset=0.6,
        seasonality_strength=0.18,
        weather_expectations={"precip_mm": "medium_positive", "temp_c": "medium_negative"},
    ),
    BrandScenario(
        tenant_id="brand-alpine-outfitters",
        brand_name="Alpine Outfitters",
        product_categories=(
            ProductCategoryProfile("Parkas", 0.40, temp=-4.0, snow=24.0),
            ProductCategoryProfile("Winter Boots", 0.35, temp=-2.4, snow=20.0),
            ProductCategoryProfile("Accessories", 0.25, temp=-1.0, snow=12.0),
        ),
        weather=WeatherSensitivityProfile(temp=-7.5, rain=-3.5, snow=60.0, humidity=1.4),
        marketing=MarketingProfile(
            meta_base=48.0,
            google_base=28.0,
            meta_growth=0.3,
            google_growth=0.18,
            weather_amplifier=1.15,
            revenue_per_spend=0.47,
            promo_rate=0.45,
            promo_channels=("email", "sms", "direct_mail"),
        ),
        base_revenue=160.0,
        revenue_growth=2.4,
        revenue_noise=3.8,
        temperature_offset=-26.0,
        precipitation_offset=0.2,
        geo_overrides=((46.8200, -92.1040), (39.7392, -104.9903)),
        seasonality_strength=0.22,
        weather_expectations={"snowfall_mm": "high_positive", "temp_c": "high_negative"},
    ),
    BrandScenario(
        tenant_id="brand-neutral-goods",
        brand_name="Neutral Goods",
        product_categories=(
            ProductCategoryProfile("Essentials", 0.4),
            ProductCategoryProfile("Housewares", 0.3),
            ProductCategoryProfile("Accessories", 0.3),
        ),
        weather=WeatherSensitivityProfile(),
        marketing=MarketingProfile(
            meta_base=62.0,
            google_base=58.0,
            meta_growth=0.25,
            google_growth=0.25,
            weather_amplifier=0.0,
            revenue_per_spend=0.38,
            promo_rate=0.55,
            promo_channels=("email", "sms"),
        ),
        base_revenue=145.0,
        revenue_growth=1.6,
        revenue_noise=5.5,
        seasonality_strength=0.12,
        weather_expectations={
            "temp_c": "none",
            "precip_mm": "none",
            "snowfall_mm": "none",
        },
    ),
    BrandScenario(
        tenant_id="brand-sunlit-skin",
        brand_name="Sunlit Skin",
        product_categories=(
            ProductCategoryProfile("SPF Serums", 0.40, temp=4.2, rain=-2.5),
            ProductCategoryProfile("After Sun", 0.25, temp=3.4, rain=-1.6),
            ProductCategoryProfile("Glow Kits", 0.35, temp=2.8, rain=-0.8),
        ),
        weather=WeatherSensitivityProfile(temp=7.5, rain=-4.0, humidity=-2.0, wind=-1.5),
        marketing=MarketingProfile(
            meta_base=70.0,
            google_base=45.0,
            meta_growth=0.55,
            google_growth=0.3,
            weather_amplifier=0.9,
            revenue_per_spend=0.4,
            promo_rate=0.5,
            promo_channels=("email", "in_app", "sms"),
        ),
        base_revenue=155.0,
        revenue_growth=2.2,
        revenue_noise=5.4,
        temperature_offset=6.0,
        precipitation_offset=-0.4,
        seasonality_strength=0.2,
        weather_expectations={"temp_c": "high_positive", "precip_mm": "negative"},
    ),
    BrandScenario(
        tenant_id="brand-garden-gurus",
        brand_name="Garden Gurus",
        product_categories=(
            ProductCategoryProfile("Seeds & Bulbs", 0.32, temp=0.15, rain=8.8),
            ProductCategoryProfile("Garden Tools", 0.28, temp=0.1, rain=4.4),
            ProductCategoryProfile("Outdoor Decor", 0.40, temp=0.2, rain=5.6),
        ),
        weather=WeatherSensitivityProfile(temp=0.2, rain=16.0, humidity=3.5),
        marketing=MarketingProfile(
            meta_base=44.0,
            google_base=52.0,
            meta_growth=0.3,
            google_growth=0.42,
            weather_amplifier=0.75,
            revenue_per_spend=0.36,
            promo_rate=0.6,
            promo_channels=("email", "sms", "push"),
        ),
        base_revenue=147.0,
        revenue_growth=1.9,
        revenue_noise=5.1,
        temperature_offset=1.0,
        precipitation_offset=1.4,
        seasonality_strength=0.17,
        weather_expectations={"precip_mm": "high_positive"},
    ),
)

DEFAULT_SCENARIO = DEFAULT_BRAND_SCENARIOS[0]

_OPEN_METEO_CACHE: dict[Path, dict[str, dict[str, float]]] = {}

__all__ = [
    "WeatherShock",
    "WeatherSensitivityProfile",
    "MarketingProfile",
    "ProductCategoryProfile",
    "BrandScenario",
    "DEFAULT_GEOS",
    "DEFAULT_BRAND_SCENARIOS",
    "DEFAULT_SCENARIO",
    "SYNTHETIC_ANCHOR_DATE",
    "seed_synthetic_tenant",
    "seed_synthetic_brand_portfolio",
]


def _load_open_meteo_daily(path: Path | str | None) -> dict[str, dict[str, float]] | None:
    if path is None:
        return None
    resolved = Path(path)
    if not resolved.exists():
        return None
    cached = _OPEN_METEO_CACHE.get(resolved)
    if cached is not None:
        return cached
    frame = pl.read_parquet(resolved)
    mapping: dict[str, dict[str, float]] = {}
    for row in frame.iter_rows(named=True):
        mapping[row["date"]] = {
            "temp_c": float(row["temp_c"]),
            "temp_max_c": float(row["temp_max_c"]),
            "temp_min_c": float(row["temp_min_c"]),
            "apparent_temp_c": float(row["apparent_temp_c"]),
            "precip_mm": float(row["precip_mm"]),
            "precip_probability": float(row["precip_probability"]),
            "humidity_mean": float(row["humidity_mean"]),
            "windspeed_max": float(row["windspeed_max"]),
            "uv_index_max": float(row["uv_index_max"]),
            "snowfall_mm": float(row["snowfall_mm"]),
            "geohash": str(row["geohash"]),
        }
    _OPEN_METEO_CACHE[resolved] = mapping
    return mapping


def seed_synthetic_tenant(
    lake_root: Path | str,
    tenant_id: str,
    days: int = 7,
    geos: Iterable[tuple[float, float]] | None = None,
    shocks: Iterable[WeatherShock] | None = None,
    scenario: BrandScenario | None = None,
    open_meteo_daily_path: Path | str | None = DEFAULT_OPEN_METEO_PATH,
) -> None:
    scenario = scenario or DEFAULT_SCENARIO
    categories = scenario.normalized_categories()
    weather_leverage = (
        abs(scenario.weather.temp)
        + abs(scenario.weather.rain)
        + abs(scenario.weather.snow)
        + abs(scenario.weather.humidity)
        + abs(scenario.weather.wind)
        + sum(abs(cat.temp) + abs(cat.rain) + abs(cat.snow) for cat in categories)
    )
    neutral_noise_multiplier = 0.45 if weather_leverage < 1.0 else 0.1
    geos = list(geos or scenario.geo_overrides or DEFAULT_GEOS)
    shocks = list(shocks or [])

    writer = LakeWriter(root=lake_root)
    today = SYNTHETIC_ANCHOR_DATE

    product_rows = _build_product_rows(tenant_id, scenario, categories)
    orders_rows: list[dict[str, object]] = []
    ads_meta_rows: list[dict[str, object]] = []
    ads_google_rows: list[dict[str, object]] = []
    promos_rows: list[dict[str, object]] = []
    weather_rows: list[dict[str, object]] = []

    weather_state: dict[str, dict[str, object]] = {}
    seed_material = f"{tenant_id}|{days}|{len(geos)}".encode("utf-8")
    seed_value = int.from_bytes(hashlib.sha256(seed_material).digest()[:8], "big")
    rng = random.Random(seed_value)
    open_meteo_daily = _load_open_meteo_daily(open_meteo_daily_path)

    for days_from_today in range(days - 1, -1, -1):
        day = today - timedelta(days=days_from_today)
        date_str = day.strftime("%Y-%m-%d")
        sequence_index = (days - 1) - days_from_today

        temp_bonus = 0.0
        rain_bonus = 0.0
        for shock in shocks:
            if shock.applies(days_from_today):
                temp_bonus += shock.temp_delta
                rain_bonus += shock.rain_mm

        primary_temp_dev = 0.0
        primary_precip = 0.0
        primary_snow = 0.0
        primary_humidity_dev = 0.0
        primary_wind_dev = 0.0
        primary_geohash: str | None = None

        brand_weather_signal = 0.0
        scaled_weather_signal = 0.0
        meta_spend = scenario.marketing.meta_base
        google_spend = scenario.marketing.google_base
        conversions_meta = max(0.5, meta_spend * 0.08)
        conversions_google = max(0.3, google_spend * 0.07)
        impressions_meta = 900
        impressions_google = 700
        clicks_meta = 60
        clicks_google = 45

        open_meteo_row = open_meteo_daily.get(date_str) if open_meteo_daily else None

        for geo_index, (lat, lon) in enumerate(geos):
            geohash = geohash2.encode(lat, lon, 5)
            state = weather_state.setdefault(
                geohash,
                {
                    "temps": deque(maxlen=32),
                    "precips": deque(maxlen=32),
                    "last_temp": None,
                    "last_precip": None,
                    "last_uv": None,
                    "last_precip_prob": None,
                    "last_humidity": None,
                },
            )

            if open_meteo_row:
                base_temp = open_meteo_row["temp_c"] + scenario.temperature_offset + geo_index * 0.4
                temp_c = float(base_temp + temp_bonus)
                temp_max_c = float(
                    open_meteo_row["temp_max_c"] + scenario.temperature_offset + geo_index * 0.5 + temp_bonus
                )
                temp_min_c = float(
                    open_meteo_row["temp_min_c"] + scenario.temperature_offset * 0.8 + geo_index * 0.3 + temp_bonus
                )
                apparent_temp_c = float(
                    open_meteo_row["apparent_temp_c"] + scenario.temperature_offset * 0.4 + geo_index * 0.2 + temp_bonus
                )
                precip_base = open_meteo_row["precip_mm"] + scenario.precipitation_offset
                precip_mm = float(max(0.0, precip_base + rain_bonus - geo_index * 0.15))
                precip_probability = float(
                    _clamp(
                        open_meteo_row["precip_probability"]
                        + sequence_index * 0.002
                        + scenario.precipitation_offset * 0.01,
                        0.0,
                        0.99,
                    )
                )
                humidity_mean = float(
                    _clamp(
                        open_meteo_row["humidity_mean"]
                        + scenario.weather.humidity * 0.002
                        + geo_index * 0.01,
                        0.05,
                        0.99,
                    )
                )
                windspeed_max = float(
                    max(
                        0.0,
                        open_meteo_row["windspeed_max"] + scenario.weather.wind * 0.05 + geo_index * 0.4,
                    )
                )
                uv_index_max = float(max(0.0, open_meteo_row["uv_index_max"]))
                snowfall_mm = float(max(0.0, open_meteo_row["snowfall_mm"] + rain_bonus * 0.05))
            else:
                base_temp = 18.0 + scenario.temperature_offset + geo_index * 1.5 + days_from_today * 0.6
                temp_c = float(base_temp + temp_bonus)
                temp_max_c = float(temp_c + 3.0)
                temp_min_c = float(temp_c - 4.0)
                apparent_temp_c = float(temp_c + 1.0)

                base_precip = 1.0 + scenario.precipitation_offset + (days_from_today % 3) * 0.8
                precip_mm = float(max(0.0, base_precip + rain_bonus - geo_index * 0.3))
                precip_probability = float(
                    _clamp(0.25 + sequence_index * 0.05 + scenario.precipitation_offset * 0.03, 0.05, 0.95)
                )
                humidity_mean = float(
                    _clamp(0.55 + sequence_index * 0.02 + scenario.precipitation_offset * 0.015, 0.3, 0.98)
                )
                windspeed_max = float(_clamp(12.0 + geo_index * 1.5 + scenario.weather.wind * 0.1, 5.0, 32.0))
                uv_index_max = float(
                    _clamp(4.0 + sequence_index * 0.1 + scenario.temperature_offset * -0.05, 1.0, 11.0)
                )
                snowfall_mm = float(max(0.0, -temp_min_c * 0.2) if temp_min_c < 0 else 0.0)

            past_temps: deque[float] = state["temps"]  # type: ignore[assignment]
            past_precips: deque[float] = state["precips"]  # type: ignore[assignment]

            previous_mean_temp = sum(past_temps) / len(past_temps) if past_temps else temp_c
            previous_mean_precip = sum(past_precips) / len(past_precips) if past_precips else precip_mm
            temp_anomaly = float(temp_c - previous_mean_temp)
            precip_anomaly = float(precip_mm - previous_mean_precip)

            window_temps = list(past_temps)[-6:] + [temp_c]
            window_precips = list(past_precips)[-6:] + [precip_mm]
            temp_roll7 = float(sum(window_temps) / len(window_temps))
            precip_roll7 = float(sum(window_precips) / len(window_precips))

            temp_lag1 = float(state["last_temp"]) if state["last_temp"] is not None else temp_c
            precip_lag1 = float(state["last_precip"]) if state["last_precip"] is not None else precip_mm
            uv_lag1 = float(state["last_uv"]) if state["last_uv"] is not None else uv_index_max
            precip_prob_lag1 = (
                float(state["last_precip_prob"]) if state["last_precip_prob"] is not None else precip_probability
            )
            humidity_lag1 = (
                float(state["last_humidity"]) if state["last_humidity"] is not None else humidity_mean
            )

            freeze_flag = int(temp_min_c <= 0.0)
            heatwave_flag = int(temp_max_c >= 30.0)
            snow_event_flag = int(snowfall_mm > 0.1)
            high_wind_flag = int(windspeed_max >= 20.0)
            uv_alert_flag = int(uv_index_max >= 8.0)
            high_precip_prob_flag = int(precip_probability >= 0.6)

            local_datetime = f"{date_str}T06:00:00-08:00"
            utc_datetime = f"{date_str}T14:00:00+00:00"

            weather_rows.append(
                {
                    "date": date_str,
                    "local_date": date_str,
                    "local_datetime": local_datetime,
                    "utc_datetime": utc_datetime,
                    "timezone": "America/Los_Angeles",
                    "geohash": geohash,
                    "day_of_year": day.timetuple().tm_yday,
                    "temp_c": temp_c,
                    "temp_max_c": temp_max_c,
                    "temp_min_c": temp_min_c,
                    "apparent_temp_c": apparent_temp_c,
                    "precip_mm": precip_mm,
                    "precip_probability": precip_probability,
                    "humidity_mean": humidity_mean,
                    "windspeed_max": windspeed_max,
                    "uv_index_max": uv_index_max,
                    "snowfall_mm": snowfall_mm,
                    "temp_anomaly": temp_anomaly,
                    "precip_anomaly": precip_anomaly,
                    "temp_roll7": temp_roll7,
                    "precip_roll7": precip_roll7,
                    "temp_c_lag1": temp_lag1,
                    "precip_mm_lag1": precip_lag1,
                    "uv_index_lag1": uv_lag1,
                    "precip_probability_lag1": precip_prob_lag1,
                    "humidity_lag1": humidity_lag1,
                    "freeze_flag": freeze_flag,
                    "heatwave_flag": heatwave_flag,
                    "snow_event_flag": snow_event_flag,
                    "high_wind_flag": high_wind_flag,
                    "uv_alert_flag": uv_alert_flag,
                    "high_precip_prob_flag": high_precip_prob_flag,
                    "observation_type": "observed",
                    "as_of_utc": utc_datetime,
                }
            )

            past_temps.append(temp_c)
            past_precips.append(precip_mm)
            state["last_temp"] = temp_c
            state["last_precip"] = precip_mm
            state["last_uv"] = uv_index_max
            state["last_precip_prob"] = precip_probability
            state["last_humidity"] = humidity_mean

            if geo_index == 0:
                primary_temp_dev = temp_c - 12.0
                primary_precip = precip_mm
                primary_snow = snowfall_mm
                primary_humidity_dev = humidity_mean - 0.6
                primary_wind_dev = windspeed_max - 10.0
                primary_geohash = geohash
                brand_weather_signal = (
                    scenario.weather.temp * primary_temp_dev
                    + scenario.weather.rain * primary_precip
                    + scenario.weather.snow * primary_snow
                    + scenario.weather.humidity * primary_humidity_dev
                    + scenario.weather.wind * primary_wind_dev
                )
                scaled_weather_signal = _scale_weather_signal(brand_weather_signal)
                (
                    meta_spend,
                    google_spend,
                    conversions_meta,
                    conversions_google,
                    impressions_meta,
                    impressions_google,
                    clicks_meta,
                    clicks_google,
                ) = _marketing_spend(scenario.marketing, sequence_index, scaled_weather_signal, rng)

        if weather_leverage < 1.0:
            trend_component = rng.gauss(0.0, scenario.base_revenue * 0.12)
            seasonal_component = rng.gauss(0.0, scenario.base_revenue * 0.08)
        else:
            oscillation = math.sin(sequence_index / 6.5) + 0.5 * math.cos(sequence_index / 8.3)
            trend_component = scenario.revenue_growth * oscillation
            seasonal_component = (
                math.sin(sequence_index / 3.2) * scenario.seasonality_strength * scenario.base_revenue
            )
        baseline_noise = rng.gauss(0.0, scenario.base_revenue * neutral_noise_multiplier * 0.25)
        marketing_component = scenario.marketing.revenue_per_spend * (meta_spend + google_spend)
        base_daily_revenue = max(
            20.0,
            scenario.base_revenue + trend_component + seasonal_component + baseline_noise,
        )

        # Scale weather influence smoothly with leverage
        weather_influence = 0.6 + 0.3 * _clamp(weather_leverage / 5.0, 0.0, 1.0)

        for category_index, category in enumerate(categories):
            if weather_leverage < 1.0:
                noise_scale = scenario.base_revenue * 0.2 * (1.0 + abs(scaled_weather_signal) * 0.3)
                revenue = (
                    scenario.base_revenue * category.weight
                    + marketing_component * category.weight
                    + rng.gauss(0.0, noise_scale)
                )
            else:
                category_weather = (
                    category.temp * primary_temp_dev
                    + category.rain * primary_precip
                    + category.snow * primary_snow
                )
                category_noise_scale = scenario.revenue_noise * 0.5
                noise = rng.gauss(0.0, category_noise_scale)
                revenue = (
                    base_daily_revenue * category.weight
                    + weather_influence * brand_weather_signal * category.weight
                    + category_weather
                    + marketing_component * category.weight
                    + noise
                )
            revenue = max(18.0, revenue)
            net_revenue = round(revenue, 2)
            total_discounts = round(net_revenue * 0.08, 2)
            subtotal_price = round(net_revenue + total_discounts, 2)
            total_tax = round(subtotal_price * 0.07, 2)
            total_price = round(subtotal_price + total_tax, 2)

            orders_rows.append(
                {
                    "tenant_id": tenant_id,
                    "order_id": f"{tenant_id}-order-{sequence_index}-{category_index}",
                    "name": f"{scenario.brand_name} {category.name} {sequence_index}",
                    "created_at": f"{date_str}T00:00:00Z",
                    "currency": "USD",
                    "total_price": total_price,
                    "subtotal_price": subtotal_price,
                    "total_tax": total_tax,
                    "total_discounts": total_discounts,
                    "net_revenue": net_revenue,
                    "shipping_postal_code": "94107",
                    "shipping_country": "US",
                    "ship_latitude": geos[0][0],
                    "ship_longitude": geos[0][1],
                    "ship_geohash": primary_geohash,
                }
            )

        promo_channels = scenario.marketing.promo_channels or ("email",)
        promo_channel = promo_channels[sequence_index % len(promo_channels)]
        promo_status = "scheduled" if rng.random() <= _clamp(scenario.marketing.promo_rate, 0.0, 1.0) else "draft"
        promos_rows.append(
            {
                "tenant_id": tenant_id,
                "campaign_id": f"{tenant_id}-promo-{sequence_index}",
                "name": f"{scenario.brand_name} {promo_channel.title()} Campaign {sequence_index}",
                "channel": promo_channel,
                "scheduled_at": f"{date_str}T12:00:00Z",
                "status": promo_status,
            }
        )

        ads_meta_rows.append(
            {
                "tenant_id": tenant_id,
                "date": date_str,
                "campaign_id": f"{tenant_id}-meta-campaign",
                "adset_id": f"{tenant_id}-meta-adset-{sequence_index}",
                "spend": meta_spend,
                "impressions": impressions_meta,
                "clicks": clicks_meta,
                "conversions": conversions_meta,
            }
        )

        ads_google_rows.append(
            {
                "tenant_id": tenant_id,
                "date": date_str,
                "campaign_id": f"{tenant_id}-google-campaign",
                "spend": google_spend,
                "impressions": impressions_google,
                "clicks": clicks_google,
                "conversions": conversions_google,
            }
        )

    writer.write_records(f"{tenant_id}_shopify_products", product_rows)
    writer.write_records(f"{tenant_id}_shopify_orders", orders_rows)
    writer.write_records(f"{tenant_id}_meta_ads", ads_meta_rows)
    writer.write_records(f"{tenant_id}_google_ads", ads_google_rows)
    writer.write_records(f"{tenant_id}_promos", promos_rows)
    writer.write_records(f"{tenant_id}_weather_daily", weather_rows)


def seed_synthetic_brand_portfolio(
    lake_root: Path | str,
    days: int = 1095,
    scenarios: Sequence[BrandScenario] | None = None,
    open_meteo_daily_path: Path | str | None = DEFAULT_OPEN_METEO_PATH,
) -> tuple[str, ...]:
    scenarios = tuple(scenarios or DEFAULT_BRAND_SCENARIOS)
    tenant_ids: list[str] = []
    for scenario in scenarios:
        seed_synthetic_tenant(
            lake_root=lake_root,
            tenant_id=scenario.tenant_id,
            days=days,
            geos=scenario.geo_overrides,
            shocks=None,
            scenario=scenario,
            open_meteo_daily_path=open_meteo_daily_path,
        )
        tenant_ids.append(scenario.tenant_id)
    return tuple(tenant_ids)
