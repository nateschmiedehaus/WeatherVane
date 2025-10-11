# Weather Blending Guide

WeatherVane needs a single, stitch-free timeline of weather metrics that covers both
historical observations and forward-looking forecasts. This guide explains how the
`WeatherCache` blends Open-Meteo archive data with forecast responses, keeps timezones
honest, and exposes the metadata modelling and UX layers rely on.

## Key behaviours

- **Dual-source fetches.** `WeatherCache.ensure_range` now orchestrates two upstream
  calls when the requested window spans today: the Open-Meteo archive API provides
  observed history up through "yesterday" while the forecast endpoint fills future
days. Overlapping days prefer archive observations and drop forecast duplicates.
- **Timezone alignment.** All requests default to `timezone=auto`. Responses are
  normalised into four columns: `local_date`, `local_datetime`, `utc_datetime`, and
  `timezone`. We leverage `zoneinfo` so midnight boundaries always reflect the local
  clock for each geohash, but we also persist UTC strings for joins with Shopify and
  ads datasets.
- **Observation provenance.** Each row carries an `observation_type` flag
  (`observed`, `forecast`, or `stub` for synthetic fallbacks) plus an `as_of_utc`
  timestamp documenting when WeatherVane generated the record. Analytics can now
  separate realised weather from forward-looking signals, and front-end charts can
  label forecast horizons explicitly.
- **Contract update.** The daily weather schema (`shared/contracts/weather_daily.schema.json`)
  was expanded to cover the new timezone and provenance fields while keeping
  `additionalProperties=false`. Data quality checks (`validate_weather_daily`) enforce
  the contract before anything hits the lake.

## Usage notes

- The worker pipeline extends each tenant's weather request by
  `FORECAST_HORIZON_DAYS` (currently seven). Historical modelling still filters to the
  requested end date, while allocation and UX layers can read the forward span for
  opportunity cards.
- Cached payloads store the blended response (`generated_at`, units, timezone, and
  per-day observation types). Re-fetching a range pulls directly from disk with the
  same schema, so repeated runs are deterministic and fast.
- Synthetic fallbacks populate the extended schema, allowing local development without
  live API credentials.

Refer to `apps/worker/flows/poc_pipeline.py::fetch_weather_data` for an example of the
blended output feeding downstream joins and telemetry.
