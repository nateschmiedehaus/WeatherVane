# Causal Limitations & Disclosure

WeatherVane models capture **associations**, not guaranteed causal effects. Until the roadmap causal work lands (MMM, DiD, hierarchical models), we must be explicit about what the platform can and cannot claim.

## Current Model Assumptions
- LightGBM + heuristics ingest historical weather, sales, and marketing data.
- No adstock/saturation modelling, no spatial priors, no controlled experimentation.
- Quantile bands derive from residual distributions assuming stationary errors.

## What We Can Say
- "Weather correlates with revenue (R² = …)"
- "Scenario simulations show expected revenue ranges with current model confidence"
- "Model predicts revenue with X% accuracy on historical backtests"

## What We Cannot Say (Yet)
- "Weather causes demand shifts" or "Budget should change because of weather" (requires causal proof).
- "We are 90% confident revenue > $X" without calibration validation.
- "MMM recommends spend" while MMM is correlation-based.

## Geo Reporting Reality Check
- **Meta Insights API** only returns location breakdowns at `country`, `region` (state/province), and U.S. `dma` levels, and those breakdowns disappear for many off‑Meta action metrics such as pixel conversions ([Meta Marketing API – Insights Breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/)). City, ZIP, or store-level performance must therefore come from first-party order data rather than Meta reporting.
- **Google Ads API** supports granular geography segments—including country, region, metro, city, postal code, and “most specific” location—via fields like `segments.geo_target_city` and `segments.geo_target_postal_code` ([Google Ads API segments reference](https://developers.google.com/google-ads/api/fields/v22/segments)). Reporting queries must explicitly include those segments to unlock city/postal attribution.
- **Implication:** WeatherVane can align fine-grained weather features with marketing performance only when the ad platform exposes metrics at matching resolution or when we enrich them with first-party geocoded outcomes. Autopilot and roadmap tasks (e.g., `T13.3.1`) should validate data availability before promising narrow-geo causal insights.

## Required Disclaimers
- Display an in-product note in plan/experiments views: *"Predictions reflect historical correlations; causal lift under validation."*
- Reference this document in sales/CS decks and onboarding emails until Phase 4 upgrades land.
- Track quantile coverage in `/calibration` and widen long-horizon intervals.

## Roadmap Alignment
- Phase 0: publish this doc, add UI disclaimer, validate quantile coverage, inflate long-horizon uncertainty.
- Phase 2: monitor forecast uncertainty and alert on coverage gaps; feed calibration metrics into experiments dashboard.
- Phase 4: integrate LightweightMMM with adstock/saturation, expand weather features, introduce causal identification, spatial modelling, and re-evaluate claims.

Keep this doc up to date as causal workships complete and disclaimers can be relaxed.

## Latest Methodology Updates
- **Oct 2025:** Weather shock analysis now defaults to a difference-in-differences estimator with optional synthetic control weighting (`shared.libs.causal.weather_shock`). The treated cohort must share a pre-period window with at least one control region; the estimator exposes confidence intervals and similarity weights via the API (`POST /v1/weather/shock-analysis`). Use this flow for non-manipulable weather events instead of propensity-based uplift.
