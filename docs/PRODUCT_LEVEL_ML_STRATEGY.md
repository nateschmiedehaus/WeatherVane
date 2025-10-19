# Product-Level ML Strategy — 2025-10-18

## The Problem with Brand-Level ML

**Current approach (naive):**
- "Brand X performs 15% better in cold weather"
- "Allocate more budget to Brand X when cold"

**Problems:**
1. Not transferable (can't use Brand X insights for Brand Y)
2. Not actionable (which products should Brand X push?)
3. Misses the real signal (it's WINTER COATS that perform better, not the brand)
4. Can't handle new brands (no data)

---

## The Product-Level Solution

**Better approach:**
- "Winter coats perform 40% better when temp <50°F"
- "Brand X sells winter coats, Brand Y sells t-shirts"
- "Allocate to winter coat products when cold weather forecast"

**Advantages:**
1. ✅ Transferable across brands (all winter coat sellers benefit)
2. ✅ Actionable (push winter coat campaigns, pause summer products)
3. ✅ Captures real signal (weather → product category → sales)
4. ✅ Works for new brands (borrow from category patterns)

---

## Hierarchical Modeling Structure

```
Weather Conditions
    ↓
Product Categories (winter/summer/rain/neutral)
    ↓
Specific Products (winter coat, rain jacket, t-shirt)
    ↓
Brand-Product Combos (Brand X winter coat, Brand Y winter coat)
    ↓
Campaigns (Brand X "Winter Sale" campaign)
```

**Model hierarchy:**
- **Level 1:** Weather → Product Category effects (STRONG signal)
- **Level 2:** Category → Specific Product effects (medium signal)
- **Level 3:** Product → Brand-specific effects (weak signal, mostly brand preference)

---

## Roadmap Tasks Added

### T1.1.3: Automatic Product Taxonomy Tagging
**What:** Auto-classify products from Shopify/Meta/Google data

**Input:**
- Shopify: product title, category, tags, description, vendor
- Meta Ads: ad creative, product catalog, campaign structure
- Google Ads: ad copy, product feed, shopping categories

**Output:**
- `product_id`, `brand_id`, `product_name`
- `category_l1` (outerwear, footwear, accessories)
- `category_l2` (coats, boots, umbrellas)
- `weather_affinity` (winter, summer, rain, heat, neutral)
- `seasonality` (seasonal vs evergreen)
- `cross_brand_product_key` (matches "winter coat" across all brands)

**Example:**
```json
{
  "product_id": "prod_123",
  "brand_id": "brand_x",
  "product_name": "Men's Insulated Parka",
  "category_l1": "outerwear",
  "category_l2": "coats",
  "weather_affinity": "winter",
  "seasonality": "seasonal_q4_q1",
  "cross_brand_key": "winter_coat_mens"
}
```

---

### T2.1.2: Product-Level Feature Engineering

**Features per product:**
- `sales_7d`, `sales_28d`, `sales_rolling_mean`
- `roas_7d`, `roas_28d`
- `weather_correlation_temp`, `weather_correlation_precip`
- `seasonal_index` (0-1, how seasonal is this product)

**Features per category:**
- `category_sales_in_cold_weather` (avg sales when temp <50°F)
- `category_sales_in_rain` (avg sales when precip >0.1in)
- `category_seasonal_pattern` (monthly sales distribution)

**Cross-brand patterns:**
- `umbrella_lift_in_rain` = 2.3x (all umbrella products)
- `winter_coat_lift_in_cold` = 1.8x (all winter coat products)

---

### T2.2.2: Hierarchical Modeling

**Multi-level Bayesian model:**
```
sales_product_brand ~
  weather_category_effect[product_category] +  # STRONG (shared across brands)
  product_specific_effect[product_id] +        # MEDIUM (product quality)
  brand_preference[brand_id] +                 # WEAK (brand loyalty)
  error
```

**Pooling strategy:**
- **Complete pooling:** All winter coats treated identically (too simple)
- **No pooling:** Each brand-product independent (overfits, can't share)
- **Partial pooling (BEST):** Products borrow strength from category, but can deviate

**Cold-start handling:**
- New product with no data → use category average
- After 7 days → partial pooling (80% category, 20% product)
- After 28 days → mostly product-specific (20% category, 80% product)

---

### T4.2.0: Research ML/Causal/Optimization Foundations

**Research areas:**

**1. Hierarchical Bayesian Modeling:**
- PyMC: Probabilistic programming for multi-level models
- Stan: High-performance Bayesian inference
- Papers: Gelman & Hill "Data Analysis Using Regression and Multilevel/Hierarchical Models"

**2. Causal Inference:**
- Pearl causality (do-calculus)
- Propensity score matching
- DoWhy library (Microsoft Research)
- Papers: "The Book of Why" (Pearl), "Causal Inference in Statistics" (Pearl)

**3. Optimization:**
- Constrained optimization: cvxpy, scipy.optimize, OR-Tools
- Hierarchical constraints (brand → campaign → product budgets)
- Papers: Boyd & Vandenberghe "Convex Optimization"

**4. Marketing Mix Modeling:**
- Robyn (Meta open source MMM)
- LightweightMMM (Google)
- PyMC-Marketing
- Papers: "Challenges and Opportunities in Media Mix Modeling" (Meta AI)

**5. Time-Series Forecasting:**
- Prophet (Meta) - additive seasonality
- NeuralProphet - neural network extension
- ARIMA/SARIMA for seasonal patterns

**Playwright integration:**
- Browse Google Scholar for latest weather-marketing papers
- ArXiv for ML/causal papers
- Meta Research blog
- Google AI blog

---

### T4.1.5b: Product-Level Allocation Optimization

**Problem:**
```
maximize ROAS
subject to:
  sum(product_budgets) <= campaign_budget
  sum(campaign_budgets) <= brand_budget
  sum(brand_budgets) <= total_budget
  product_budgets >= 0
  forecast_weather in {cold, hot, rain, neutral}
```

**Weather-aware allocation:**
```python
if weather_forecast == "cold":
    # Boost all winter products across all brands
    for product in products:
        if product.weather_affinity == "winter":
            budget[product] *= 1.5

if weather_forecast == "rain":
    # Boost umbrellas, rain gear
    for product in products:
        if product.category_l2 in ["umbrellas", "rain_jackets"]:
            budget[product] *= 2.0
```

**Hierarchical constraints:**
1. Total budget cap (e.g., $100k/week)
2. Brand-level caps (Brand X max $30k, Brand Y max $40k)
3. Campaign-level caps (Winter Sale max $20k)
4. Product-level floors (each product min $500 or pause)

**Optimization methods to compare:**
- SLSQP (Sequential Least Squares)
- Interior-point method
- ADMM (Alternating Direction Method of Multipliers)
- OR-Tools (Google's constraint solver)

---

## Example: Cross-Brand Intelligence

**Scenario:** Cold weather forecast (30°F) in NYC next week

**Traditional (brand-level):**
- "Increase Brand X budget by 10%"
- ❌ Not specific enough

**Product-level approach:**
```
Analysis:
- Winter coats: +45% sales in cold weather (all brands)
- T-shirts: -20% sales in cold weather (all brands)
- Umbrellas: no correlation with temperature

Actions:
- Brand X: Increase "Winter Coat" product ad spend +80%
- Brand X: Pause "T-Shirt" campaign
- Brand Y: Increase "Insulated Jacket" ad spend +80%
- Brand Z: No change (sells only t-shirts)

Result:
- Right products pushed at right time
- Works for all brands (even new ones)
- Measurable lift per product category
```

---

## Data Pipeline

**Ingestion:**
```
Shopify → Products (title, category, vendor)
    ↓
Product Taxonomy Service (auto-classify)
    ↓
Enriched Products (+ weather_affinity, category_l1/l2)
    ↓
Feature Engineering (sales per product, weather correlation)
    ↓
ML Model (hierarchical: category → product → brand)
    ↓
Allocator (product-level budget optimization)
    ↓
Recommendations (increase/decrease per product)
```

---

## Success Metrics

**Product-level modeling enables:**
1. ✅ Cross-brand transferability (new brands get smart recommendations day 1)
2. ✅ Granular recommendations ("push winter coats, pause t-shirts")
3. ✅ Cold-start handling (new products borrow from category)
4. ✅ Explainability ("winter coats sell 45% better when <50°F")
5. ✅ Rapid learning (category patterns emerge in days, not weeks)

---

**Status:** Roadmap updated with 4 new tasks (50 hours)
**Priority:** HIGH - This is core product differentiation
**Dependencies:** Taxonomy tagging must come before ML modeling
