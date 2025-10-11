"""Geocoding helpers for WeatherVane.

Uses `pgeocode` for offline postal lookups with an optional API fallback. Results are
cached so repeated requests are fast. Geohashes are encoded at precision 5 (~4.9km).
"""
from __future__ import annotations

import os
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Iterable, Mapping, Optional, Tuple

import geohash2  # type: ignore

from shared.libs.storage.state import JsonStateStore

if os.getenv("WEATHERVANE_DISABLE_PGEOCODE") == "1":  # pragma: no cover - env override for incompatible builds
    pgeocode = None  # type: ignore
else:  # pragma: no cover - optional dependency in production environments
    try:
        import pgeocode
    except ImportError:
        pgeocode = None  # type: ignore

DEFAULT_COUNTRY = "US"
DEFAULT_PRECISION = 5


@dataclass
class GeoResult:
    latitude: Optional[float]
    longitude: Optional[float]
    geohash: Optional[str]

    def to_dict(self) -> Dict[str, object | None]:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "geohash": self.geohash,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> "GeoResult":
        lat = payload.get("latitude")
        lon = payload.get("longitude")
        geohash = payload.get("geohash")
        lat_value = _safe_float(lat)
        lon_value = _safe_float(lon)
        return cls(
            latitude=lat_value,
            longitude=lon_value,
            geohash=str(geohash) if isinstance(geohash, str) and geohash else None,
        )


class Geocoder:
    CACHE_NAMESPACE = "geocoding_cache"

    def __init__(
        self,
        country: str = DEFAULT_COUNTRY,
        precision: int = DEFAULT_PRECISION,
        state_store: Optional[JsonStateStore] = None,
    ) -> None:
        self.country = country
        self.precision = precision
        self.state_store = state_store
        self._memory_cache: Dict[str, GeoResult] = {}

    def lookup(self, postal_code: Optional[str], country: Optional[str] = None) -> GeoResult:
        if not postal_code:
            return GeoResult(latitude=None, longitude=None, geohash=None)
        country_code = (country or self.country).upper()
        normalized_postal = str(postal_code).strip()
        cache_key = self._cache_key("postal", (country or self.country), normalized_postal)
        cached = self._load_from_cache(cache_key)
        if cached:
            return cached
        result = _lookup_postal(country_code, normalized_postal, self.precision)
        return self._store_in_cache(cache_key, result)

    def lookup_city(
        self,
        city: Optional[str],
        *,
        country: Optional[str] = None,
        region: Optional[str] = None,
    ) -> GeoResult:
        if not city:
            return GeoResult(latitude=None, longitude=None, geohash=None)
        country_code = (country or self.country).upper()
        normalized_city = _normalize(city)
        region_options = tuple(self._region_fallbacks(region))
        region_key = "-".join(opt for opt in region_options if opt) or "none"
        cache_key = self._cache_key(
            "city",
            country_code,
            normalized_city,
            region_key,
        )
        cached = self._load_from_cache(cache_key)
        if cached:
            return cached
        result = _lookup_city(country_code, normalized_city, region_options, self.precision)
        return self._store_in_cache(cache_key, result)

    def _cache_key(self, kind: str, country: str, *parts: str) -> str:
        components = [_normalize(kind), _normalize(country)]
        components.extend(_normalize(part) for part in parts if part)
        components = [component for component in components if component]
        return "__".join(components)

    def _load_from_cache(self, key: str) -> Optional[GeoResult]:
        if key in self._memory_cache:
            return self._memory_cache[key]
        if not self.state_store:
            return None
        payload = self.state_store.load(self.CACHE_NAMESPACE, key)
        if not payload:
            return None
        result = GeoResult.from_dict(payload)  # type: ignore[arg-type]
        self._memory_cache[key] = result
        return result

    def _store_in_cache(self, key: str, result: GeoResult) -> GeoResult:
        self._memory_cache[key] = result
        if self.state_store:
            self.state_store.save(self.CACHE_NAMESPACE, key, result.to_dict())
        return result

    def _region_fallbacks(self, region: Optional[str]) -> Iterable[str]:
        if not region:
            return ("",)
        candidates = []
        normalized = _normalize(region)
        if normalized:
            candidates.append(normalized)
        if "-" in region:
            suffix = _normalize(region.split("-")[-1])
            if suffix:
                candidates.append(suffix)
        candidates.append("")
        return tuple(dict.fromkeys(candidates))


