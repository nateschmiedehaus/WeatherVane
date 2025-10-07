from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Optional

from shared.libs.connectors import WeatherConnector, WeatherConfig


def make_geocell(lat: float, lon: float, precision: int = 1) -> str:
    """Return a coarse geocell identifier (placeholder for geohash).

    We round latitude/longitude to the requested precision so that nearby
    coordinates share cached weather. Precision=1 gives ~11 km resolution.
    """

    fmt = f"{{:.{precision}f}}"
    return f"{fmt.format(lat)}_{fmt.format(lon)}"


@dataclass
class WeatherFetchResult:
    cell: str
    start: date
    end: date
    payload: dict[str, Any]
    source: str


class WeatherCache:
    """Filesystem-backed cache for weather responses.

    This is a scaffolding implementation. The future version will persist
    Parquet/Arrow datasets. For now we log basic JSON snapshots so downstream
    feature builders can iterate without wiring the full pipeline.
    """

    def __init__(
        self,
        root: Path | str = Path("storage/lake/weather"),
        connector: Optional[WeatherConnector] = None,
        precision: int = 1,
    ) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.connector = connector or WeatherConnector(WeatherConfig())
        self.precision = precision

    def _cell_dir(self, cell: str) -> Path:
        return self.root / cell

    def _range_path(self, cell: str, start: date, end: date) -> Path:
        return self._cell_dir(cell) / f"{start.isoformat()}__{end.isoformat()}.json"

    async def ensure_range(
        self,
        lat: float,
        lon: float,
        start: date,
        end: date,
        extra_params: Optional[dict[str, Any]] = None,
    ) -> WeatherFetchResult:
        cell = make_geocell(lat, lon, precision=self.precision)
        path = self._range_path(cell, start, end)
        if path.exists():
            payload = self._load_json(path)
            return WeatherFetchResult(cell=cell, start=start, end=end, payload=payload, source="cache")

        params = extra_params.copy() if extra_params else {}
        params |= {
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        }
        response = await self.connector.fetch(lat=lat, lon=lon, **params)
        self._cell_dir(cell).mkdir(parents=True, exist_ok=True)
        self._write_json(path, response)
        return WeatherFetchResult(cell=cell, start=start, end=end, payload=response, source="upstream")

    def prune(self, max_files_per_cell: int = 12) -> None:
        """Trim cached ranges per cell to avoid unbounded growth."""

        for cell_dir in self.root.iterdir():
            if not cell_dir.is_dir():
                continue
            files = sorted(cell_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            for stale in files[max_files_per_cell:]:
                stale.unlink(missing_ok=True)

    def _load_json(self, path: Path) -> dict[str, Any]:
        import json

        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _write_json(self, path: Path, payload: dict[str, Any]) -> None:
        import json

        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f)


async def hydrate_weather_cells(
    cache: WeatherCache,
    coordinates: Iterable[tuple[float, float]],
    start: date,
    end: date,
) -> list[WeatherFetchResult]:
    results: list[WeatherFetchResult] = []
    for lat, lon in coordinates:
        result = await cache.ensure_range(lat=lat, lon=lon, start=start, end=end)
        results.append(result)
    return results
