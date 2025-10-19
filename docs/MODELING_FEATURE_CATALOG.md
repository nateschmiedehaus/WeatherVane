# Modeling Feature & Signal Catalog

This catalog maps the signals required for causal-ready modeling to their current sources, owners, and implementation status. The source of truth lives in `config/model_feature_catalog.yaml`; this document summarises the same entries for quick reference and highlights remaining gaps. See `docs/MODELING_SIGNAL_GAP_ACTIONS.md` for owner assignments and roadmap linkage.

## Marketing Exposures & Pacing

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Meta Ads daily performance | Available | Data Platform :: Ads Connectors | `shared/contracts/meta_ads.schema.json` → `tenant_id`, `date`, `campaign_id`, `adset_id`, `spend`, `impressions`, `clicks`, `conversions` | `docs/api/meta_marketing.md` (`/{ad_account_id}/insights`) |
| Google Ads daily performance | Available | Data Platform :: Ads Connectors | `shared/contracts/google_ads.schema.json` → `tenant_id`, `date`, `campaign_id`, `spend`, `impressions`, `clicks`, `conversions` | `docs/api/google_ads.md` (`/v17/customers/{customer_id}/googleAds:searchStream`) |
| Marketing pacing & delivery diagnostics | Gap | Data Platform :: Ads Connectors | Needs auction competition, pacing, and delivery ranking metrics | `docs/api/meta_marketing.md` (`/{ad_account_id}/delivery_insights`), `docs/api/google_ads.md` (`/v17/customers/{customer_id}/recommendations`) |

## Pricing & Promotion Signals

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Order financials and discounts | Available | Data Platform :: Commerce Connectors | `shared/contracts/shopify_orders.schema.json` → `total_price`, `subtotal_price`, `total_tax`, `total_discounts`, `net_revenue` | `docs/api/shopify_admin_rest.md` (`/admin/api/2024-07/orders.json`) |
| Promotion calendar baselines | Available | Lifecycle Marketing | `shared/contracts/promos.schema.json` → `campaign_id`, `name`, `channel`, `scheduled_at`, `status` | `docs/api/shopify_admin_rest.md` (`/admin/api/2024-07/marketing_events.json`) |
| Price rule & discount depth changes | Gap | Lifecycle Marketing | Requires Shopify price rule export aligned with promotions | `docs/api/shopify_admin_rest.md` (`/admin/api/2024-07/price_rules.json`) |

## Product & Inventory Context

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Canonical product taxonomy | Available | Data Platform :: Product Intelligence | `shared/schemas/product_taxonomy.py::ProductTaxonomyEntry` → `category_l1`, `category_l2`, `weather_affinity`, `seasonality`, `cross_brand_key`, `brand_ids` | `docs/features/PRODUCT_LEVEL_FEATURES.md` (taxonomy input) |
| Product catalog master data | Available | Data Platform :: Commerce Connectors | `shared/contracts/shopify_products.schema.json` → `title`, `product_type`, `vendor`, `created_at`, `updated_at` | `docs/api/shopify_admin_rest.md` (`/admin/api/2024-07/products.json`) |
| Inventory positions & sell-through | Gap | Supply Chain | Requires `inventory_levels` endpoint with on-hand, committed, safety stock | `docs/api/shopify_admin_rest.md` (`/admin/api/2024-07/inventory_levels.json`) |

## Sales & Customer Outcomes

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Daily sales outcomes | Available | Data Platform :: Commerce Connectors | `shared/contracts/shopify_orders.schema.json` → `net_revenue`, `shipping_postal_code`, `shipping_country`, `ship_geohash` | `docs/api/shopify_admin_rest.md` (`/admin/api/2024-07/orders.json`) |
| New vs returning customer mix | Gap | Lifecycle Marketing | Needs per-order customer profile & loyalty tier | `docs/api/shopify_admin_rest.md` (`/admin/api/2024-07/customers.json`) |

## Weather & Environmental Signals

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Daily observed weather features | Available | Weather Intelligence | `shared/contracts/weather_daily.schema.json` → temperature, precipitation, humidity, wind, UV, snow, anomaly & flag fields | `docs/api/open_meteo.md` (`/v1/forecast`) |
| Air quality and pollution metrics | Gap | Weather Intelligence | Requires AQI, PM2.5/PM10, ozone | `docs/api/open_meteo.md` (`https://air-quality-api.open-meteo.com/v1/air-quality`) |
| Pollen severity index | Gap | Weather Intelligence | Requires pollen index feed | `docs/api/open_meteo.md` (`https://pollen-api.open-meteo.com/v1/pollen`) |

## Temporal, Location, & Macro Context

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Calendar context from weather ingest | Available | Weather Intelligence | `shared/contracts/weather_daily.schema.json` → `timezone`, `day_of_year`, `observation_type`, `as_of_utc` | `docs/api/open_meteo.md` (`/v1/forecast`) |
| Holiday & events calendar | Gap | Strategy & Insights | Needs holiday API + event overlays | `docs/api/context7_holidays.md` (`/publicholidays/{year}/{country}`) |
| Macro-economic indicators | Gap | Strategy & Insights | Needs CPI, unemployment, gas price series | `docs/api/context7_bls.md` (`/macro/bls/timeseries/data`) |

## Competitive & Market Intelligence

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Competitor price gaps | Gap | Strategy & Insights | Requires competitive price intelligence feed | `docs/api/context7_competition.md` (`/competitive/pricing`) |

## Digital Behaviour & Owned Channels

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Dashboard suggestion interactions | Available | Product Analytics | `shared/services/dashboard_analytics_ingestion.py::DashboardSuggestionMetricRecord` → event action, severity, counts, metadata | `docs/DASHBOARD_ANALYTICS_METADATA.md` (`dashboard.weather_focus.suggestion`) |
| Site & app traffic funnels | Gap | Product Analytics | Requires sessions, bounce, conversion funnel metrics | `docs/api/google_analytics_data.md` (`/v1beta/properties/{property_id}:runReport`) |

## Operational & Supply Signals

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Logistics & fulfilment capacity | Gap | Supply Chain | Needs carrier alerts, backlog, staffing data | `docs/api/context7_logistics.md` (`/logistics/status`) |

## Experimentation & Governance

| Signal | Status | Owner | Data Source / Fields | API Reference |
| --- | --- | --- | --- | --- |
| Marketing experiment assignments | Gap | Growth Science | Requires geo/audience assignments and KPIs | `docs/api/context7_experiments.md` (`/experiments`) |

---

**Next steps**

1. Source owners should backfill missing endpoints or land ingestion pipelines for the remaining gaps.
2. As each gap closes, update `config/model_feature_catalog.yaml`, extend the validation tests, and annotate the status column here.
