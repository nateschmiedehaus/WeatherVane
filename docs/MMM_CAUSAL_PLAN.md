# MMM & Causal Upgrade Plan (Phase 4)

## Objectives
- Replace placeholder elasticity with production-ready media mix modelling.
- Introduce causal identification so weather recommendations rest on proof, not correlation.
- Expand weather signal coverage and geographic heterogeneity to improve fit and explainability.

## Workstreams
1. **Model integration**
   - Evaluate LightweightMMM vs Robyn; prototype both using 90 days of historical data.
   - Implement adstock (geometric decay) and saturation (Hill function) transformations.
   - Fit hierarchical model separating brand vs performance channels.
   - Output channel-level response curves and marginal ROAS for allocator.
2. **Causal inference**
   - Design difference-in-differences experiments leveraging weather shocks across geos.
   - Add instrumentation (forecast error as IV) for weather-caused demand proof.
   - Store causal lift metrics alongside plan metadata.
3. **Feature expansion**
   - Extend weather ingestion with humidity, UV, wind, air-quality, pollen, snowfall, and lagged features.
   - Cluster climates to train geo-specific models; introduce spatial smoothing.
4. **Validation & delivery**
   - Build backtesting harness comparing current vs MMM outputs.
   - Surface causal evidence in UI (“Weather drove +$X with p-value …”)
   - Update allocator to consume MMM response curves.

## Feature & Variable Coverage Requirements
- **Marketing exposures & pacing**
  - Daily channel/campaign spend, impressions, clicks, CPM/CPC/CPA, revenue attribution, paid share-of-voice.
  - Campaign objectives (prospecting, retargeting, loyalty) and pacing data to separate intent, always-on, and burst activity.
  - Historical plan vs actual spend so the model can learn from allocator recommendations that were executed or rejected.
- **Creative & placement metadata**
  - Ad format, placement, weather theming, CTA, asset tags, experimentation buckets, audience segments.
  - Delivery diagnostics (eligible reach, frequency, quality ranking) to control for platform throttling.
- **Pricing & promotion signals**
  - SKU- and category-level price, discount depth, coupon usage, bundles, shipping thresholds, loyalty incentives.
  - Promotion calendars with lead/lag flags to capture halo effects and stock-up behaviour.
- **Product & inventory context**
  - SKU taxonomy (category hierarchy, weather affinity, lifecycle stage), inventory levels, stock-outs, replenishment cadence, fulfillment capacity.
  - Margin contribution and cost of goods to distinguish revenue lift from profit lift.
- **Sales & customer outcomes**
  - Orders, units, revenue, contribution margin, new vs returning customers, customer cohorts, channel-assisted conversions.
  - Point-of-sale breakdown where retail/omnichannel data is available.
- **Weather & environmental signals**
  - Observed and forecast weather: temperature, feels-like, humidity, wind, UV, precipitation type/intensity, snowfall, dew point, visibility, air quality, pollen.
  - Weather anomalies, heating/cooling degree days, severe weather alerts, storm categories, event lead/lag windows, forecast error (instrument for IV analysis).
- **Temporal, location, and macro context**
  - Holidays, pay periods, school schedules, major events, local footfall, tourism indices.
  - Geo hierarchy (store, DMA, climate cluster) with mobility data, population density, competitor density.
  - Macro indicators: CPI, disposable income proxies, unemployment, gas prices.
- **Competitive & market intelligence**
  - Competitor price gaps, promotional intensity, assortment overlap, auction insights (impression share, top-of-page rate).
  - Search demand (Google Trends), share-of-shelf metrics for marketplaces.
- **Digital behaviour & owned channels**
  - Site/app sessions, conversion funnel metrics, email/SMS push performance, organic search and social trends.
  - Customer support signals (ticket volume, sentiment) that can confound sales.
- **Operational & supply signals**
  - Logistics status (shipping delays, carrier outages), staffing levels, store operating hours, curbside capacity.
  - Inventory transfers, purchase orders, vendor lead times for supply-side constraints.
- **Experimentation & governance**
  - Randomised holdouts, geo split tests, manual overrides, guardrail breaches, campaign freeze events.
  - Data quality indicators, freshness, null coverage, instrumentation needed for causal audits.

These variables are prerequisites for disentangling weather, marketing intent, and operational constraints so we can both explain and influence outcomes.

## Timeline (estimate)
- Weeks 1-2: Feature expansion + data prep.
- Weeks 3-5: MMM integration & causal experiments.
- Weeks 6-7: Allocator wiring + backtesting.
- Week 8: UI updates & documentation.

## Dependencies
- Quantile calibration and forecast alerts (Phase 2) feeding performance store.
- Connector platform work so additional weather signals are accessible.

## Setup Notes
- Install LightweightMMM when prototyping: `pip install lightweight-mmm` (optional dependency).
- Ensure JAX/NumPyro requirements are satisfied (see LightweightMMM docs).
- For resource-constrained demos, follow `docs/MODELING_MINIMAL_DEMO_PATH.md`.
