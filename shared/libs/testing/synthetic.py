"""Synthetic data helpers for tests and local experimentation."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

import geohash2  # type: ignore

from shared.libs.storage.lake import LakeWriter


@dataclass
class WeatherShock:
    start_day: int
    end_day: int
    temp_delta: float = 0.0
    rain_mm: float = 0.0

    def applies(self, day_index: int) -> bool:
        return self.start_day <= day_index <= self.end_day


DEFAULT_GEOS = [(37.7749, -122.4194), (40.7128, -74.0060)]


def seed_synthetic_tenant(
    lake_root: Path | str,
    tenant_id: str,
    days: int = 7,
    geos: Iterable[tuple[float, float]] | None = None,
    shocks: Iterable[WeatherShock] | None = None,
) -> None:
    geos = list(geos or DEFAULT_GEOS)
    shocks = list(shocks or [])

    writer = LakeWriter(root=lake_root)
    today = datetime(2024, 1, 7)

    orders_rows: list[dict[str, object]] = []
    ads_meta_rows: list[dict[str, object]] = []
    ads_google_rows: list[dict[str, object]] = []
    promos_rows: list[dict[str, object]] = []
    weather_rows: list[dict[str, object]] = []

    weather_state: dict[str, dict[str, object]] = {}

    for days_from_today in range(days - 1, -1, -1):
        day = today - timedelta(days=days_from_today)
        date_str = day.strftime("%Y-%m-%d")
        sequence_index = (days - 1) - days_from_today

        temp_bonus = 0.0
        rain_bonus = 0.0
        multiplier = 1.0
        for shock in shocks:
            if shock.applies(days_from_today):
                temp_bonus += shock.temp_delta
                rain_bonus += shock.rain_mm
                multiplier += shock.temp_delta * 0.02

        ship_lat, ship_lon = geos[0]
        ship_geohash = geohash2.encode(ship_lat, ship_lon, 5)
        subtotal_price = round(120.0 + days_from_today * 4.0, 2)
        total_discounts = round(5.0 if sequence_index % 3 == 0 else 2.5, 2)
        total_tax = round(subtotal_price * 0.08, 2)
        total_price = round(subtotal_price + total_tax, 2)
        net_revenue = round(subtotal_price - total_discounts, 2)

        orders_rows.append(
            {
                "tenant_id": tenant_id,
                "order_id": f"{tenant_id}-order-{sequence_index}",
                "name": f"Order {sequence_index}",
                "created_at": f"{date_str}T00:00:00Z",
                "currency": "USD",
                "total_price": total_price,
                "subtotal_price": subtotal_price,
                "total_tax": total_tax,
                "total_discounts": total_discounts,
                "net_revenue": max(net_revenue, 0.0),
                "shipping_postal_code": "94107",
                "shipping_country": "US",
                "ship_latitude": ship_lat,
                "ship_longitude": ship_lon,
                "ship_geohash": ship_geohash,
            }
        )

        impressions_meta = 1200 + sequence_index * 35
        clicks_meta = 80 + sequence_index * 3
        conversions_meta = round(5.0 + sequence_index * 0.25, 2)
        spend_meta = round((25 + sequence_index) * multiplier, 2)
        ads_meta_rows.append(
            {
                "tenant_id": tenant_id,
                "date": date_str,
                "campaign_id": f"{tenant_id}-meta-campaign",
                "adset_id": f"{tenant_id}-meta-adset-{sequence_index}",
                "spend": spend_meta,
                "impressions": impressions_meta,
                "clicks": clicks_meta,
                "conversions": conversions_meta,
            }
        )

        impressions_google = 900 + sequence_index * 30
        clicks_google = 60 + sequence_index * 2
        conversions_google = round(3.0 + sequence_index * 0.18, 2)
        spend_google = round(18.0 + sequence_index * 0.6, 2)
        ads_google_rows.append(
            {
                "tenant_id": tenant_id,
                "date": date_str,
                "campaign_id": f"{tenant_id}-google-campaign",
                "spend": spend_google,
                "impressions": impressions_google,
                "clicks": clicks_google,
                "conversions": conversions_google,
            }
        )

        promos_rows.append(
            {
                "tenant_id": tenant_id,
                "campaign_id": f"promo-{sequence_index}",
                "name": f"Promo Campaign {sequence_index}",
                "channel": "email" if sequence_index % 2 == 0 else "sms",
                "scheduled_at": f"{date_str}T12:00:00Z",
                "status": "scheduled" if sequence_index % 2 == 0 else "draft",
            }
        )

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

            base_temp = 18.0 + geo_index * 1.5 + days_from_today * 0.6
            temp_c = float(base_temp + temp_bonus)
            temp_max_c = float(temp_c + 3.0)
            temp_min_c = float(temp_c - 4.0)
            apparent_temp_c = float(temp_c + 1.0)

            base_precip = 1.0 + (days_from_today % 3) * 0.8
            precip_mm = float(max(0.0, base_precip + rain_bonus - geo_index * 0.3))
            precip_probability = float(min(0.95, 0.25 + sequence_index * 0.05))
            humidity_mean = float(min(0.95, 0.55 + sequence_index * 0.02))
            windspeed_max = float(12.0 + geo_index * 1.5)
            uv_index_max = float(4.0 + sequence_index * 0.1)
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
            precip_prob_lag1 = float(state["last_precip_prob"]) if state["last_precip_prob"] is not None else precip_probability
            humidity_lag1 = float(state["last_humidity"]) if state["last_humidity"] is not None else humidity_mean

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

    writer.write_records(f"{tenant_id}_shopify_orders", orders_rows)
    writer.write_records(f"{tenant_id}_meta_ads", ads_meta_rows)
    writer.write_records(f"{tenant_id}_google_ads", ads_google_rows)
    writer.write_records(f"{tenant_id}_promos", promos_rows)
    writer.write_records(f"{tenant_id}_weather_daily", weather_rows)
