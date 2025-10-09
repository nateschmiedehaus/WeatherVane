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

## Required Disclaimers
- Display an in-product note in plan/experiments views: *"Predictions reflect historical correlations; causal lift under validation."*
- Reference this document in sales/CS decks and onboarding emails until Phase 4 upgrades land.
- Track quantile coverage in `/calibration` and widen long-horizon intervals.

## Roadmap Alignment
- Phase 0: publish this doc, add UI disclaimer, validate quantile coverage, inflate long-horizon uncertainty.
- Phase 2: monitor forecast uncertainty and alert on coverage gaps; feed calibration metrics into experiments dashboard.
- Phase 4: integrate LightweightMMM with adstock/saturation, expand weather features, introduce causal identification, spatial modelling, and re-evaluate claims.

Keep this doc up to date as causal workships complete and disclaimers can be relaxed.
