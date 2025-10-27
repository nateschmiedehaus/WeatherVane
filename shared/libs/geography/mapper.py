"""Geographic mapping helpers with DMA-first fallback resolution."""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

import geohash2  # type: ignore
from shapely.geometry import Point, shape  # type: ignore
from shapely.strtree import STRtree  # type: ignore

# Geographic hierarchy thresholds
DMA_MIN_GEOCODED_RATIO = 0.55  # 55% orders must be geocoded for DMA level
DMA_MIN_WEATHER_COVERAGE = 0.85  # 85% weather data required for DMA level
STATE_MIN_GEOCODED_RATIO = 0.25  # 25% orders for state level
STATE_MIN_WEATHER_COVERAGE = 0.70  # 70% weather data required for state level

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "geography"
DEFAULT_CROSSWALK_PATH = DATA_DIR / "dma_county_crosswalk.csv"
DEFAULT_COUNTY_GEOMETRY_PATH = DATA_DIR / "counties.geojson"


@dataclass(frozen=True)
class GeographyResolution:
    """Resolved geography for a geohash with hierarchical fallback metadata."""

    scope: str
    level: str
    dma_code: Optional[str] = None
    dma_name: Optional[str] = None
    state_abbr: Optional[str] = None
    state_fips: Optional[str] = None
    county_fips: Optional[str] = None
    county_name: Optional[str] = None
    source_geohash: Optional[str] = None
    geocoded_ratio: Optional[float] = None
    weather_coverage: Optional[float] = None
    fallback_reason: Optional[str] = None

    @property
    def is_dma(self) -> bool:
        return self.level == "dma"

    @property
    def is_state(self) -> bool:
        return self.level == "state"

    @property
    def is_global(self) -> bool:
        return self.level == "global"


