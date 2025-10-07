# WeatherVane Roadmap & TODOs

## Modelling
- [ ] Replace `apps/model/baseline.py` least squares stub with production pyGAM/statsmodels implementation.
- [ ] Evaluate swapping to sklearn pipeline as interim step (should remain simple).
- [ ] Integrate Robyn or LightweightMMM in `apps/model/mmm.py` (current code logs TODO).
- [ ] Add proper cross-validation and residual diagnostics.

## Ingestion
- [ ] Add real Meta/Google API pagination/backoff (todo markers in `ads.py`).
- [ ] Implement Klaviyo flow ingestion (current promo ingest is campaign-only).
- [ ] Document all required env vars in README.

## Feature Store
- [ ] Promote weather cache JSON to Parquet/Arrow with anomaly computation.
- [ ] Add aggregator for multi-geo weather features (rolling anomalies per cell).

## Frontend
- [ ] Wire live APIs into app views (Plan, Stories, Catalog, Automations).
- [ ] Build Mac-inspired design components (in progress).

Keep this document updated as TODOs are addressed.
