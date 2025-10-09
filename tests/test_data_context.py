import polars as pl

from shared.data_context.service import ContextService
from shared.data_context.models import build_profile_from_polars


def test_context_service_tags(tmp_path):
    service = ContextService(root=tmp_path)

    orders = pl.DataFrame({"created_at": ["2024-01-01", "2024-01-02"], "net_revenue": [10.0, 12.0]})
    weather = pl.DataFrame({
        "date": ["2024-01-01", "2024-01-02"],
        "geohash": ["abcde", "abcde"],
        "temp_c": [10.0, 11.0],
        "precip_mm": [0.2, 0.1],
        "temp_anomaly": [0.0, 0.0],
        "precip_anomaly": [0.0, 0.0],
        "temp_roll7": [10.0, 10.5],
        "precip_roll7": [0.2, 0.15],
    })

    service.record_profile("tenant", build_profile_from_polars("orders", orders))
    service.record_profile("tenant", build_profile_from_polars("weather", weather))
    snapshot = service.snapshot("tenant", metadata={"weather_source": "stub"})

    assert "weather.stubbed" in snapshot.tags
    assert snapshot.dataset_profiles[0].row_count == 2
