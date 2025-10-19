# Product Taxonomy & Weather Affinity Service

## Purpose
T1.1.3 introduces an automatic taxonomy pass that transforms raw Shopify, Meta, and Google catalog feeds into structured product entities the modeling stack can trust. The new `ProductTaxonomyService` distills every ingestion record into a canonical entry with:

- `category_l1` / `category_l2` hierarchy (outerwear → coats, footwear → rain_boots, etc.)
- Weather affinity (`winter`, `summer`, `rain`, `heat`, `neutral`) and derived seasonality tags
- Deterministic `cross_brand_key` so identical products across brands collapse onto the same feature vector
- Confidence and evidence metadata for downstream QA and observability

## Inputs
The service consumes a sequence of `ProductSourceRecord` objects (one per ingestion source). Each record carries the tenant, canonical product id, source id, title/name, category strings, tags, vendor/brand, and free-form description. Records are grouped by `(tenant_id, canonical_product_id)` so Shopify + Meta + Google context unite before classification.

## Classification Heuristics
Keyword-pattern rules capture our current weather-sensitive categories. Examples:

| Rule | Signals | Output |
| --- | --- | --- |
| `outerwear_coats_winter` | `coat`, `parka`, `puffer`, `insulated` | `outerwear` → `coats`, affinity `winter`, seasonality `seasonal_q4_q1` |
| `footwear_rain_boots` | `rain boot`, `galosh`, `waterproof + boot` | `footwear` → `rain_boots`, affinity `rain`, seasonality `weather_triggered` |
| `apparel_swimwear` | `swim`, `bikini`, `boardshort` | `apparel` → `swimwear`, affinity `summer`, seasonality `seasonal_q2_q3` |
| `accessories_sunscreen` | `sunscreen`, `spf`, `sunblock` | `accessories` → `sunscreen`, affinity `heat`, seasonality `seasonal_q2_q3` |

Rules emit a score proportional to matched tokens and rule weight; the highest score wins. When no rule matches we fall back to `general/neutral/evergreen`.

## Weather Affinity & Seasonality
Weather affinity powers weather-aware modeling. Seasonality is derived from affinity:

- `winter` → `seasonal_q4_q1`
- `summer` / `heat` → `seasonal_q2_q3`
- `rain` → `weather_triggered`
- `neutral` → `evergreen`

`TextTagger` augments the evidence payload with heuristic weather/season keywords so analysts can verify why a product was tagged.

## Cross-Brand Key
Each taxonomy entry receives a normalized `cross_brand_key` constructed from the category, affinity, and optional modifiers:

```
<category_l2>_<weather_affinity>_[mens|womens|kids]_[extra_tokens]
```

The key allows the feature builder and allocator to aggregate “winter coat” performance across every brand.

## Confidence Scoring
Confidence ranges 0.45–0.95. Direct multi-token matches land ≥0.8, single-token matches ~0.6, and fallback classifications stop at 0.55. Evidence captures the originating rule, tokens, raw titles, categories, tags, and brands for audit trails.

## Limitations & Next Steps
- Current heuristics are keyword driven; future work should replace them with embedding similarity + supervised classifiers.
- Google Shopping category trees are only partially interpreted; adding taxonomy lookups will improve accuracy for long-tail verticals.
- Cross-brand keys ignore size/color variants today; enrich with structured attributes once the ingestion pipeline exposes them.
- Confidence does not yet feed retraining; wire it into monitoring so low-confidence entries surface for manual review.
