from pathlib import Path

import polars as pl

from apps.worker.flows.poc_pipeline import COORDINATE_LIMIT, _coordinates_from_orders


def test_coordinates_from_orders_with_latlon(tmp_path: Path) -> None:
    path = tmp_path / "orders.parquet"
    frame = pl.DataFrame(
        {
            "ship_latitude": [37.7749, 40.7128, 37.7749],
            "ship_longitude": [-122.4194, -74.0060, -122.4194],
        }
    )
    frame.write_parquet(path)

    coords = _coordinates_from_orders({"orders_path": str(path)})

    assert (37.7749, -122.4194) in coords
    assert (40.7128, -74.0060) in coords
    assert len(coords) <= COORDINATE_LIMIT


def test_coordinates_from_orders_with_geohash_only(tmp_path: Path) -> None:
    path = tmp_path / "orders_geohash.parquet"
    frame = pl.DataFrame(
        {
            "ship_geohash": ["9q8yy", "dr5ru"],
        }
    )
    frame.write_parquet(path)

    coords = _coordinates_from_orders({"orders_path": str(path)})

    assert any(abs(lat - 37.77) < 0.1 and abs(lon + 122.42) < 0.1 for lat, lon in coords)
    assert any(abs(lat - 40.71) < 0.1 and abs(lon + 74.00) < 0.1 for lat, lon in coords)
