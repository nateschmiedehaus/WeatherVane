# Modeling Signal Gap Action Plan

This tracker converts the outstanding “gap” signals from `config/model_feature_catalog.yaml` into concrete follow-up work. Owners should connect these actions to the Phase 4 roadmap initiatives referenced below and open delivery tickets (Atlas/Director Dana) as work begins.

| Signal | Owner | Roadmap Ref | Action | Target API |
| --- | --- | --- | --- | --- |
| Marketing pacing & delivery diagnostics | Data Platform :: Ads Connectors | `phase4.media_mix.exposure_warehouse` | Extend Meta/Google connectors to pull delivery-insights & recommendation endpoints; persist pacing/quality metrics in ads daily table. | Meta Delivery Insights, Google Ads Recommendations |
| Price rule & discount depth changes | Lifecycle Marketing | `phase4.media_mix.pricing_controls` | Stand up Shopify price rule ingestion with historical backfill; join to promos for discount depth features. | Shopify Price Rules |
| Inventory positions & sell-through | Supply Chain | `phase4.media_mix.inventory_controls` | Land daily inventory snapshot (on-hand, committed, safety stock) and surface sell-through ratios for product features. | Shopify Inventory Levels |
| New vs returning customer mix | Lifecycle Marketing | `phase4.media_mix.customer_mix` | Augment order ingestion with customer type & loyalty tier; backfill historical assignments. | Shopify Customers |
| Air quality & pollution metrics | Weather Intelligence | `phase4.weather.expansion` | Enable Open-Meteo air-quality feed for tenant geos; add AQI/PM/Ozone columns to weather_daily schema. | Open-Meteo Air Quality |
| Pollen severity index | Weather Intelligence | `phase4.weather.expansion` | Ingest Open-Meteo pollen index and expose seasonal severity features. | Open-Meteo Pollen |
| Holiday & events calendar | Strategy & Insights | `phase4.external_context.calendar` | Integrate Context7 holiday API with regional overlays; maintain tenant calendar dimension. | Context7 Public Holidays |
| Macro-economic indicators | Strategy & Insights | `phase4.external_context.macro` | Schedule CPI/unemployment/gas-price pulls via Context7 BLS proxy; join to tenant regions. | Context7 Macro (BLS) |
| Competitor price gaps | Strategy & Insights | `phase4.external_context.competitive` | Connect to Context7 competitive pricing API; design normalization for SKU mapping. | Context7 Competitive Pricing |
| Site & app traffic funnels | Product Analytics | `phase4.digital.owned_channels` | Provision GA Data API credentials; ingest sessions/bounce/conversion metrics keyed by tenant + channel. | Google Analytics Data API |
| Logistics & fulfilment capacity | Supply Chain | `phase4.supply_signals.capacity` | Pull Context7 logistics status feed; expose capacity/backlog signals for supply-aware modeling. | Context7 Logistics Status |
| Marketing experiment assignments | Growth Science | `phase4.causal_inference.experiments` | Sync Context7 experimentation roster; store geo/audience assignments and KPI targets for causal guardrails. | Context7 Experimentation |

Once ETL work is underway, update the catalog entry status to `available`, link the ingestion job, and add validation coverage.