def enrich_order_with_geo(order: dict, geocoder: Geocoder) -> dict:
    shipping = order.get("shipping_address") or {}
    precision = getattr(geocoder, "precision", DEFAULT_PRECISION)

    def _apply(result: GeoResult) -> dict:
        order["ship_latitude"] = result.latitude
        order["ship_longitude"] = result.longitude
        order["ship_geohash"] = result.geohash
        return order

    def _first_float(candidates: Iterable[object | None]) -> Optional[float]:
        for candidate in candidates:
            value = _safe_float(candidate)
            if value is not None:
                return value
        return None

    lat_candidates = (
        shipping.get("latitude"),
        shipping.get("lat"),
        order.get("shipping_latitude"),
        order.get("ship_latitude"),
    )
    lon_candidates = (
        shipping.get("longitude"),
        shipping.get("lon"),
        shipping.get("lng"),
        order.get("shipping_longitude"),
        order.get("ship_longitude"),
    )
    latitude = _first_float(lat_candidates)
    longitude = _first_float(lon_candidates)

    geohash_hint = shipping.get("geohash") or shipping.get("ship_geohash") or order.get("ship_geohash")
    if isinstance(geohash_hint, str):
        geohash_hint = geohash_hint.strip() or None
    else:
        geohash_hint = None

    if geohash_hint and (latitude is None or longitude is None):
        try:
            decoded_lat, decoded_lon, *_ = geohash2.decode_exactly(geohash_hint)
        except Exception:
            geohash_hint = None
        else:
            if latitude is None:
                latitude = float(decoded_lat)
            if longitude is None:
                longitude = float(decoded_lon)

    if latitude is not None and longitude is not None:
        geohash_value = geohash_hint or geohash2.encode(latitude, longitude, precision)
        return _apply(GeoResult(latitude=latitude, longitude=longitude, geohash=geohash_value))

    postal = shipping.get("zip") or shipping.get("postal_code") or order.get("shipping_postcode")
    country = shipping.get("country_code") or shipping.get("country") or DEFAULT_COUNTRY
    geo = GeoResult(latitude=None, longitude=None, geohash=None)
    if postal:
        geo = geocoder.lookup(str(postal), country)
    if (not geo.geohash) and hasattr(geocoder, "lookup_city"):
        city = shipping.get("city") or order.get("shipping_city")
        region = (
            shipping.get("province_code")
            or shipping.get("province")
            or shipping.get("state_code")
            or shipping.get("state")
            or order.get("shipping_region")
        )
        city_geo = geocoder.lookup_city(city, country=country, region=region)  # type: ignore[arg-type]
        if city_geo.geohash:
            geo = city_geo
        elif city_geo.latitude is not None and city_geo.longitude is not None:
            geo = GeoResult(
                latitude=city_geo.latitude,
                longitude=city_geo.longitude,
                geohash=geohash2.encode(city_geo.latitude, city_geo.longitude, precision),
            )
    if geo.latitude is not None and geo.longitude is not None and not geo.geohash:
        geo = GeoResult(
            latitude=geo.latitude,
            longitude=geo.longitude,
            geohash=geohash2.encode(geo.latitude, geo.longitude, precision),
        )
    return _apply(geo)


def _normalize(value: Optional[str]) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if ord(ch) < 128)
    collapsed = text.strip().casefold()
    return "-".join(collapsed.split())


def _safe_float(value: object) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


@lru_cache(maxsize=32)
def _get_nominatim(country: str):
    if not pgeocode:
        return None
    return pgeocode.Nominatim(country)


def _lookup_postal(country: str, postal_code: str, precision: int) -> GeoResult:
    nominatim = _get_nominatim(country)
    if not nominatim:
        return GeoResult(latitude=None, longitude=None, geohash=None)
    record = nominatim.query_postal_code(postal_code)
    lat = getattr(record, "latitude", None)
    lon = getattr(record, "longitude", None)
    if lat != lat or lon != lon:
        return GeoResult(latitude=None, longitude=None, geohash=None)
    geoh = geohash2.encode(float(lat), float(lon), precision)
    return GeoResult(latitude=float(lat), longitude=float(lon), geohash=geoh)


@lru_cache(maxsize=32)
def _city_index(country: str) -> Dict[Tuple[str, str], Tuple[float, float]]:
    nominatim = _get_nominatim(country)
    if not nominatim:
        return {}
    data = getattr(nominatim, "_data", None)
    if data is None:
        return {}
    index: Dict[Tuple[str, str], Tuple[float, float]] = {}
    for row in data.itertuples(index=False):
        lat = getattr(row, "latitude", None)
        lon = getattr(row, "longitude", None)
        if lat != lat or lon != lon:
            continue
        city = _normalize(getattr(row, "place_name", None))
        if not city:
            continue
        lat_f = float(lat)
        lon_f = float(lon)
        regions = {
            _normalize(getattr(row, "state_code", None)),
            _normalize(getattr(row, "state_name", None)),
            _normalize(getattr(row, "county_name", None)),
            _normalize(getattr(row, "community_name", None)),
            "",
        }
        for region in regions:
            index.setdefault((city, region), (lat_f, lon_f))
    return index


def _lookup_city(
    country: str,
    city_key: str,
    regions: Iterable[str],
    precision: int,
) -> GeoResult:
    index = _city_index(country)
    for region in regions:
        coords = index.get((city_key, region))
        if coords:
            lat, lon = coords
            geoh = geohash2.encode(lat, lon, precision)
            return GeoResult(latitude=lat, longitude=lon, geohash=geoh)
    return GeoResult(latitude=None, longitude=None, geohash=None)
