# WeatherVane: From Problem Statement to Causal Weather Optimization

## Introduction
WeatherVane is a platform that helps marketers align advertising budgets with weather-driven demand.
This document intentionally avoids code-level detail and instead narrates the entire system—motivation,
architecture, modelling, user experience, roadmap—so stakeholders can understand what each component
does, the techniques involved, and why the roadmap priorities matter.

This essay is living documentation; every major enhancement should be reflected here so that non-technical
readers can follow along without jumping across disparate docs.

## Problem We Solve
- **Marketers struggle to react to weather shifts.** Storms, heatwaves, pollen spikes all influence
  consumer behaviour. Today, marketers chase these signals manually or not at all.
- **Proving impact is hard.** Without experiments, it’s difficult to show that weather caused lift.
- **Budgets are static.** Media plans are often set weeks in advance, ignoring upcoming weather.

WeatherVane addresses these issues by ingesting historical sales/ads data, combining it with weather
signals, modelling expected outcomes, and generating recommended ad allocations. We then close the loop
via experiments, calibration, and storytelling so marketers trust the output.

## End-to-End Workflow
1. **Data ingestion** – connectors pull Shopify orders, Meta/Google/Klaviyo spend, promos.
2. **Weather processing** – cache weather history/forecast, compute anomalies and derived features
   (temperature, humidity, UV, wind, etc., plus lagged metrics and event flags).
3. **Feature store** – join sales/ad data with weather, create modelling matrix.
4. **Modelling** – currently LightGBM/heuristics, but roadmap moves us to LightweightMMM + causal IDs.
5. **Allocation** – recommend channel/geo budgets with guardrails and uncertainty bands.
6. **User experience** – plan hero cards, stories, proof dashboards, onboarding wizard.
7. **Feedback loop** – ingest actual outcomes, check calibration, raise alerts when forecasts drift.

Each stage relies on a combination of tools (FastAPI, Prefect, Polars, Open-Meteo, MMM libraries) and
methodologies (time-series validation, adstock, saturation, causal inference, quantile coverage). The
rest of this doc dives deeper while keeping the narrative accessible.

## Roadmap Narrative
We maintain a delivery roadmap (see `docs/ROADMAP.md`) taking WeatherVane from proof-of-concept to
production-ready solution. Highlights:
- **Phase 0** – Prove value (A/B experiments, calibration, disclaimers).
- **Phase 1** – UX overhaul (demo mode, hero insights, proof surfacing).
- **Phase 2** – Feedback loop (performance tracker, forecast alerts).
- **Phase 3** – Connector platform (SDK, onboarding).
- **Phase 4** – MMM + causal upgrades (LightweightMMM, DoWhy/EconML, spatial models).
- ... and so on through automation, security, interoperability.

This essay will reference relevant phases as we discuss each subsystem.

## Data Ingestion & Weather Signals
WeatherVane ingests ecommerce and marketing platforms (Shopify, Meta, Google, Klaviyo) via connectors.
Weather data comes from Open-Meteo. We cache responses, compute climatology, and now include rhythms like
humidity, UV, wind, precipitation probability, snowfall, etc., plus lagged metrics and event flags.
These features help MMM and causal analyses understand lagged demand (stockpiling before a storm, etc.).

## Modelling Strategy (Layman’s Breakdown)
- **Today:** LightGBM models with heuristic elasticity. Quantile outputs propagate uncertainty.
- **Tomorrow (Phase 4):** LightweightMMM or Robyn adds adstock (delayed effects) and saturation (diminishing returns).
- **Causal ID:** Difference-in-differences across geos, instrumental variables (forecast errors) to prove causal impact.
- **Explainability:** SHAP values, counterfactuals, hierarchical splits (brand vs performance), and forecast coverage dashboards.

Each technique will be introduced in plain English when implemented (e.g., “adstock is like keeping track of how long people remember an ad”).

## Allocation & Guardrails
The allocator uses recommended response curves to suggest how much to spend per channel/geo. Guardrails
ensure we don’t violate ROAS floors, ramp limits, inventory constraints. Phase 4 upgrades will allow
the allocator to consume MMM response curves directly rather than heuristic elasticities.

## UX & Trust Journey
- **Problem:** Users previously saw empty states. No proof, no value.
- **Actions:** Demo mode, onboarding wizard, plan hero cards, proof nav, success toasts.
- **Result:** Time-to-first-value (TTV) goes from “infinite” to <60s with sample data. Proof page clearly shows experiments and forecast reliability.

## Feedback & Observability
We built a performance tracker that logs MAE/MAPE and quantile coverage per horizon. CLI option
`--alert-forecast` warns when p10–p90 coverage drops below threshold. Observability metrics feed dashboards.

## Security & Compliance Summary
Retention sweeps, consent tracking, privacy endpoints exist today. Roadmap includes vault migration, rates
limits, SOC2 prep.

## Future Vision
Full causal MMM, automation (push recommended budgets automatically), cross-tool integrations (Salesforce, Energy),
and even weather derivatives for financial hedging.

---

### Maintaining this Essay
- When new features ship (e.g., MMM integration, causal experiments), update the relevant sections.
- Keep references to roadmap phases so stakeholders know what’s done and what’s in progress.
- Ensure non-technical language mirrors the actual implementation.

