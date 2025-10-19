# Product-Level Feature Engineering

## Purpose
The product feature builder transforms raw daily commerce, advertising, and weather signals into hierarchical features that let models reason about behaviour at the product, category, and brand levels. The goal is to capture how individual products respond to spend and weather, while still giving the allocator and modeling layers the shared context they need for cross-brand and category inference.

## Inputs and Normalisation
- **Product daily metrics** – net revenue, units sold, and media spend per canonical product. Spend columns are normalised into a single `total_spend` field and daily ROAS.
- **Product taxonomy** – category, weather affinity, seasonality, and cross-brand keys derived from the taxonomy service.
- **Weather daily data** – temperature and precipitation per day (or day+geohash when available).

Missing spend is treated as zero to prevent ROAS explosions; unit counts fall back to zero when absent; dates are parsed to `Date` for deterministic windowing.

## Feature Families
1. **Product windows** – rolling 7/28 day revenue, units, and spend with ROAS, observation counts, first/last observed dates, plus `revenue_velocity_index` and `units_velocity_index` that compare per-day momentum between the 7-day spike window and the broader 28-day baseline.
2. **Hierarchical roll-ups** – revenue/spend aggregations per category, brand, and cross-brand key to power partial pooling across similar products.
3. **Category weather performance** – 28-day average revenue per weather bucket with lift vs neutral conditions, highlighting which categories thrive in rain/heat/cold.
4. **Weather correlations** – Pearson correlations between product revenue and temperature/precipitation, using only non-null observations.
5. **Weather affinity scores** – contrast average revenue on days that match the taxonomy affinity (e.g., rain products on rainy days) against off-affinity days; `matching_weather_days` guards against sparse data.
6. **Seasonality summary** – monthly revenue totals, peak month, and a ratio-based seasonal vs evergreen label (requires peak month share ≥45% and >1.8× median month to earn “seasonal”).

All feature tables share `tenant_id` keys so downstream processing can join back to modelling datasets without recomputing joins.

## Design Decisions
- **Deterministic windows** – the builder uses the latest observation date found in the input, ensuring tests with synthetic data behave consistently.
- **Graceful degradation** – when neutral weather data is missing the category weather table surfaces `lift_vs_neutral = null`, pushing the decision point into downstream logic instead of assuming zero lift.
- **Defensive correlation math** – Pearson correlations fall back to `None` for <2 observations and to `0` when variance collapses, preventing NaNs that break feature validation.
- **Seasonality thresholds** – the ratio/share thresholds were chosen to catch obviously seasonal catalogues (e.g., snow gear spikes) while keeping balanced sellers marked evergreen.
- **Velocity guardrails** – velocity indexes only materialise when the 28-day baseline has positive mass, preventing divide-by-zero artefacts from surfacing in dashboards.

## Usage
Instantiate `ProductFeatureBuilder`, pass the latest product daily frame, taxonomy entries, and optional weather frame, and persist or enrich the returned `ProductFeatureResult` tables:

```python
from apps.api.features import ProductFeatureBuilder

builder = ProductFeatureBuilder()
result = builder.build(product_daily=df, taxonomy=taxonomy_entries, weather_daily=weather_df)
product_features = result.product_features
```

The result metadata exposes the latest observation date and row counts for quick sanity checks. Integration tests in `tests/features/test_product_features.py` document expected behaviours and edge cases.
