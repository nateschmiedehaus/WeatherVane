"""Mock data quality service for testing."""

class MockDataQualityService:
    def __init__(self):
        self.quality_metrics = {
            "overall_score": 85.0,
            "missing_rate": 0.002,  # 0.2%
            "outlier_rate": 0.03,  # 3%
        }

    def get_quality_metrics(self):
        return self.quality_metrics