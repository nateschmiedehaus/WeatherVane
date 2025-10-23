# Synthetic Data Generation Requirements for MMM Training

**Date**: 2025-10-23
**Status**: Ready for Autopilot Execution
**Priority**: P0 - Blocks demo readiness

---

## Current State

### What Exists ✅
1. **Synthetic data generation framework** - `shared/libs/testing/synthetic.py`
   - `BrandScenario` profiles with configurable weather sensitivities
   - `ProductCategoryProfile` for product mix variation
   - `WeatherSensitivityProfile` for different weather responses
   - Marketing channel simulation (Meta, Google, Email)

2. **4 baseline tenant scenarios** - `scripts/weather/generate_synthetic_tenants.py`
   - `extreme_weather_sensitivity` - Snow shovels, sunscreen (±90% weather correlation)
   - `high_weather_sensitivity` - Winter coats, umbrellas (±35% correlation)
   - `medium_weather_sensitivity` - Shoes, clothing (±12% correlation)
   - `no_weather_sensitivity` - Office supplies (0% correlation)

3. **Default brand examples** - `synthetic.py:171-200`
   - Harbor Cafe (warm beverages, cold brew mix)
   - Alpine Outfitters (started but needs completion)

### What's Broken ❌
- PoC only generates 30 days of data
- MMM training needs 120+ days minimum (GAM requirement)
- Only 1 tenant tested (poc-final)
- Models produce R² = 0.000 (no predictive power)

---

## Requirements for Production-Ready Training Data

### Time Horizon
- **Minimum**: 120 days (GAM requirement from metadata.json)
- **Target**: 365 days (full year of seasonality)
- **Ideal**: 730 days (2 years for year-over-year validation)

### Tenant Diversity (Minimum 10 Tenants)

#### High Weather Sensitivity (4 tenants)
1. **Seasonal Apparel** - Coats/shorts, temp-driven
2. **Weather Services** - Snow removal, HVAC, weather-triggered
3. **Outdoor Recreation** - Camping gear, beach equipment
4. **Seasonal Food/Beverage** - Ice cream, hot chocolate, seasonal produce

#### Medium Weather Sensitivity (3 tenants)
1. **General Retail** - Mix of weather-affected and stable products
2. **Fitness/Wellness** - Gym vs outdoor exercise equipment
3. **Home Improvement** - Some weather-driven (AC filters, fans)

#### Low/No Weather Sensitivity (3 tenants)
1. **Digital Products** - Software, subscriptions
2. **Office Supplies** - Pens, paper, indoor products
3. **Electronics** - Laptops, phones, tech accessories

### Product Category Mix (Per Tenant)
- **Minimum 3 categories** per tenant
- **Maximum 8 categories** per tenant
- Different weather affinity profiles:
  - Cold-weather products (coats, heaters)
  - Warm-weather products (sunscreen, AC units)
  - Rain-triggered (umbrellas, rain boots)
  - Weather-neutral (office supplies)

### Marketing Channel Mix
- **Meta Ads** - 40-50% of spend
- **Google Search** - 30-40% of spend
- **Email/Klaviyo** - 10-20% of spend
- Variable weather amplification per channel (Meta responds more to weather than email)

### Weather Variation Requirements
- **Geographic diversity** - Different cities with different weather patterns
  - Phoenix (extreme heat, minimal rain)
  - Seattle (rain-heavy, mild temps)
  - Chicago (four seasons, winter extremes)
  - Miami (tropical, hurricane season)
  - Denver (altitude, snow, intense sun)

- **Seasonal patterns** - Full year to capture:
  - Winter demand spikes (heating, coats)
  - Summer demand spikes (cooling, swimwear)
  - Shoulder seasons (transitional products)
  - Holiday effects independent of weather

- **Weather shocks** to test model robustness:
  - Heatwaves (+15°F for 5-7 days)
  - Cold snaps (-20°F for 3-5 days)
  - Heavy rain events (2-4 inches)
  - Snowstorms (6+ inches)
  - Atmospheric rivers (sustained rain)

---

## Data Quality Requirements

### Revenue Signal Strength
- **R² target**: ≥0.65 for high-sensitivity tenants on holdout set
- **R² target**: ≥0.45 for medium-sensitivity tenants
- **R² target**: ~0.15 for low-sensitivity (noise floor acceptable)

### Marketing Mix Realism
- **Spend ranges**: $50-$500/day per channel (realistic for SMB)
- **ROAS ranges**: 1.5x - 4.0x (industry benchmarks)
- **Conversion rates**: 2-8% (varies by channel)
- **Attribution windows**: 7-day click, 1-day view

