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
