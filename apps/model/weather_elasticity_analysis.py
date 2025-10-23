"""Analyze weather sensitivity elasticity to quantify demand variability by weather conditions.

This module implements weather sensitivity elasticity estimation, which measures:
1. How demand changes with weather conditions (temperature, precipitation)
2. How weather-driven demand sensitivity varies across spending channels
3. Seasonal and temporal patterns in weather elasticity
4. Channel-specific multipliers for weather-adjusted allocation

The output supports real-time weather-responsive budget allocation decisions.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import polars as pl
_LOGGER = logging.getLogger(__name__)

# Thresholds for weather anomaly classification
TEMP_THRESHOLD_HOT = 25.0  # Celsius - high demand suppression
TEMP_THRESHOLD_COLD = 5.0  # Celsius - potential demand increase for some categories
PRECIP_THRESHOLD_HEAVY = 25.0  # mm - significant weather impact
PRECIP_THRESHOLD_MODERATE = 5.0  # mm - measurable impact


def _series_to_numpy(series: pl.Series) -> np.ndarray:
    """Convert a Polars series to a numeric numpy array with NaNs handled."""
    values = series.fill_null(0.0).to_numpy()
    if not isinstance(values, np.ndarray):
        values = np.array(values, dtype=float)

    try:
        numeric = values.astype(float, copy=False)
    except (TypeError, ValueError):
        numeric = np.array([float(v) if v is not None else 0.0 for v in values])

    return np.nan_to_num(numeric, nan=0.0, posinf=0.0, neginf=0.0)


def _coerce_to_datetime(value: Any) -> Optional[datetime]:
    """Best-effort conversion of assorted date representations to datetime."""
    if value is None:
        return None

    if isinstance(value, datetime):
        return value

    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())

    if isinstance(value, np.datetime64):
        python_value = value.tolist()
        if python_value is value:
            return None
        return _coerce_to_datetime(python_value)

    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass

    return None


@dataclass(frozen=True)
class WeatherBand:
    """Temperature or precipitation band for elasticity analysis."""

    name: str
    min_value: float
    max_value: float
    elasticity_multiplier: float  # How much to adjust spend in this condition
    confidence: float  # Statistical confidence (0-1)
    sample_size: int  # Number of observations


@dataclass(frozen=True)
class ChannelWeatherSensitivity:
    """Weather sensitivity profile for a single spend channel."""

    channel: str
    base_elasticity: float  # Baseline elasticity (no weather adjustment)
    temperature_sensitivity: float  # How elasticity changes per 1°C
    precipitation_sensitivity: float  # How elasticity changes per 1mm
    anomaly_sensitivity: float  # Sensitivity to temp/precip anomalies
    mean_elasticity: float  # Average elasticity across all weather conditions
    elasticity_std: float  # Variability in elasticity
    temperature_bands: List[WeatherBand]
    precipitation_bands: List[WeatherBand]


@dataclass(frozen=True)
class WeatherElasticityReport:
    """Comprehensive weather elasticity analysis report."""

    tenant_id: str
    run_id: str
    timestamp_utc: str
    window_start: str
    window_end: str
    data_rows: int
    weather_rows: int

    # Overall elasticity insights
    base_elasticity: float  # Average elasticity across all observations
    weather_elasticity_mean: float  # Average elasticity explained by weather
    weather_elasticity_std: float  # Standard deviation of weather elasticity

    # Temperature impact
    temperature_correlation: float  # Correlation between temp and demand
    temperature_elasticity: float  # Change in elasticity per 1°C
    hot_weather_multiplier: float  # Adjustment factor for >25°C (0.7-1.3 range)
    cold_weather_multiplier: float  # Adjustment factor for <5°C

    # Precipitation impact
    precipitation_correlation: float  # Correlation between precip and demand
    precipitation_elasticity: float  # Change in elasticity per 1mm
    heavy_rain_multiplier: float  # Adjustment factor for >25mm rain
    light_rain_multiplier: float  # Adjustment factor for 5-25mm rain

    # Seasonal patterns
    seasonal_elasticity: Dict[str, float]  # Elasticity by season (Q1-Q4)
    day_of_week_elasticity: Dict[str, float]  # Elasticity by day (Mon-Sun)

    # Channel breakdown
    channel_sensitivities: Dict[str, ChannelWeatherSensitivity]

    # Model quality
    r_squared: float  # Goodness of fit for weather elasticity model
    observations_per_bin: int  # Average samples per weather band

    # Recommendations
    summary: str  # Executive summary of findings


def estimate_weather_elasticity(
    frame: pl.DataFrame,
    spend_cols: List[str],
    weather_cols: List[str],
    revenue_col: str = "revenue",
    *,
    tenant_id: str = "unknown",
    run_id: str | None = None,
) -> WeatherElasticityReport:
    """Estimate weather sensitivity elasticity from revenue and weather data.

    Args:
        frame: Feature matrix with spend, weather, and revenue columns
        spend_cols: Advertising spend channel names
        weather_cols: Weather feature column names (temperature, precipitation, etc.)
        revenue_col: Target revenue column name
        tenant_id: Tenant identifier for tracking
        run_id: Optional run identifier (defaults to timestamp)

    Returns:
        WeatherElasticityReport with elasticity estimates and recommendations
    """

    if frame.is_empty():
        return _empty_elasticity_report(tenant_id, run_id, len(spend_cols), len(weather_cols))

    resolved_run_id = run_id or datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    # Validate columns exist
    for col in spend_cols + weather_cols + [revenue_col]:
        if col not in frame.columns:
            _LOGGER.warning(f"Column {col} not found in frame; skipping elasticity analysis")
            return _empty_elasticity_report(tenant_id, resolved_run_id, len(spend_cols), len(weather_cols))

    # Extract window dates
    date_col = "date" if "date" in frame.columns else None
    weather_rows = int(frame.height)

    if date_col:
        window_start = frame[date_col].min()
        window_end = frame[date_col].max()
    else:
        window_start = None
        window_end = None

    # Compute core elasticity metrics
    base_elasticity = _compute_base_elasticity(frame, spend_cols, revenue_col)
    weather_elasticity_mean, weather_elasticity_std = _compute_weather_elasticity(
        frame, spend_cols, weather_cols, revenue_col
    )

    # Temperature analysis
    temp_cols = [col for col in weather_cols if "temp" in col.lower()]
    temp_correlation, temp_elasticity = _analyze_temperature_elasticity(
        frame, spend_cols, temp_cols, revenue_col
    )
    hot_multiplier, cold_multiplier = _compute_temperature_multipliers(
        frame, temp_cols, revenue_col, temp_elasticity
    )

    # Precipitation analysis
    precip_cols = [col for col in weather_cols if "precip" in col.lower()]
    precip_correlation, precip_elasticity = _analyze_precipitation_elasticity(
        frame, spend_cols, precip_cols, revenue_col
    )
    heavy_rain_mult, light_rain_mult = _compute_precipitation_multipliers(
        frame, precip_cols, revenue_col, precip_elasticity
    )

    # Seasonal patterns
    seasonal_elasticity = _analyze_seasonal_elasticity(frame, spend_cols, revenue_col, date_col)
    day_of_week_elasticity = _analyze_day_of_week_elasticity(frame, spend_cols, revenue_col, date_col)

    # Channel-level sensitivity
    channel_sensitivities = _analyze_channel_sensitivities(
        frame, spend_cols, weather_cols, revenue_col
    )

    # Model quality
    r_squared = _compute_model_quality(frame, spend_cols, weather_cols, revenue_col)
    observations_per_bin = max(1, int(frame.height / max(1, len(weather_cols) * 5)))

    # Generate summary
    summary = _generate_summary(
        base_elasticity,
        weather_elasticity_mean,
        temp_elasticity,
        precip_elasticity,
        r_squared,
        len(channel_sensitivities),
    )

    # Compute weather coverage rows (rows with all weather signals present)
    weather_columns_present = [col for col in weather_cols if col in frame.columns]
    if weather_columns_present:
        coverage_exprs = []
        for col in weather_columns_present:
            expr = pl.col(col).is_not_null()
            dtype = frame[col].dtype
            if dtype in (pl.Float32, pl.Float64):
                expr = expr & (~pl.col(col).is_nan())
            coverage_exprs.append(expr)

        if coverage_exprs:
            coverage = frame.select(pl.all_horizontal(coverage_exprs).alias("_valid"))
            weather_rows = int(coverage["_valid"].sum())

    report = WeatherElasticityReport(
        tenant_id=tenant_id,
        run_id=resolved_run_id,
        timestamp_utc=timestamp,
        window_start=str(window_start) if window_start else "unknown",
        window_end=str(window_end) if window_end else "unknown",
        data_rows=int(frame.height),
        weather_rows=weather_rows,
        base_elasticity=float(base_elasticity),
        weather_elasticity_mean=float(weather_elasticity_mean),
        weather_elasticity_std=float(weather_elasticity_std),
        temperature_correlation=float(temp_correlation),
        temperature_elasticity=float(temp_elasticity),
        hot_weather_multiplier=float(hot_multiplier),
        cold_weather_multiplier=float(cold_multiplier),
        precipitation_correlation=float(precip_correlation),
        precipitation_elasticity=float(precip_elasticity),
        heavy_rain_multiplier=float(heavy_rain_mult),
        light_rain_multiplier=float(light_rain_mult),
        seasonal_elasticity=seasonal_elasticity,
        day_of_week_elasticity=day_of_week_elasticity,
        channel_sensitivities=channel_sensitivities,
        r_squared=float(r_squared),
        observations_per_bin=int(observations_per_bin),
        summary=summary,
    )

    return report


def _compute_base_elasticity(
    frame: pl.DataFrame, spend_cols: List[str], revenue_col: str
) -> float:
    """Compute baseline elasticity across all spend channels."""
    elasticities = []

    revenue = _series_to_numpy(frame[revenue_col])
    if np.var(revenue) == 0:
        return 0.0

    for col in spend_cols:
        if col not in frame.columns:
            continue
        spend = _series_to_numpy(frame[col])
        if np.var(spend) > 0 and np.var(revenue) > 0:
            elasticity = _estimate_elasticity(spend, revenue)
            elasticities.append(elasticity)

    return float(np.mean(elasticities)) if elasticities else 0.0


def _compute_weather_elasticity(
    frame: pl.DataFrame, spend_cols: List[str], weather_cols: List[str], revenue_col: str
) -> Tuple[float, float]:
    """Compute weather-driven elasticity variance."""
    weather_elasticities = []

    revenue = _series_to_numpy(frame[revenue_col])
    if np.var(revenue) == 0:
        return 0.0, 0.0

    for col in weather_cols:
        if col not in frame.columns:
            continue
        weather = _series_to_numpy(frame[col])
        if np.var(weather) > 0 and np.var(revenue) > 0:
            elasticity = _estimate_elasticity(weather, revenue)
            weather_elasticities.append(elasticity)

    if not weather_elasticities:
        return 0.0, 0.0

    mean = float(np.mean(weather_elasticities))
    std = float(np.std(weather_elasticities))
    return mean, std


def _analyze_temperature_elasticity(
    frame: pl.DataFrame, spend_cols: List[str], temp_cols: List[str], revenue_col: str
) -> Tuple[float, float]:
    """Analyze how temperature affects demand elasticity."""
    if not temp_cols:
        return 0.0, 0.0

    # Use the first temperature column (typically temp_c or temp_anomaly)
    temp_col = temp_cols[0]
    if temp_col not in frame.columns:
        return 0.0, 0.0

    temp = _series_to_numpy(frame[temp_col])
    revenue = _series_to_numpy(frame[revenue_col])

    if np.var(temp) == 0 or np.var(revenue) == 0:
        return 0.0, 0.0

    # Compute correlation
    correlation = float(np.corrcoef(temp, revenue)[0, 1])

    # Compute elasticity via regression
    elasticity = _estimate_elasticity(temp, revenue)

    return correlation, elasticity


def _analyze_precipitation_elasticity(
    frame: pl.DataFrame, spend_cols: List[str], precip_cols: List[str], revenue_col: str
) -> Tuple[float, float]:
    """Analyze how precipitation affects demand elasticity."""
    if not precip_cols:
        return 0.0, 0.0

    # Use the first precipitation column
    precip_col = precip_cols[0]
    if precip_col not in frame.columns:
        return 0.0, 0.0

    precip = _series_to_numpy(frame[precip_col])
    revenue = _series_to_numpy(frame[revenue_col])

    if np.var(precip) == 0 or np.var(revenue) == 0:
        return 0.0, 0.0

    # Compute correlation
    correlation = float(np.corrcoef(precip, revenue)[0, 1])

    # Compute elasticity
    elasticity = _estimate_elasticity(precip, revenue)

    return correlation, elasticity


def _compute_temperature_multipliers(
    frame: pl.DataFrame, temp_cols: List[str], revenue_col: str, elasticity: float
) -> Tuple[float, float]:
    """Compute spending multipliers for hot and cold weather."""
    if not temp_cols or elasticity == 0:
        return 1.0, 1.0

    temp_col = temp_cols[0]
    if temp_col not in frame.columns:
        return 1.0, 1.0

    temp = _series_to_numpy(frame[temp_col])

    mean_temp = float(np.mean(temp))

    # Estimate multipliers based on elasticity
    hot_delta = TEMP_THRESHOLD_HOT - mean_temp
    cold_delta = TEMP_THRESHOLD_COLD - mean_temp

    # Apply elasticity to temperature delta
    hot_multiplier = 1.0 + (elasticity * hot_delta / max(1.0, abs(mean_temp)))
    cold_multiplier = 1.0 + (elasticity * cold_delta / max(1.0, abs(mean_temp)))

    # Clamp to reasonable range [0.7, 1.3]
    hot_multiplier = float(np.clip(hot_multiplier, 0.7, 1.3))
    cold_multiplier = float(np.clip(cold_multiplier, 0.7, 1.3))

    return hot_multiplier, cold_multiplier


def _compute_precipitation_multipliers(
    frame: pl.DataFrame, precip_cols: List[str], revenue_col: str, elasticity: float
) -> Tuple[float, float]:
    """Compute spending multipliers for heavy and light rain."""
    if not precip_cols or elasticity == 0:
        return 1.0, 1.0

    precip_col = precip_cols[0]
    if precip_col not in frame.columns:
        return 1.0, 1.0

    precip = _series_to_numpy(frame[precip_col])

    mean_precip = float(np.mean(precip))
    if mean_precip == 0:
        mean_precip = 1.0  # Avoid division by zero

    # Estimate multipliers
    heavy_delta = PRECIP_THRESHOLD_HEAVY - mean_precip
    light_delta = PRECIP_THRESHOLD_MODERATE - mean_precip

    heavy_multiplier = 1.0 + (elasticity * heavy_delta / max(1.0, mean_precip))
    light_multiplier = 1.0 + (elasticity * light_delta / max(1.0, mean_precip))

    # Clamp to reasonable range
    heavy_multiplier = float(np.clip(heavy_multiplier, 0.7, 1.3))
    light_multiplier = float(np.clip(light_multiplier, 0.7, 1.3))

    return heavy_multiplier, light_multiplier


def _analyze_seasonal_elasticity(
    frame: pl.DataFrame, spend_cols: List[str], revenue_col: str, date_col: str | None
) -> Dict[str, float]:
    """Analyze elasticity by quarter."""
    default = {
        "Q1": 0.0,
        "Q2": 0.0,
        "Q3": 0.0,
        "Q4": 0.0,
    }

    if not date_col or date_col not in frame.columns or frame.is_empty():
        return default

    revenue = _series_to_numpy(frame[revenue_col])
    if np.var(revenue) == 0:
        return default

    dates = [_coerce_to_datetime(val) for val in frame[date_col].to_list()]
    quarter_indices: Dict[int, List[int]] = {1: [], 2: [], 3: [], 4: []}

    for idx, dt_value in enumerate(dates):
        if not dt_value:
            continue
        quarter = ((dt_value.month - 1) // 3) + 1
        quarter_indices[quarter].append(idx)

    seasonal: Dict[str, float] = {}
    for quarter, indices in quarter_indices.items():
        if not indices:
            seasonal[f"Q{quarter}"] = 0.0
            continue

        elasticities = []
        revenue_subset = revenue[indices]
        if np.var(revenue_subset) == 0:
            seasonal[f"Q{quarter}"] = 0.0
            continue

        for col in spend_cols:
            if col not in frame.columns:
                continue
            spend = _series_to_numpy(frame[col])[indices]
            if len(spend) > 1 and np.var(spend) > 0:
                elasticity = _estimate_elasticity(spend, revenue_subset)
                elasticities.append(elasticity)

        seasonal[f"Q{quarter}"] = float(np.mean(elasticities)) if elasticities else 0.0

    return seasonal


def _analyze_day_of_week_elasticity(
    frame: pl.DataFrame, spend_cols: List[str], revenue_col: str, date_col: str | None
) -> Dict[str, float]:
    """Analyze elasticity by day of week."""
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    elasticity_by_day = {day: 0.0 for day in day_names}

    if not date_col or date_col not in frame.columns or frame.is_empty():
        return elasticity_by_day

    dates = [_coerce_to_datetime(val) for val in frame[date_col].to_list()]
    revenue = _series_to_numpy(frame[revenue_col])
    if np.var(revenue) == 0:
        return {
            day: 0.0 for day in day_names
        }

    day_indices: Dict[int, List[int]] = {i: [] for i in range(7)}
    for idx, dt_value in enumerate(dates):
        if not dt_value:
            continue
        day_indices[dt_value.weekday()].append(idx)

    for day_idx, indices in day_indices.items():
        day_name = day_names[day_idx]
        if not indices:
            elasticity_by_day[day_name] = 0.0
            continue

        elasticities = []
        revenue_subset = revenue[indices]
        if np.var(revenue_subset) == 0:
            elasticity_by_day[day_name] = 0.0
            continue

        for col in spend_cols:
            if col not in frame.columns:
                continue
            spend = _series_to_numpy(frame[col])[indices]
            if len(spend) > 1 and np.var(spend) > 0:
                elasticity = _estimate_elasticity(spend, revenue_subset)
                elasticities.append(elasticity)

        elasticity_by_day[day_name] = float(np.mean(elasticities)) if elasticities else 0.0

    return elasticity_by_day


def _analyze_channel_sensitivities(
    frame: pl.DataFrame, spend_cols: List[str], weather_cols: List[str], revenue_col: str
) -> Dict[str, ChannelWeatherSensitivity]:
    """Analyze weather sensitivity for each spend channel."""
    sensitivities: Dict[str, ChannelWeatherSensitivity] = {}
    revenue_all = _series_to_numpy(frame[revenue_col])
    if np.var(revenue_all) == 0:
        return sensitivities

    for spend_col in spend_cols:
        if spend_col not in frame.columns:
            continue

        spend = _series_to_numpy(frame[spend_col])
        revenue = revenue_all

        if np.var(spend) == 0 or np.var(revenue) == 0:
            continue

        # Base elasticity for this channel
        base_elasticity = _estimate_elasticity(spend, revenue)

        # Weather sensitivities
        temp_sensitivity = 0.0
        precip_sensitivity = 0.0
        anomaly_sensitivity = 0.0

        for weather_col in weather_cols:
            if weather_col not in frame.columns:
                continue

            weather = _series_to_numpy(frame[weather_col])
            if np.var(weather) > 0:
                interaction = spend * weather
                if np.var(interaction) > 0:
                    inter_elasticity = _estimate_elasticity(interaction, revenue)

                    if "temp" in weather_col.lower():
                        temp_sensitivity += inter_elasticity
                    elif "precip" in weather_col.lower():
                        precip_sensitivity += inter_elasticity
                    elif "anomaly" in weather_col.lower():
                        anomaly_sensitivity += inter_elasticity

        # Normalize
        temp_cols = [c for c in weather_cols if "temp" in c.lower()]
        precip_cols = [c for c in weather_cols if "precip" in c.lower()]
        anomaly_cols = [c for c in weather_cols if "anomaly" in c.lower()]

        if temp_cols:
            temp_sensitivity /= len(temp_cols)
        if precip_cols:
            precip_sensitivity /= len(precip_cols)
        if anomaly_cols:
            anomaly_sensitivity /= len(anomaly_cols)

        # Temperature bands
        temp_bands = _create_weather_bands("temperature", frame, weather_cols, revenue_col)
        precip_bands = _create_weather_bands("precipitation", frame, weather_cols, revenue_col)

        elasticity_components = [base_elasticity]
        if temp_cols:
            elasticity_components.append(temp_sensitivity)
        if precip_cols:
            elasticity_components.append(precip_sensitivity)
        if anomaly_cols:
            elasticity_components.append(anomaly_sensitivity)

        mean_elasticity = float(np.mean(elasticity_components))
        elasticity_std = float(np.std(elasticity_components)) if len(elasticity_components) > 1 else 0.0

        sensitivity = ChannelWeatherSensitivity(
            channel=spend_col,
            base_elasticity=float(base_elasticity),
            temperature_sensitivity=float(temp_sensitivity),
            precipitation_sensitivity=float(precip_sensitivity),
            anomaly_sensitivity=float(anomaly_sensitivity),
            mean_elasticity=float(mean_elasticity),
            elasticity_std=float(elasticity_std),
            temperature_bands=temp_bands,
            precipitation_bands=precip_bands,
        )
        sensitivities[spend_col] = sensitivity

    return sensitivities


def _create_weather_bands(
    weather_type: str, frame: pl.DataFrame, weather_cols: List[str], revenue_col: str
) -> List[WeatherBand]:
    """Create weather bands for elasticity analysis."""
    bands: List[WeatherBand] = []

    # Filter relevant columns
    if weather_type == "temperature":
        relevant_cols = [c for c in weather_cols if "temp" in c.lower()]
    else:
        relevant_cols = [c for c in weather_cols if "precip" in c.lower()]

    if not relevant_cols:
        return bands

    col = relevant_cols[0]
    if col not in frame.columns:
        return bands

    values = _series_to_numpy(frame[col])
    revenue = _series_to_numpy(frame[revenue_col])

    if len(values) == 0:
        return bands

    # Create quartile bands
    q1, q2, q3 = float(np.percentile(values, 25)), float(np.percentile(values, 50)), float(np.percentile(values, 75))

    band_specs = [
        ("Low", float(np.min(values)), q1),
        ("Moderate", q1, q2),
        ("High", q2, q3),
        ("Very High", q3, float(np.max(values))),
    ]

    for name, min_val, max_val in band_specs:
        mask = (values >= min_val) & (values <= max_val)
        band_revenue = revenue[mask]
        sample_size = int(np.sum(mask))

        if sample_size > 0:
            confidence = min(1.0, sample_size / max(1, len(values)))
            band_mean = float(np.mean(band_revenue))
            baseline = float(np.mean(revenue))
            if abs(baseline) < 1e-6:
                baseline = 1.0
            multiplier = float(np.clip(band_mean / baseline, 0.7, 1.3))

            band = WeatherBand(
                name=name,
                min_value=min_val,
                max_value=max_val,
                elasticity_multiplier=multiplier,
                confidence=float(confidence),
                sample_size=sample_size,
            )
            bands.append(band)

    return bands


def _compute_model_quality(
    frame: pl.DataFrame, spend_cols: List[str], weather_cols: List[str], revenue_col: str
) -> float:
    """Compute R² for weather elasticity model."""
    if not spend_cols or not weather_cols:
        return 0.0

    # Simple approach: use multiple correlation with spend + weather
    spend_data = []
    for col in spend_cols:
        if col in frame.columns:
            spend_data.append(_series_to_numpy(frame[col]))

    weather_data = []
    for col in weather_cols:
        if col in frame.columns:
            weather_data.append(_series_to_numpy(frame[col]))

    if not spend_data or not weather_data:
        return 0.0

    revenue = _series_to_numpy(frame[revenue_col])
    if np.var(revenue) == 0:
        return 0.0

    # Compute average correlation
    correlations = []
    for data in spend_data + weather_data:
        if np.var(data) > 0:
            corr = np.corrcoef(data, revenue)[0, 1]
            if not np.isnan(corr):
                correlations.append(abs(corr))

    if not correlations:
        return 0.0

    # R² is square of correlation
    r_squared = float(np.mean(correlations)) ** 2
    return float(np.clip(r_squared, 0.0, 1.0))


def _estimate_elasticity(feature: np.ndarray, target: np.ndarray) -> float:
    """Estimate elasticity using covariance method."""
    if len(feature) != len(target):
        return 0.0

    feature_var = np.var(feature)
    if feature_var == 0:
        return 0.0

    cov = np.cov(feature, target)[0, 1]
    elasticity = cov / feature_var

    # Clamp to reasonable range
    return float(np.clip(elasticity, -2.0, 2.0))


def _generate_summary(
    base_elasticity: float,
    weather_elasticity_mean: float,
    temp_elasticity: float,
    precip_elasticity: float,
    r_squared: float,
    num_channels: int,
) -> str:
    """Generate executive summary of findings."""

    lines = [
        "Weather Elasticity Analysis Summary",
        "=" * 50,
        "",
        f"Base Elasticity: {base_elasticity:.3f}",
        f"Weather-Driven Elasticity: {weather_elasticity_mean:.3f}",
        f"Model Quality (R²): {r_squared:.2%}",
        "",
        f"Temperature Impact: {temp_elasticity:.3f} per °C",
        f"Precipitation Impact: {precip_elasticity:.3f} per mm",
        "",
        f"Channels Analyzed: {num_channels}",
        "",
    ]

    # Add recommendations
    if abs(weather_elasticity_mean) > 0.5:
        lines.append("Key Insight: Weather has SIGNIFICANT impact on demand")
        lines.append(
            "Recommendation: Implement weather-responsive budget allocation"
        )
    elif abs(weather_elasticity_mean) > 0.1:
        lines.append("Key Insight: Weather has MODERATE impact on demand")
        lines.append("Recommendation: Consider weather in allocation for high-variance regions")
    else:
        lines.append("Key Insight: Weather impact is MINIMAL")
        lines.append("Recommendation: Focus on other demand drivers")

    return "\n".join(lines)


def _empty_elasticity_report(
    tenant_id: str, run_id: str | None, num_spend_cols: int, num_weather_cols: int
) -> WeatherElasticityReport:
    """Create empty report when analysis cannot proceed."""
    resolved_run_id = run_id or "unknown"
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    return WeatherElasticityReport(
        tenant_id=tenant_id,
        run_id=resolved_run_id,
        timestamp_utc=timestamp,
        window_start="unknown",
        window_end="unknown",
        data_rows=0,
        weather_rows=0,
        base_elasticity=0.0,
        weather_elasticity_mean=0.0,
        weather_elasticity_std=0.0,
        temperature_correlation=0.0,
        temperature_elasticity=0.0,
        hot_weather_multiplier=1.0,
        cold_weather_multiplier=1.0,
        precipitation_correlation=0.0,
        precipitation_elasticity=0.0,
        heavy_rain_multiplier=1.0,
        light_rain_multiplier=1.0,
        seasonal_elasticity={"Q1": 0.0, "Q2": 0.0, "Q3": 0.0, "Q4": 0.0},
        day_of_week_elasticity={
            "Monday": 0.0,
            "Tuesday": 0.0,
            "Wednesday": 0.0,
            "Thursday": 0.0,
            "Friday": 0.0,
            "Saturday": 0.0,
            "Sunday": 0.0,
        },
        channel_sensitivities={},
        r_squared=0.0,
        observations_per_bin=0,
        summary="Insufficient data for weather elasticity analysis",
    )


def save_elasticity_report(report: WeatherElasticityReport, output_path: Path | str) -> Path:
    """Save elasticity report as JSON artifact."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert dataclasses to dict for JSON serialization
    # asdict() recursively converts nested dataclasses, so we need to be careful
    def convert_to_dict(obj: Any) -> Any:
        """Recursively convert dataclasses and other objects to JSON-serializable dicts."""
        if isinstance(obj, dict):
            return {k: convert_to_dict(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [convert_to_dict(item) for item in obj]
        elif hasattr(obj, '__dataclass_fields__'):
            return convert_to_dict(asdict(obj))
        else:
            return obj

    report_dict = convert_to_dict(asdict(report))

    output_path.write_text(json.dumps(report_dict, indent=2, sort_keys=True))
    _LOGGER.info(f"Weather elasticity report saved to {output_path}")

    return output_path
