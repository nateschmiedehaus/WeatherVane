"""Synthetic data helpers for tests and local experimentation."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

from shared.libs.storage.lake import LakeWriter


@dataclass
class WeatherShock:
    """Defines a temporary weather perturbation for synthetic data."""

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
    """Create synthetic Parquet snapshots for a tenant.

    - ``geos``: list of (lat, lon) cells to populate.
    - ``shocks``: list of WeatherShock instances to simulate unusual weather periods.
    """

    geos = list(geos or DEFAULT_GEOS)
    shocks = list(shocks or [])

    writer = LakeWriter(root=lake_root)
    today = datetime(2024, 1, 7)

    orders_rows = []
    ads_meta_rows = []
    ads_google_rows = []
    promos_rows = []
    weather_rows = []

    for i in range(days):
        day = today - timedelta(days=i)
        date_str = day.strftime("%Y-%m-%d")

        # Determine shock multiplier for this day
        shock_multiplier = 1.0
        temp_bonus = 0.0
        rain_bonus = 0.0
        for shock in shocks:
            if shock.applies(i):
                temp_bonus += shock.temp_delta
                rain_bonus += shock.rain_mm
                shock_multiplier += shock.temp_delta * 0.01

        orders_rows.append(
            {
                "tenant_id": tenant_id,
                "created_at": f"{date_str}T00:00:00Z",
                "net_revenue": float(100 + i * 5 + temp_bonus * 2),
            }
        )

        ads_meta_rows.append(
            {
                "tenant_id": tenant_id,
                "date": date_str,
                "channel": "meta",
                "spend": float((20 + i) * shock_multiplier),
                "conversions": float(2 + i * 0.1),
            }
        )

        ads_google_rows.append(
            {
                "tenant_id": tenant_id,
                "date": date_str,
                "channel": "google",
                "spend": float(15 + i * 0.5),
                "conversions": float(1 + i * 0.05 * shock_multiplier),
            }
        )

        promos_rows.append(
            {
                "tenant_id": tenant_id,
                "send_date": f"{date_str}T12:00:00Z",
                "campaign_id": f"promo-{i}",
                "discount_pct": float(5 if i % 3 == 0 else 0),
            }
        )

        for lat, lon in geos:
            cell = f"{lat:.2f}_{lon:.2f}"
            weather_rows.append(
                {
                    "tenant_id": tenant_id,
                    "cell": cell,
                    "start": date_str,
                    "end": date_str,
                    "source": "synthetic",
                    "rain_mm": float((i % 2) + rain_bonus),
                    "temp_c": float(20 + i + lat * 0.1 + temp_bonus),
                }
            )

    writer.write_records(f"{tenant_id}_shopify_orders", orders_rows)
    writer.write_records(f"{tenant_id}_meta_ads", ads_meta_rows)
    writer.write_records(f"{tenant_id}_google_ads", ads_google_rows)
    writer.write_records(f"{tenant_id}_promos", promos_rows)
    writer.write_records(f"{tenant_id}_weather_cells", weather_rows)
