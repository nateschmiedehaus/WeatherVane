#!/usr/bin/env python3
"""
Validation script for 90-day tenant data coverage across sales, spend, and weather.

This script checks:
1. Shopify orders ingestion (90+ days, geocoding completeness)
2. Ads spend coverage (Meta + Google, date continuity)
3. Weather cache coverage (geohash precision, temporal continuity)
4. Feature matrix joins (coverage ratio, data leakage)

Exit codes:
- 0: All checks passed
- 1: One or more checks failed with actionable feedback
- 2: Environment/dependency error
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import polars as pl
except ImportError:
    print("ERROR: polars not installed", file=sys.stderr)
    sys.exit(2)

# Add .deps to path for vendored libraries
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / ".deps"))
sys.path.insert(0, str(ROOT))

from shared.libs.storage.lake import read_parquet
from shared.feature_store.feature_builder import FeatureBuilder


class CoverageValidator:
    """Validates 90-day tenant data coverage across all dimensions."""

    def __init__(self, lake_root: Path = Path("storage/lake/raw"), window_days: int = 90, end_date = None):
        self.lake_root = Path(lake_root)
        self.window_days = window_days
        # Use provided end_date, or detect from data if not provided
        if end_date:
            # Handle both datetime and date objects
            from datetime import date as date_type
            if isinstance(end_date, date_type) and not isinstance(end_date, datetime):
                self.end_date = end_date
            else:
                self.end_date = end_date.date() if isinstance(end_date, datetime) else end_date
        else:
            self.end_date = None  # Will be detected from data
        self.start_date = None  # Will be calculated after end_date is known
        self.defects: List[Dict[str, Any]] = []
        self.metrics: Dict[str, Any] = {}

    def log_defect(
        self,
        severity: str,
        component: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log a defect with severity, component, and actionable feedback."""
        defect = {
            "severity": severity,  # "critical", "warning", "info"
            "component": component,  # "shopify", "ads", "weather", "joins"
            "message": message,
            "details": details or {},
            "timestamp": datetime.utcnow().isoformat(),
        }
        self.defects.append(defect)
        status_emoji = {"critical": "🚨", "warning": "⚠️", "info": "ℹ️"}[severity]
        print(f"{status_emoji} [{component}] {message}")

    def validate_shopify_orders(self, tenant_id: str) -> bool:
        """Validate Shopify orders have 90+ days of history with geocoding."""
        print(f"\n📦 Validating Shopify orders for {tenant_id}...")
        dataset_name = f"{tenant_id}_shopify_orders"

        try:
            orders = read_parquet(self.lake_root / dataset_name)
        except FileNotFoundError:
            self.log_defect(
                "critical",
                "shopify",
                f"Dataset {dataset_name} not found in lake",
                {"dataset": dataset_name, "lake_root": str(self.lake_root)},
            )
            return False

        if orders.is_empty():
            self.log_defect("critical", "shopify", f"{dataset_name} is empty", {})
            return False

        # Check required columns
        required_cols = {"tenant_id", "order_id", "created_at", "net_revenue"}
        missing_cols = required_cols - set(orders.columns)
        if missing_cols:
            self.log_defect(
                "critical",
                "shopify",
                f"Missing required columns: {missing_cols}",
                {"dataset": dataset_name, "columns": orders.columns},
            )
            return False

        # Parse dates and check 90-day window
        try:
            # created_at is ISO 8601 format: "2023-09-10T00:00:00Z"
            orders_with_date = orders.with_columns(
                pl.col("created_at")
                .str.slice(0, 10)  # Extract YYYY-MM-DD
                .str.to_date()
                .alias("date")
            )
        except Exception as e:
            self.log_defect(
                "critical",
                "shopify",
                f"Failed to parse created_at dates: {e}",
                {"error": str(e)},
            )
            return False

        distinct_dates = orders_with_date.select("date").unique().sort("date")
        if distinct_dates.is_empty():
            self.log_defect("critical", "shopify", "No valid dates found in created_at", {})
            return False

        first_date = distinct_dates.row(0)[0]
        last_date = distinct_dates.row(-1)[0]
        date_range_days = (last_date - first_date).days

        if date_range_days < self.window_days - 5:  # Allow 5-day tolerance
            self.log_defect(
                "warning",
                "shopify",
                f"Orders span only {date_range_days} days (need {self.window_days})",
                {
                    "first_date": str(first_date),
                    "last_date": str(last_date),
                    "range_days": date_range_days,
                },
            )

        # Check geocoding completeness
        geocoded_col = None
        for col in ["ship_geohash", "geohash", "geo_location"]:
            if col in orders.columns:
                geocoded_col = col
                break

        if not geocoded_col:
            self.log_defect(
                "warning",
                "shopify",
                "No geocoding column found (ship_geohash, geohash, or geo_location)",
                {"columns": orders.columns},
            )
            geocoded_ratio = 0.0
        else:
            geocoded_count = orders.filter(pl.col(geocoded_col).is_not_null()).height
            geocoded_ratio = geocoded_count / orders.height if orders.height > 0 else 0.0

        if geocoded_ratio < 0.5:
            self.log_defect(
                "warning",
                "shopify",
                f"Geocoding ratio {geocoded_ratio:.1%} below 50% threshold",
                {
                    "geocoded_col": geocoded_col,
                    "geocoded_count": geocoded_count,
                    "total_orders": orders.height,
                },
            )

        self.metrics["shopify"] = {
            "row_count": orders.height,
            "date_range_days": date_range_days,
            "first_date": str(first_date),
            "last_date": str(last_date),
            "distinct_dates": distinct_dates.height,
            "geocoded_column": geocoded_col,
            "geocoded_ratio": float(geocoded_ratio),
        }
        print(
            f"✅ Shopify: {orders.height} orders, {date_range_days} days, {geocoded_ratio:.1%} geocoded"
        )
        return geocoded_ratio > 0.5 and date_range_days >= self.window_days - 5

    def validate_ads_spend(self, tenant_id: str) -> bool:
        """Validate Meta and Google ads spend coverage."""
        print(f"\n💰 Validating ads spend for {tenant_id}...")
        spend_dates = set()
        ads_metrics = {"meta_rows": 0, "google_rows": 0, "meta_dates": 0, "google_dates": 0}

        for platform, dataset_name in [
            ("meta", f"{tenant_id}_meta_ads"),
            ("google", f"{tenant_id}_google_ads"),
        ]:
            try:
                ads = read_parquet(self.lake_root / dataset_name)
            except FileNotFoundError:
                self.log_defect(
                    "warning",
                    "ads",
                    f"Dataset {dataset_name} not found",
                    {"dataset": dataset_name},
                )
                continue

            if ads.is_empty():
                self.log_defect("warning", "ads", f"{dataset_name} is empty", {})
                continue

            # Find date column (could be created_at, date, day, etc.)
            date_col = None
            for col in ["created_at", "date", "day", "campaign_date"]:
                if col in ads.columns:
                    date_col = col
                    break

            if not date_col:
                self.log_defect(
                    "warning",
                    "ads",
                    f"No date column found in {dataset_name}",
                    {"columns": ads.columns},
                )
                continue

            try:
                ads_with_date = ads.with_columns(pl.col(date_col).cast(pl.Date).alias("date"))
                distinct_ad_dates = (
                    ads_with_date.select("date").unique().sort("date")
                )
                spend_dates.update([str(d[0]) for d in distinct_ad_dates.rows()])

                ads_metrics[f"{platform}_rows"] = ads.height
                ads_metrics[f"{platform}_dates"] = distinct_ad_dates.height

                # Check for spend column
                spend_col = None
                for col in ["spend", "cost", "amount", "total_spend"]:
                    if col in ads.columns:
                        spend_col = col
                        break

                if spend_col:
                    total_spend = ads_with_date.select(pl.col(spend_col).sum()).row(0)[0]
                    ads_metrics[f"{platform}_total_spend"] = float(total_spend or 0)

            except Exception as e:
                self.log_defect(
                    "warning",
                    "ads",
                    f"Error processing {dataset_name}: {e}",
                    {"error": str(e), "dataset": dataset_name},
                )

        if not spend_dates:
            self.log_defect(
                "critical",
                "ads",
                "No spend data found in Meta or Google ads datasets",
                {},
            )
            return False

        # Simple date range calculation
        spend_range_days = 0
        if len(spend_dates) > 1:
            dates_sorted = sorted(spend_dates)
            from datetime import datetime

            try:
                first = datetime.fromisoformat(dates_sorted[0].split("T")[0] if "T" in dates_sorted[0] else dates_sorted[0])
                last = datetime.fromisoformat(dates_sorted[-1].split("T")[0] if "T" in dates_sorted[-1] else dates_sorted[-1])
                spend_range_days = (last - first).days
            except Exception as parse_err:
                self.log_defect(
                    "warning",
                    "ads",
                    f"Could not parse spend dates: {parse_err}",
                    {"sample_dates": dates_sorted[:3]},
                )

        if spend_range_days < self.window_days - 5:
            self.log_defect(
                "warning",
                "ads",
                f"Spend data spans only {spend_range_days} days (need {self.window_days})",
                {
                    "date_range_days": spend_range_days,
                    "distinct_spend_dates": len(spend_dates),
                },
            )

        self.metrics["ads"] = ads_metrics
        print(f"✅ Ads: Meta {ads_metrics.get('meta_dates', 0)} dates, Google {ads_metrics.get('google_dates', 0)} dates")
        return spend_range_days >= self.window_days - 5

    def validate_weather_cache(self, tenant_id: str) -> bool:
        """Validate weather cache coverage and geohash precision."""
        print(f"\n🌤️  Validating weather cache for {tenant_id}...")
        dataset_name = f"{tenant_id}_weather_daily"

        try:
            weather = read_parquet(self.lake_root / dataset_name)
        except FileNotFoundError:
            self.log_defect(
                "warning",
                "weather",
                f"Dataset {dataset_name} not found",
                {"dataset": dataset_name},
            )
            return False

        if weather.is_empty():
            self.log_defect("warning", "weather", f"{dataset_name} is empty", {})
            return False

        # Check required columns
        required_cols = {"date", "geohash", "temp_c"}
        missing_cols = required_cols - set(weather.columns)
        if missing_cols:
            self.log_defect(
                "warning",
                "weather",
                f"Missing weather columns: {missing_cols}",
                {"dataset": dataset_name, "columns": weather.columns},
            )

        # Check date coverage
        try:
            weather_with_date = weather.with_columns(pl.col("date").str.to_date().alias("date_parsed"))
        except Exception as e:
            self.log_defect(
                "warning",
                "weather",
                f"Failed to parse weather dates: {e}",
                {"error": str(e)},
            )
            return False

        distinct_weather_dates = weather_with_date.select("date_parsed").unique().sort("date_parsed")
        if distinct_weather_dates.is_empty():
            self.log_defect("critical", "weather", "No valid dates in weather data", {})
            return False

        first_weather_date = distinct_weather_dates.row(0)[0]
        last_weather_date = distinct_weather_dates.row(-1)[0]
        weather_range_days = (last_weather_date - first_weather_date).days

        # Check geohash coverage
        distinct_geohashes = weather.select("geohash").unique().height
        if distinct_geohashes < 3:
            self.log_defect(
                "warning",
                "weather",
                f"Low geohash diversity: {distinct_geohashes} unique geohashes",
                {"distinct_geohashes": distinct_geohashes},
            )

        # Check for weather anomalies
        weather_stats = weather.select([
            pl.col("temp_c").mean().alias("mean_temp"),
            pl.col("temp_c").max().alias("max_temp"),
            pl.col("temp_c").min().alias("min_temp"),
        ]).row(0)

        if weather_range_days < self.window_days - 5:
            self.log_defect(
                "warning",
                "weather",
                f"Weather spans only {weather_range_days} days (need {self.window_days})",
                {
                    "first_date": str(first_weather_date),
                    "last_date": str(last_weather_date),
                    "range_days": weather_range_days,
                },
            )

        self.metrics["weather"] = {
            "row_count": weather.height,
            "date_range_days": weather_range_days,
            "first_date": str(first_weather_date),
            "last_date": str(last_weather_date),
            "distinct_dates": distinct_weather_dates.height,
            "distinct_geohashes": distinct_geohashes,
            "mean_temp_c": float(weather_stats[0] or 0),
            "temp_range_c": (
                float((weather_stats[2] or 0) - (weather_stats[1] or 0))
                if weather_stats[1] and weather_stats[2]
                else None
            ),
        }
        print(
            f"✅ Weather: {weather.height} rows, {weather_range_days} days, {distinct_geohashes} geohashes"
        )
        return weather_range_days >= self.window_days - 5

    def validate_feature_joins(self, tenant_id: str) -> bool:
        """Validate feature matrix joins across all three dimensions."""
        print(f"\n🔗 Validating feature matrix joins for {tenant_id}...")
        try:
            builder = FeatureBuilder(lake_root=self.lake_root)
            matrix = builder.build(
                tenant_id,
                start=datetime.combine(self.start_date, datetime.min.time()),
                end=datetime.combine(self.end_date, datetime.max.time()),
            )
        except Exception as e:
            self.log_defect(
                "critical",
                "joins",
                f"Feature matrix build failed: {e}",
                {"error": str(e), "tenant_id": tenant_id},
            )
            return False

        # Check matrix size
        if matrix.frame.is_empty():
            self.log_defect(
                "critical",
                "joins",
                "Feature matrix is empty after joins",
                {
                    "orders_rows": matrix.orders_rows,
                    "ads_rows": matrix.ads_rows,
                    "weather_rows": matrix.weather_rows,
                },
            )
            return False

        # Check coverage ratios
        if matrix.weather_coverage_ratio < 0.7:
            self.log_defect(
                "warning",
                "joins",
                f"Weather coverage ratio {matrix.weather_coverage_ratio:.1%} below 70%",
                {
                    "coverage_ratio": float(matrix.weather_coverage_ratio),
                    "weather_missing_rows": matrix.weather_missing_rows,
                },
            )

        # Check for leakage
        if matrix.leakage_risk_rows > 0:
            self.log_defect(
                "warning",
                "joins",
                f"Potential label leakage detected: {matrix.leakage_risk_rows} rows",
                {
                    "leakage_rows": matrix.leakage_risk_rows,
                    "leakage_dates": matrix.leakage_risk_dates[:3],  # First 3
                },
            )

        self.metrics["joins"] = {
            "feature_matrix_rows": matrix.frame.height,
            "orders_rows": matrix.orders_rows,
            "ads_rows": matrix.ads_rows,
            "weather_rows": matrix.weather_rows,
            "observed_rows": matrix.observed_rows,
            "geocoded_order_ratio": float(matrix.geocoded_order_ratio or 0),
            "weather_coverage_ratio": float(matrix.weather_coverage_ratio),
            "geography_level": matrix.geography_level,
            "join_mode": matrix.join_mode,
            "leakage_risk_rows": matrix.leakage_risk_rows,
        }
        print(
            f"✅ Joins: {matrix.frame.height} rows, {matrix.weather_coverage_ratio:.1%} weather coverage, {matrix.geography_level} level"
        )
        return matrix.weather_coverage_ratio >= 0.7 and matrix.leakage_risk_rows == 0

    def _detect_data_window(self, tenant_id: str) -> tuple:
        """Auto-detect the data window from available datasets."""
        if self.end_date and self.start_date:
            return self.start_date, self.end_date

        # Read from Shopify orders to find date range
        orders_path = self.lake_root / f"{tenant_id}_shopify_orders"
        if not orders_path.exists():
            return None, None

        try:
            parquet_file = list(orders_path.glob("*.parquet"))[0]
            orders = read_parquet(parquet_file)
            if orders.is_empty():
                return None, None

            # Extract date range
            orders_with_date = orders.with_columns(
                pl.col("created_at")
                .str.slice(0, 10)
                .str.to_date()
                .alias("date")
            )
            dates = orders_with_date.select("date").unique().sort("date")
            first = dates.row(0)[0]
            last = dates.row(-1)[0]

            self.end_date = last
            self.start_date = first
            return first, last
        except Exception as e:
            print(f"Warning: Could not detect data window: {e}")
            return None, None

    def validate_all(self, tenant_id: str) -> bool:
        """Run all validations and return overall pass/fail."""
        # Auto-detect data window if not set
        detected_start, detected_end = self._detect_data_window(tenant_id)
        if not detected_start:
            print("❌ Could not detect data window from tenant datasets")
            return False

        if not self.end_date:
            self.end_date = detected_end
        if not self.start_date:
            self.start_date = detected_start

        print(f"\n{'='*60}")
        print(f"Validating 90-day coverage for tenant: {tenant_id}")
        print(f"Window: {self.start_date} to {self.end_date}")
        print(f"{'='*60}")

        results = {
            "shopify": self.validate_shopify_orders(tenant_id),
            "ads": self.validate_ads_spend(tenant_id),
            "weather": self.validate_weather_cache(tenant_id),
            "joins": self.validate_feature_joins(tenant_id),
        }

        print(f"\n{'='*60}")
        print("Summary:")
        for component, passed in results.items():
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"  {status}: {component}")

        if self.defects:
            print(f"\nDefects ({len(self.defects)}):")
            for defect in self.defects:
                print(f"  - [{defect['severity']}] {defect['component']}: {defect['message']}")

        print(f"\nMetrics saved to: state/analytics/coverage_validation_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}.json")
        print(f"{'='*60}\n")

        return all(results.values())

    def save_report(self, tenant_id: str) -> None:
        """Save validation report to JSON."""
        report = {
            "timestamp": datetime.utcnow().isoformat(),
            "tenant_id": tenant_id,
            "window_days": self.window_days,
            "start_date": str(self.start_date),
            "end_date": str(self.end_date),
            "metrics": self.metrics,
            "defects": self.defects,
            "exit_criteria": {
                "all_defects_are_info": all(d["severity"] == "info" for d in self.defects),
                "shopify_90_days": self.metrics.get("shopify", {}).get("date_range_days", 0) >= 85,
                "ads_90_days": all(
                    (self.metrics.get("ads", {}).get(k, 0) or 0) >= 85
                    for k in ["meta_dates", "google_dates"]
                    if k in self.metrics.get("ads", {})
                ),
                "weather_coverage": self.metrics.get("joins", {}).get("weather_coverage_ratio", 0) >= 0.7,
                "no_leakage": self.metrics.get("joins", {}).get("leakage_risk_rows", 0) == 0,
            },
        }

        report_path = Path("state/analytics") / f"coverage_validation_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2))
        print(f"📊 Report saved to {report_path}")

        return report_path


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Validate 90-day tenant data coverage across sales, spend, and weather"
    )
    parser.add_argument("--tenant-id", default="demo_brand", help="Tenant ID to validate")
    parser.add_argument("--window-days", type=int, default=90, help="Window size in days")
    parser.add_argument("--lake-root", default="storage/lake/raw", help="Lake root path")
    args = parser.parse_args()

    validator = CoverageValidator(
        lake_root=Path(args.lake_root),
        window_days=args.window_days,
    )

    try:
        passed = validator.validate_all(args.tenant_id)
        validator.save_report(args.tenant_id)
        sys.exit(0 if passed else 1)
    except Exception as e:
        print(f"❌ Validation failed with error: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(2)


if __name__ == "__main__":
    main()
