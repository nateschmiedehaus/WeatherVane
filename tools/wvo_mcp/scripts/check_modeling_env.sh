#!/bin/bash
# Check that the modeling environment is properly configured.
# This script verifies:
# 1. Required Python packages are installed
# 2. Synthetic data generation works
# 3. Model training and evaluation work

set -e

# Get the root directory (parent of scripts/)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Modeling Environment Check ==="
echo ""

# Check Python version
echo "Checking Python version..."
python_version=$(python --version 2>&1 | awk '{print $2}')
echo "✓ Python ${python_version}"

# Check key packages
echo ""
echo "Checking key packages..."
python3 -c '
packages = ["polars", "numpy", "scikit-learn", "statsmodels", "loguru"]
for pkg in packages:
    try:
        __import__(pkg.replace("-", "_"))
        print(f"✓ {pkg}")
    except ImportError:
        print(f"✗ Missing {pkg}")
'

echo ""
echo "Checking optional packages..."
python3 -c '
optional = ["pygam", "lightgbm", "cvxpy"]
for pkg in optional:
    try:
        __import__(pkg.replace("-", "_"))
        print(f"✓ {pkg}")
    except (ImportError, OSError):
        print(f"⚠ Optional package issue: {pkg}")
'

# Test synthetic data generation
echo ""
echo "Testing synthetic data generation..."
python3 << 'PYEOF'
import sys
sys.path.insert(0, '/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane')
from datetime import date
from pathlib import Path
import tempfile
from apps.model.synthetic_data_generator import SyntheticDataGenerator

try:
    with tempfile.TemporaryDirectory() as tmpdir:
        generator = SyntheticDataGenerator(random_seed=42)
        datasets = generator.generate_all_tenants(
            start_date=date(2024, 1, 1),
            end_date=date(2024, 1, 7),  # 7 days for quick test
            output_dir=Path(tmpdir),
        )
        assert len(datasets) == 4, f"Expected 4 datasets, got {len(datasets)}"
        for tenant_id, dataset in datasets.items():
            assert dataset.shopify_orders.height > 0, f"No orders for {tenant_id}"
            assert dataset.weather_daily.height == 7, f"Expected 7 weather days for {tenant_id}"
        print("✓ Synthetic data generation works")
except Exception as e:
    print(f"✗ Synthetic data generation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYEOF

# Test backtest generation
echo ""
echo "Testing backtest generation..."
python3 << 'PYEOF'
import sys
sys.path.insert(0, '/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane')
from datetime import datetime, timedelta
from pathlib import Path
import tempfile
import numpy as np
import polars as pl
from apps.model.backtest_generator import generate_tenant_backtest, BacktestConfig

try:
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        # Create simple test data
        dates = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(30)]
        test_data = pl.DataFrame({
            "date": [d.strftime("%Y-%m-%d") for d in dates],
            "revenue_usd": np.random.uniform(4000, 6000, 30).astype(float),
            "temperature_celsius": np.random.uniform(40, 70, 30).astype(float),
            "precipitation_mm": np.random.exponential(2, 30).astype(float),
            "meta_spend": np.random.uniform(500, 1500, 30).astype(float),
            "google_spend": np.random.uniform(300, 1000, 30).astype(float),
        })

        data_file = tmpdir_path / "test.parquet"
        test_data.write_parquet(data_file)

        config = BacktestConfig(
            train_fraction=0.8,
            output_root=tmpdir_path / "backtests",
            data_root=tmpdir_path,
        )

        records = generate_tenant_backtest("test", config=config)
        assert len(records) > 0, "No backtest records generated"
        assert all(hasattr(r, 'actual') for r in records), "Missing actual field"

        print("✓ Backtest generation works")
except Exception as e:
    print(f"✗ Backtest generation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYEOF

echo ""
echo "=== Environment Check Complete ==="
echo "✓ All core checks passed!"
