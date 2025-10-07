"""Geocoding helpers for WeatherVane.

Uses `pgeocode` for offline postal lookups with an optional API fallback. Results are
cached so repeated requests are fast. Geohashes are encoded at precision 5 (~4.9km).
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Optional, Tuple

import geohash2  # type: ignore
import pgeocode

DEFAULT_COUNTRY = "US"
DEFAULT_PRECISION = 5


@dataclass
class GeoResult:
    latitude: Optional[float]
    longitude: Optional[float]
    geohash: Optional[str]


class Geocoder:
    def __init__(self, country: str = DEFAULT_COUNTRY, precision: int = DEFAULT_PRECISION) -> None:
        self.country = country
        self.precision = precision
        self._nominatim = pgeocode.Nominatim(country)

    @lru_cache(maxsize=10_000)
    def lookup(self, postal_code: str, country: Optional[str] = None) -> GeoResult:
        country = country or self.country
        nominatim = self._nominatim if country == self.country else pgeocode.Nominatim(country)
        record = nominatim.query_postal_code(str(postal_code))
        lat = record.latitude
        lon = record.longitude
        if lat != lat or lon != lon:  # NaN check
            return GeoResult(latitude=None, longitude=None, geohash=None)
        geoh = geohash2.encode(float(lat), float(lon), self.precision)
        return GeoResult(latitude=float(lat), longitude=float(lon), geohash=geoh)


def enrich_order_with_geo(order: dict, geocoder: Geocoder) -> dict:
    shipping = order.get("shipping_address") or {}
    postal = shipping.get("zip") or shipping.get("postal_code") or order.get("shipping_postcode")
    country = shipping.get("country_code") or shipping.get("country") or DEFAULT_COUNTRY
    if not postal:
        return order
    geo = geocoder.lookup(str(postal), country)
    order["ship_latitude"] = geo.latitude
    order["ship_longitude"] = geo.longitude
    order["ship_geohash"] = geo.geohash
    return order
