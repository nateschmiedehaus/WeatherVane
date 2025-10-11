from shared.libs.testing.synthetic import seed_synthetic_tenant
from shared.feature_store.feature_builder import FeatureBuilder
from apps.model.pipelines.poc_models import train_poc_models
from pathlib import Path
from datetime import datetime

def test_train_poc_models(tmp_path: Path):
    tenant = "tenantModel"
    seed_synthetic_tenant(tmp_path, tenant, days=3)
    builder = FeatureBuilder(lake_root=tmp_path)
    matrix = builder.build(tenant, start=datetime(2024,1,5), end=datetime(2024,1,7))

    bundle = train_poc_models(matrix.observed_frame.to_dict(as_series=False))

    assert bundle.baseline.features
    assert bundle.mmm.base_roas >= 0
    assert "row_count" in bundle.diagnostics
    assert "expected_revenue" in bundle.quantiles
    assert bundle.timeseries is not None
    assert "timeseries_r2" in bundle.diagnostics
