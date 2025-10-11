## Current Focus
T7.1.1 – Complete geocoding integration and caching across Shopify orders.

## Decisions
- Normalised merchant-provided latitude/longitude hints before calling the geocoder so we reuse coordinates already present on payloads.
- Derived geohashes from those hints (or decoded existing hashes) with the geocoder precision, letting us bypass redundant lookups and keep cache hits hot.
- Documented the behaviour in `docs/INGESTION.md` so connector authors understand the precedence order.

## Risks
- Shopify occasionally emits stale coordinate pairs; we presently trust hints, so coverage monitors must flag suspicious drifts.
- If upstream geohashes are malformed we silently fall back to lookups, which could hide systematic data-entry issues until validation runs.

## Next Actions
1. Extend coverage tests for city-only payloads to keep cache logic honest when hints are missing.
2. Run the broader ingestion suite once sandbox limits allow so we can flip T7.1.1 to `done`.
3. Revisit T7.1.2 weather join validation once geocoding ratios stabilise across tenants.
