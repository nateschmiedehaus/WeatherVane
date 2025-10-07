from datetime import datetime
from pathlib import Path

import pytest

from shared.feature_store.feature_builder import FeatureBuilder
from shared.libs.testing.synthetic import seed_synthetic_tenant, WeatherShock


@pytest.mark.asyncio
async def test_feature_builder_with_synthetic_data(tmp_path: Path):
    tenant_id = "tenantSynthetic"
    seed_synthetic_tenant(tmp_path, tenant_id, days=5, shocks=[WeatherShock(start_day=1, end_day=2, temp_delta=5, rain_mm=10)])

    builder = FeatureBuilder(lake_root=tmp_path)
    matrix = builder.build(tenant_id, start=datetime(2024, 1, 3), end=datetime(2024, 1, 7))

    assert matrix.frame.height > 0
    expected_columns = {"date", "net_revenue", "meta_spend", "google_spend", "promos_sent"}
    assert expected_columns.issubset(set(matrix.frame.columns))
    assert matrix.orders_rows > 0
    assert matrix.ads_rows > 0
    assert matrix.promo_rows > 0