### Weather Integration Realism
- Use real historical weather from Open-Meteo seeds
- Apply realistic lag effects (demand follows weather by 0-3 days)
- Saturation effects (extreme temps have diminishing returns)
- Interaction effects (rain + cold = higher coat demand than just cold)

---

## Implementation Approach

### Phase 1: Expand Brand Scenarios (2-4 hours)
1. Complete existing `DEFAULT_BRAND_SCENARIOS` in `synthetic.py`
2. Add 6-8 more brand profiles with varying sensitivities
3. Ensure product category diversity
4. Test one 365-day generation for one tenant

### Phase 2: Bulk Generation (4-8 hours)
1. Create script to generate all tenants in parallel
2. Target: 365 days × 10 tenants = 3,650 tenant-days of data
3. Output to `storage/synthetic_lake/<tenant_id>/`
4. Validate schema compliance for all outputs

### Phase 3: Model Training Validation (4-8 hours)
1. Train baseline models for all 10 tenants
2. Generate holdout metrics (R², MAE, RMSE)
3. Verify weather feature importance rankings
4. Document which tenants show strong weather signals

### Phase 4: MMM Training (8-16 hours)
1. Train LightweightMMM on 365-day datasets
2. Generate channel attribution results
3. Validate ROAS estimates against ground truth
4. Compare to baseline heuristic performance

---

## Success Criteria

### Data Generation
- ✅ 10+ tenants with 365+ days of history each
- ✅ All outputs pass schema validation
- ✅ Weather features correlate with expected sensitivity levels
- ✅ Marketing spend shows realistic variation

### Model Performance
- ✅ High-sensitivity tenants: R² ≥ 0.65
- ✅ Medium-sensitivity tenants: R² ≥ 0.45
- ✅ Low-sensitivity tenants: R² ≈ 0.15
- ✅ Weather feature importance ranks correctly for high-sensitivity tenants

### Demo Readiness
- ✅ Can show 3+ tenant examples with different profiles
- ✅ Weather impact is visible and quantifiable
- ✅ ROAS estimates are realistic (1.5-4.0x)
- ✅ Can explain why model works for some products and not others

---

## Existing Infrastructure to Use

### Scripts
- `scripts/weather/generate_synthetic_tenants.py` - 4-tenant baseline generator
- `scripts/minimal_ml_demo.py` - End-to-end PoC pipeline (extend for batch)
- `scripts/train_baseline_synthetic.py` - Baseline model training
- `scripts/train_mmm_synthetic.py` - MMM training with synthetic data

### Modules
- `shared.libs.testing.synthetic` - Core generation logic
  - `BrandScenario` - Tenant profile definition
  - `seed_synthetic_tenant()` - Main generation function
  - `DEFAULT_BRAND_SCENARIOS` - Existing examples to expand

- `apps.model.train` - Training orchestration
  - `train_baseline()` - Baseline model with GAM
  - Data quality validation
  - Leakage detection

- `apps.model.mmm_lightweight` - MMM integration
  - Bayesian parameter estimation
  - Adstock and saturation modeling
  - Heuristic fallback

### Storage
- `storage/seeds/open_meteo/` - Real historical weather seeds
- `storage/synthetic_lake/` - Synthetic data output location (create if needed)
- `tmp_synth_lake/` - Temporary generation workspace

---

## Autopilot Execution Plan

1. **Read and understand** existing synthetic data infrastructure
2. **Extend `DEFAULT_BRAND_SCENARIOS`** to 10+ diverse tenants
3. **Create bulk generation script** that:
   - Loops through all scenarios
   - Generates 365 days per tenant
   - Outputs to structured lake paths
   - Validates all outputs
4. **Train models** for all tenants and capture metrics
5. **Validate results** against success criteria
6. **Document** which tenants are demo-ready

**Estimated Time**: 16-32 hours of autopilot work
**Deliverable**: Production-grade synthetic dataset for MMM training and demo

---

## Why This Matters

**Without this:**
- PoC shows R² = 0.000 (model explains nothing)
- Can't demonstrate weather impact to prospects
- Can't validate model accuracy
- Demo is just "pretty UI with fake numbers"

**With this:**
- Models show realistic R² ≥ 0.65 for weather-sensitive products
- Can demonstrate quantifiable weather lift
- Can show which products/categories respond to weather
- Demo becomes "working proof of concept with validated predictions"

**User expectation**: "variety of long-term simulated brands, products, product categories and different mixes of these things with different weather sensitivities built into the simulated data"

This document defines what "variety" and "long-term" mean in concrete, measurable terms.
