#!/usr/bin/env python3
"""
Validate weather correlations in synthetic tenant data.

This script checks if generated synthetic data has weather correlations
within expected ranges for each tenant type.
"""
import argparse
import json
import sys
from pathlib import Path
import polars as pl
import numpy as np


EXPECTED_CORRELATIONS = {
    "extreme": (-1.0, -0.75),   # Strong negative correlation
    "high": (-0.85, -0.60),     # Moderate-high negative correlation
    "medium": (-0.60, -0.30),   # Moderate negative correlation
    "no": (-0.15, 0.15),        # Near-zero correlation
    "none": (-0.15, 0.15),
}


def load_tenant_data(parquet_path: Path) -> pl.DataFrame:
    """Load tenant data from parquet file."""
    return pl.read_parquet(parquet_path)


def calculate_weather_correlation(df: pl.DataFrame) -> float:
    """
    Calculate correlation between weather (temperature) and revenue.

    Returns:
        Pearson correlation coefficient
    """
    # Aggregate daily revenue and temperature
    daily = df.group_by("date").agg([
        pl.col("revenue_usd").sum().alias("total_revenue"),
        pl.col("temperature_celsius").mean().alias("avg_temperature")
    ])

    revenue = daily["total_revenue"].to_numpy()
    temperature = daily["avg_temperature"].to_numpy()

    correlation = np.corrcoef(revenue, temperature)[0, 1]
    return float(correlation)


def determine_tenant_type(tenant_name: str) -> str:
    """Determine expected tenant type from name."""
    name_lower = tenant_name.lower()

    if any(keyword in name_lower for keyword in ["extreme", "ski", "heater", "umbrella"]):
        return "extreme"
    elif any(keyword in name_lower for keyword in ["high", "winter", "summer", "rain"]):
        return "high"
    elif any(keyword in name_lower for keyword in ["medium", "mixed"]):
        return "medium"
    else:
        return "no"


def validate_tenant(parquet_path: Path) -> dict:
    """
    Validate a single tenant's weather correlation.

    Returns:
        dict with validation results
    """
    tenant_name = parquet_path.stem
    tenant_type = determine_tenant_type(tenant_name)
    expected_range = EXPECTED_CORRELATIONS.get(tenant_type, (-1.0, 1.0))

    try:
        df = load_tenant_data(parquet_path)
        actual_correlation = calculate_weather_correlation(df)

        within_range = expected_range[0] <= actual_correlation <= expected_range[1]

        return {
            "tenant": tenant_name,
            "type": tenant_type,
            "expected_range": expected_range,
            "actual_correlation": round(actual_correlation, 3),
            "within_range": within_range,
            "error": None
        }

    except Exception as e:
        return {
            "tenant": tenant_name,
            "type": tenant_type,
            "expected_range": expected_range,
            "actual_correlation": None,
            "within_range": False,
            "error": str(e)
        }


def main():
    parser = argparse.ArgumentParser(description='Validate weather correlations in synthetic data')
    parser.add_argument('data_dir', type=Path, help='Directory containing parquet files')
    parser.add_argument('--min-accuracy', type=float, default=0.80, help='Minimum accuracy rate (default: 0.80)')
    parser.add_argument('--output', type=Path, help='Optional JSON output file')

    args = parser.parse_args()

    if not args.data_dir.exists():
        print(f"Error: Directory not found: {args.data_dir}", file=sys.stderr)
        sys.exit(1)

    # Find all parquet files
    parquet_files = list(args.data_dir.glob("*.parquet"))
    if not parquet_files:
        print(f"Error: No parquet files found in {args.data_dir}", file=sys.stderr)
        sys.exit(1)

    # Validate each tenant
    results = []
    for pf in sorted(parquet_files):
        result = validate_tenant(pf)
        results.append(result)

    # Calculate summary
    total = len(results)
    within_range = sum(1 for r in results if r["within_range"])
    accuracy = within_range / total if total > 0 else 0

    summary = {
        "total_tenants": total,
        "within_range": within_range,
        "accuracy": round(accuracy, 3),
        "passed": accuracy >= args.min_accuracy,
        "results": results
    }

    # Print summary
    print(f"Weather Correlation Validation")
    print(f"=" * 50)
    print(f"Total tenants: {total}")
    print(f"Within range: {within_range}/{total} ({accuracy * 100:.1f}%)")
    print(f"Threshold: {args.min_accuracy * 100:.0f}%")
    print(f"Status: {'✅ PASS' if summary['passed'] else '❌ FAIL'}")
    print()

    # Print details
    for result in results:
        status = "✓" if result["within_range"] else "✗"
        expected = f"{result['expected_range'][0]:.2f} to {result['expected_range'][1]:.2f}"
        actual = f"{result['actual_correlation']:.3f}" if result["actual_correlation"] is not None else "ERROR"
        print(f"  {status} {result['tenant']:40s} {result['type']:8s}  Expected: {expected:15s}  Actual: {actual}")
        if result["error"]:
            print(f"     Error: {result['error']}")

    # Save to file if requested
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, 'w') as f:
            json.dump(summary, f, indent=2)
        print(f"\nResults saved to: {args.output}")

    # Exit with appropriate code
    sys.exit(0 if summary['passed'] else 1)


if __name__ == "__main__":
    main()
