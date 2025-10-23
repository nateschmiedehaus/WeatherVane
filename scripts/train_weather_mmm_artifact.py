#!/usr/bin/env python
"""Generate weather-aware MMM artifact for validation."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to path
project_root = Path(__file__).resolve().parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from apps.model.train_weather_mmm import train_weather_mmm
from shared.libs.testing.synthetic import SYNTHETIC_ANCHOR_DATE, seed_synthetic_tenant


def generate_weather_mmm_artifact() -> None:
    """Generate weather-aware MMM model artifact."""

    # Create temporary directory for data
    lake_root = Path("storage/lake/raw")
    output_root = Path("experiments/mcp")

    # Ensure directories exist
    lake_root.mkdir(parents=True, exist_ok=True)
    output_root.mkdir(parents=True, exist_ok=True)

    # Use a standard tenant from synthetic data
    tenant_id = "brand-alpine-outfitters"

    # Check if tenant data already exists; if not, seed it
    tenant_lake = lake_root / f"{tenant_id}_shopify_orders.parquet"
    if not tenant_lake.exists():
        print(f"Seeding synthetic data for {tenant_id}...")
        seed_synthetic_tenant(lake_root, tenant_id, days=120)

    # Train model on 90 days of data
    start = SYNTHETIC_ANCHOR_DATE - timedelta(days=120)
    end = SYNTHETIC_ANCHOR_DATE - timedelta(days=30)

    print(f"Training weather-aware MMM for {tenant_id}...")
    print(f"  Window: {start.date()} to {end.date()}")

    result = train_weather_mmm(
        tenant_id,
        start,
        end,
        lake_root=lake_root,
        output_root=output_root / "models",
        run_id="weather-model-artifact",
    )

    # Copy model to final artifact location
    artifact_path = output_root / "mmm_weather_model.json"

    # Load the model JSON
    model_json = json.loads(result.model_path.read_text())

    # Add additional metadata for artifact
    artifact_json = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "version": "1.0",
        "task_id": "T12.3.1",
        "description": "Weather-aware MMM model trained on 90-day validated tenant data",
        "model": model_json,
        "validation": {
            "tenant_id": result.tenant_id,
            "run_id": result.run_id,
            "data_rows": result.metadata.data_rows,
            "weather_rows": result.metadata.weather_rows,
            "weather_coverage": result.metadata.weather_coverage_ratio,
            "spend_channels": result.metadata.spend_channels,
            "weather_features": result.metadata.weather_features,
        },
    }

    # Write artifact
    artifact_path.write_text(json.dumps(artifact_json, indent=2, sort_keys=True))

    print(f"\nWeather-aware MMM artifact generated:")
    print(f"  Path: {artifact_path}")
    print(f"  Size: {artifact_path.stat().st_size} bytes")
    print(f"\nModel Summary:")
    print(f"  Tenant: {result.tenant_id}")
    print(f"  Data Rows: {result.metadata.data_rows}")
    print(f"  Weather Rows: {result.metadata.weather_rows}")
    print(f"  Weather Coverage: {result.metadata.weather_coverage_ratio:.1%}")
    print(f"  Base ROAS: {result.metadata.base_roas:.3f}")
    print(f"  Spend Channels: {', '.join(result.metadata.spend_channels)}")
    print(f"  Weather Features: {', '.join(result.metadata.weather_features)}")


if __name__ == "__main__":
    generate_weather_mmm_artifact()
