#!/usr/bin/env python3
"""
Weather-aware GAM Training Script

Trains a Generalized Additive Model (GAM) that captures non-linear
weather effects and marketing interactions for revenue prediction.

Usage:
    python train_weather_gam.py --tenant default --start 2024-01-01 --end 2024-10-24
    python train_weather_gam.py --help

Output:
    - Model artifacts saved to storage/models/baseline/
    - Training metrics printed to stdout
    - Feature importance visualization
"""

import argparse
import json
import pickle
from datetime import datetime
from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd
from rich.console import Console
from rich.table import Table

from weather_gam import train_weather_gam, WeatherGAMModel

console = Console()


def print_training_metrics(model: WeatherGAMModel, df: pd.DataFrame, target: str = "net_revenue") -> Dict:
    """
    Print comprehensive training metrics.
    
    Args:
        model: Trained GAM model
        df: Training dataframe
        target: Target column name
        
    Returns:
        dict: Metrics dictionary for logging
    """
    # Generate predictions
    y_true = df[target].values
    y_pred = model.predict(df)
    
    # Calculate metrics
    mse = np.mean((y_true - y_pred) ** 2)
    rmse = np.sqrt(mse)
    mae = np.mean(np.abs(y_true - y_pred))
    r2 = 1 - (np.sum((y_true - y_pred) ** 2) / np.sum((y_true - y_true.mean()) ** 2))
    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-8))) * 100
    
    # Print metrics table
    console.print("\n[bold green]✓ Training Metrics[/bold green]\n")
    
    metrics_table = Table(show_header=True, header_style="bold cyan")
    metrics_table.add_column("Metric", style="dim")
    metrics_table.add_column("Value", justify="right")
    
    metrics_table.add_row("Model Type", model.source.upper())
    metrics_table.add_row("R² Score", f"{r2:.4f}")
    metrics_table.add_row("RMSE", f"${rmse:,.2f}")
    metrics_table.add_row("MAE", f"${mae:,.2f}")
    metrics_table.add_row("MAPE", f"{mape:.2f}%")
    metrics_table.add_row("Base ROAS", f"{model.base_roas:.2f}x")
    
    console.print(metrics_table)
    
    # Print feature importance
    console.print("\n[bold green]✓ Feature Importance (Top 10)[/bold green]\n")
    
    importance = model.get_feature_importance()
    sorted_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]
    
    feat_table = Table(show_header=True, header_style="bold cyan")
    feat_table.add_column("Feature", style="dim")
    feat_table.add_column("Importance", justify="right")
    
    for feat, score in sorted_features:
        feat_table.add_row(feat, f"{score:.4f}")
    
    console.print(feat_table)
    
    # Print ROAS by channel
    if model.mean_roas:
        console.print("\n[bold green]✓ ROAS by Channel[/bold green]\n")
        
        roas_table = Table(show_header=True, header_style="bold cyan")
        roas_table.add_column("Channel", style="dim")
        roas_table.add_column("Mean ROAS", justify="right")
        roas_table.add_column("Elasticity", justify="right")
        
        for channel, roas in model.mean_roas.items():
            elasticity = model.elasticity.get(channel, 0.0)
            channel_name = channel.replace("_spend", "")
            roas_table.add_row(channel_name, f"{roas:.2f}x", f"{elasticity:.2f}")
        
        console.print(roas_table)
    
    return {
        "model_type": model.source,
        "r2": float(r2),
        "rmse": float(rmse),
        "mae": float(mae),
        "mape": float(mape),
        "base_roas": float(model.base_roas),
        "n_features": len(model.features),
        "n_samples": len(df),
    }


def save_model_artifacts(
    model: WeatherGAMModel,
    metrics: Dict,
    output_path: Path,
    tenant_id: str
) -> None:
    """
    Save model artifacts to disk.
    
    Args:
        model: Trained model
        metrics: Training metrics
        output_path: Output directory
        tenant_id: Tenant identifier
    """
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Save model pickle
    model_file = output_path / f"weather_gam_{tenant_id}.pkl"
    with open(model_file, "wb") as f:
        pickle.dump(model, f)
    console.print(f"\n✓ Model saved: {model_file}")
    
    # Save metrics JSON
    metrics_file = output_path / f"weather_gam_{tenant_id}_metrics.json"
    with open(metrics_file, "w") as f:
        json.dump(metrics, f, indent=2)
    console.print(f"✓ Metrics saved: {metrics_file}")
    
    # Save feature list
    features_file = output_path / f"weather_gam_{tenant_id}_features.json"
    with open(features_file, "w") as f:
        json.dump({
            "features": model.features,
            "coefficients": model.coefficients,
            "importance": model.get_feature_importance(),
        }, f, indent=2)
    console.print(f"✓ Features saved: {features_file}")


def main():
    """Main training script."""
    parser = argparse.ArgumentParser(
        description="Train weather-aware GAM model for revenue prediction"
    )
    parser.add_argument(
        "--tenant",
        type=str,
        default="default",
        help="Tenant identifier (default: default)"
    )
    parser.add_argument(
        "--start",
        type=str,
        required=True,
        help="Training start date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--end",
        type=str,
        required=True,
        help="Training end date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--lake-root",
        type=str,
        default="storage/lake/raw",
        help="Root path for feature lake (default: storage/lake/raw)"
    )
    parser.add_argument(
        "--output-root",
        type=str,
        default="storage/models/baseline",
        help="Root path for model artifacts (default: storage/models/baseline)"
    )
    
    args = parser.parse_args()
    
    # Parse dates
    start_date = datetime.strptime(args.start, "%Y-%m-%d")
    end_date = datetime.strptime(args.end, "%Y-%m-%d")
    
    # Print header
    console.print("\n[bold cyan]═══════════════════════════════════════════════[/bold cyan]")
    console.print("[bold cyan]  Weather-Aware GAM Training[/bold cyan]")
    console.print("[bold cyan]═══════════════════════════════════════════════[/bold cyan]\n")
    
    console.print(f"Tenant:       {args.tenant}")
    console.print(f"Period:       {args.start} to {args.end}")
    console.print(f"Lake Root:    {args.lake_root}")
    console.print(f"Output Root:  {args.output_root}\n")
    
    # Train model
    console.print("[bold yellow]→ Loading features and training model...[/bold yellow]\n")
    
    try:
        model = train_weather_gam(
            tenant_id=args.tenant,
            start=start_date,
            end=end_date,
            lake_root=args.lake_root,
            output_root=args.output_root
        )
        
        # Load training data for metrics (in production, this would be cached)
        from shared.feature_store.feature_builder import FeatureBuilder
        feature_builder = FeatureBuilder(args.lake_root)
        df = feature_builder.build_features(
            tenant_id=args.tenant,
            start_date=start_date,
            end_date=end_date
        )
        
        # Print metrics
        metrics = print_training_metrics(model, df)
        
        # Save artifacts
        output_path = Path(args.output_root)
        save_model_artifacts(model, metrics, output_path, args.tenant)
        
        # Success message
        console.print("\n[bold green]✓ Training completed successfully![/bold green]\n")
        
        return 0
        
    except Exception as e:
        console.print(f"\n[bold red]✗ Training failed: {e}[/bold red]\n")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