class GeographyMapper:
    """Translate geohashes into DMA-first geography with fallbacks."""

    def __init__(
        self,
        crosswalk_path: Path | str | None = None,
        county_geometry_path: Path | str | None = None,
        geocoded_ratio: float | None = None,
        weather_coverage: float | None = None,
    ) -> None:
        self.crosswalk_path = Path(crosswalk_path or DEFAULT_CROSSWALK_PATH).expanduser()
        self.county_geometry_path = Path(county_geometry_path or DEFAULT_COUNTY_GEOMETRY_PATH).expanduser()
        if not self.crosswalk_path.exists():
            raise FileNotFoundError(f"DMA crosswalk not found at {self.crosswalk_path}")
        if not self.county_geometry_path.exists():
            raise FileNotFoundError(f"County geometry dataset not found at {self.county_geometry_path}")

        self._cache: Dict[str, GeographyResolution] = {}
        self._county_crosswalk: Dict[str, dict[str, str]] = {}
        self._state_lookup: Dict[str, str] = {}
        self._state_fips_lookup: Dict[str, str] = {}
        self._polygons: list = []
        self._geom_records: list[dict[str, str]] = []
        self._index: STRtree | None = None
        self._geocoded_ratio = geocoded_ratio
        self._weather_coverage = weather_coverage

        self._load_crosswalk()
        self._load_geometries()

    def _load_crosswalk(self) -> None:
        with self.crosswalk_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                county_fips = (row.get("county_fips") or "").strip()
                state_abbr = (row.get("state_abbr") or "").upper()
                state_fips = (row.get("state_fips") or "").strip()
                if not county_fips or not state_abbr:
                    continue
                self._county_crosswalk[county_fips] = row
                if state_abbr and state_fips:
                    self._state_lookup.setdefault(state_abbr, state_fips)
                    self._state_fips_lookup.setdefault(state_fips, state_abbr)

    def _load_geometries(self) -> None:
        with self.county_geometry_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

        polygons = []
        records: list[dict[str, str]] = []
        for feature in payload.get("features", []):
            geometry = feature.get("geometry")
            if not geometry:
                continue
            polygon = shape(geometry)
            polygons.append(polygon)
            county_fips = str(feature.get("id") or "").zfill(5)
            records.append(
                {
                    "county_fips": county_fips,
                    "state_abbr": feature.get("properties", {}).get("STATE"),
                    "county_name": feature.get("properties", {}).get("NAME"),
                }
            )
        self._polygons = polygons
        self._geom_records = records
        self._index = STRtree(polygons)

    def lookup(self, geohash: str | None) -> GeographyResolution:
        """Resolve a geohash into DMA/state/global buckets."""

        key = (geohash or "").strip()
        if not key:
            return self._global(None)

        cached = self._cache.get(key)
        if cached:
            return cached

        try:
            latitude, longitude = geohash2.decode(key)
            latitude = float(latitude)
            longitude = float(longitude)
        except Exception:
            resolution = self._global(key)
            self._cache[key] = resolution
            return resolution

        county_fips = self._resolve_county(longitude, latitude)
        fallback_reason: Optional[str] = None
        if county_fips and county_fips in self._county_crosswalk:
            row = self._county_crosswalk[county_fips]

            # Try DMA level first (preferred)
            dma_eligible = False
            if self._geocoded_ratio is not None and self._weather_coverage is not None:
                if self._geocoded_ratio < DMA_MIN_GEOCODED_RATIO:
                    fallback_reason = "dma_geocoded_ratio_below_threshold"
                elif self._weather_coverage < DMA_MIN_WEATHER_COVERAGE:
                    fallback_reason = "dma_weather_coverage_below_threshold"
                else:
                    dma_eligible = True
            else:
                dma_eligible = True  # No coverage info, try DMA by default

            if dma_eligible:
                resolution = GeographyResolution(
                    scope=f"DMA:{row.get('dma_code')}",
                    level="dma",
                    dma_code=row.get("dma_code"),
                    dma_name=row.get("dma_name"),
                    state_abbr=row.get("state_abbr"),
                    state_fips=row.get("state_fips"),
                    county_fips=county_fips,
                    county_name=row.get("county_name"),
                    source_geohash=key,
                    geocoded_ratio=self._geocoded_ratio,
                    weather_coverage=self._weather_coverage,
                )
                self._cache[key] = resolution
                return resolution

        state_abbr = None
        state_fips = None
        if county_fips:
            candidate_state_fips = county_fips[:2]
            state_abbr = self._state_fips_lookup.get(candidate_state_fips)
            state_fips = candidate_state_fips if state_abbr else None

        if state_abbr:
            # Try state level if DMA level wasn't eligible or state level meets thresholds
            state_eligible = True
            state_fallback_reason: Optional[str] = None

            if self._geocoded_ratio is not None and self._weather_coverage is not None:
                allow_dma_ratio_override = (
                    fallback_reason == "dma_geocoded_ratio_below_threshold"
                    and self._weather_coverage >= STATE_MIN_WEATHER_COVERAGE
                )
                if self._geocoded_ratio < STATE_MIN_GEOCODED_RATIO and not allow_dma_ratio_override:
                    state_eligible = False
                    state_fallback_reason = "state_geocoded_ratio_below_threshold"
                elif state_eligible and self._weather_coverage < STATE_MIN_WEATHER_COVERAGE:
                    state_fallback_reason = "state_weather_coverage_below_threshold"

            if state_eligible:
                resolution = GeographyResolution(
                    scope=f"STATE:{state_abbr}",
                    level="state",
                    state_abbr=state_abbr,
                    state_fips=state_fips,
                    source_geohash=key,
                    geocoded_ratio=self._geocoded_ratio,
                    weather_coverage=self._weather_coverage,
                    fallback_reason=fallback_reason
                )
                self._cache[key] = resolution
                return resolution
            else:
                # If state level isn't eligible either, fall back to global
                resolution = self._global(key, state_fallback_reason)
                self._cache[key] = resolution
                return resolution

        resolution = self._global(key)
        self._cache[key] = resolution
        return resolution

    def _global(self, geohash: str | None, fallback_reason: str | None = None) -> GeographyResolution:
        return GeographyResolution(
            scope="GLOBAL",
            level="global",
            source_geohash=geohash,
            geocoded_ratio=self._geocoded_ratio,
            weather_coverage=self._weather_coverage,
            fallback_reason=fallback_reason or "no_geographic_match"
        )

    def _resolve_county(self, longitude: float, latitude: float) -> Optional[str]:
        if not self._index:
            return None

        point = Point(longitude, latitude)
        candidate_indices = self._index.query(point)
        for idx in candidate_indices:
            geom = self._polygons[idx]
            record = self._geom_records[idx]
            if record and geom.covers(point):
                return record.get("county_fips")

        nearest = self._nearest_polygon(point)
        if nearest:
            return nearest.get("county_fips")
        return None

    @lru_cache(maxsize=512)
    def _nearest_polygon(self, point: Point):
        if not self._index:
            return None
        try:
            nearest_idx = self._index.nearest(point)
            if nearest_idx is None:
                return None
            return self._geom_records[nearest_idx]
        except Exception:
            distances = [
                (geom.distance(point), record)
                for geom, record in zip(self._polygons, self._geom_records)
            ]
            if not distances:
                return None
            return min(distances, key=lambda item: item[0])[1]


__all__ = ["GeographyMapper", "GeographyResolution"]
