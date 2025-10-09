from datetime import datetime

from shared.data_context.service import ContextService
from shared.data_context.models import DatasetProfile


def make_profile(name: str, rows: int) -> DatasetProfile:
    return DatasetProfile(
        name=name,
        row_count=rows,
        null_ratios={},
        latest_timestamp=datetime.utcnow(),
        coverage={},
    )


def test_context_service_marks_geo_missing(tmp_path):
    service = ContextService(root=tmp_path)
    service.record_profile("tenant", make_profile("orders", 100))

    tags = service.derive_tags("tenant", metadata={"orders_geocoded_ratio": 0.1})
    assert "geo.missing" in tags

    tags_partial = service.derive_tags("tenant", metadata={"orders_geocoded_ratio": 0.5})
    assert "geo.partial" in tags_partial
    assert "geo.missing" not in tags_partial

    tags_healthy = service.derive_tags("tenant", metadata={"orders_geocoded_ratio": 0.95})
    assert "geo.partial" not in tags_healthy
    assert "geo.missing" not in tags_healthy
