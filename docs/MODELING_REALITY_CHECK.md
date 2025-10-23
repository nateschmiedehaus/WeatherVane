# Modeling Reality Check — Geographic, Inventory, and Implementation Details

**Questions we've been avoiding:**
1. What's the geographic unit for modeling? (Zip? State? Metro? DMA?)
2. How do we handle inventory constraints?
3. What if inventory data isn't in Shopify?
4. What other critical modeling questions are we missing?

---

## Part 1: Geographic Granularity Problem

**Current vague approach:** "Weather-aware recommendations"

**Reality check (Oct 2025 update):** We now ship a DMA-first geography hierarchy; the open questions remain below for historical context and future refinement.

### Question 1.1: What's the unit of analysis?

**Options:**
- **Zip code level** (41,000 US zip codes)
  - Pros: Very granular, accurate local weather
  - Cons: Sparse data (most brands don't have 41k zips with sales), overfitting risk

- **County level** (3,000 US counties)
  - Pros: Good balance of granularity and data density
  - Cons: Counties vary wildly in size (NYC vs rural Montana)

- **Metro area / DMA** (210 Designated Market Areas)
  - Pros: Matches ad targeting (Meta/Google use DMAs), sufficient data
  - Cons: Ignores micro-climate variation (Bay Area has 5 different climates)

- **State level** (50 states)
  - Pros: Simple, plenty of data
  - Cons: Too coarse (Texas weather varies 50°F north to south)

- **Custom weather zones** (temperature bands, climate regions)
  - Pros: More meaningful than political boundaries
  - Cons: Doesn't match ad platform targeting

**Decision (Oct 2025):** Adopt a DMA-first hierarchical pipeline that automatically backs off when coverage weakens.

- **Level 2 — DMA (default):** Applied when ≥55 % of orders in the lookback window expose a `ship_geohash` and ≥85 % of DMA/date combinations hit complete weather coverage. Coverage is measured on the precise join keys and exposed via `FeatureMatrix.weather_coverage_ratio`.
- **Level 1 — State fallback:** Triggered when DMA coverage fails but ≥25 % of orders retain DMA or state geography and ≥70 % of state/date rows have complete weather coverage. Orders and weather remap to `STATE:<abbr>` scopes so sparse DMAs inherit the nearest in-state signal.
- **Level 0 — Global fallback:** Activated when geographic metadata collapses entirely (e.g., no geocodes or state mapping). Feature builders emit a single `GLOBAL` scope while guardrails flag the loss of resolution.

Implementation details:
- `shared.libs.geography.GeographyMapper` resolves geohashes → DMA/state using `shared/data/geography/dma_county_crosswalk.csv` and county geometries.
- `shared.feature_store.feature_builder.FeatureBuilder._select_geography_level` evaluates coverage thresholds and records the chosen tier alongside fallback reasoning.
- `shared.feature_store.reports.generate_weather_join_report` and `apps.worker.monitoring.weather_guardrail` surface the coverage metrics so Atlas and Dana can track regressions.

Modeling and downstream allocators consume DMA metrics whenever thresholds hold; otherwise they inherit the broader scope selected above. This DMA-first stance aligns with Meta/Google targeting while ensuring we never silently operate on unreliable micro-geographies.

### Question 1.2: Customer location vs delivery location?

**Scenario:** Customer in Phoenix (105°F) orders winter coat to ship to Chicago (32°F)

**Which weather matters?**
- **Delivery location weather** (Chicago) - they're buying for the destination
- **Customer location weather** (Phoenix) - they're browsing in hot weather
- **Both** (complex interaction)

**Current approach:** Undefined

**Recommendation:**
- Use **delivery location** weather as primary signal
- Use **customer location** as secondary signal (affects browsing behavior)
- Track both, let model learn which matters more

### Question 1.3: Ad targeting geography vs sales geography?

**Scenario:** National brand runs Meta campaign targeting "Northeast" (broad region)

**Problem:**
- Sales come from specific cities (NYC, Boston, Philly)
- Weather varies within "Northeast" (NYC 40°F, upstate NY 20°F)
- Which weather affects campaign performance?

**Options:**
1. **Sales-weighted average weather** - Weight NYC weather by % of sales from NYC
2. **Impression-weighted average weather** - Weight by where ads are shown
3. **Campaign geography** - Use campaign's target region average weather

**Recommendation:** **Sales-weighted average weather** (what drove actual conversions)

### Question 1.4: Multi-location businesses (retail chains)?

**Scenario:** REI has 180 stores nationwide, runs both national and local campaigns

**Complexity:**
- **National campaigns** - Aggregate across all locations
- **Local campaigns** - Store-specific (e.g., "REI Seattle" campaign)
- **Inventory** - Store A has winter coats, Store B sold out

**Current approach:** Undefined

**Recommendation:**
- Tag campaigns as national vs local
- National: Use sales-weighted weather across all stores
- Local: Use store location weather + store inventory
- New task: T1.1.4 - Campaign geography classification

---

## Part 2: Inventory Integration Problem

**Current approach:** Assume infinite inventory

**Reality check:** Out-of-stock products shouldn't get budget increases

### Question 2.1: Where does inventory data live?

**Sources (by platform):**

**Shopify:**
- `inventory_quantity` per variant per location
- Real-time via Shopify API
- ✅ Easy to integrate

**Custom inventory systems:**
- NetSuite, SAP, custom databases
- May require custom integration
- ❌ Hard to integrate

**3PL/Fulfillment centers:**
- ShipBob, Flexport, Amazon FBA
- API available but varies by provider
- ⚠️ Medium difficulty

**Spreadsheets:**
- Yes, many brands still use Excel for inventory
- Manual upload or Google Sheets API
- ⚠️ Data freshness issues

**None:**
- Made-to-order, digital products, dropshipping
- Infinite inventory assumption valid
- ✅ No integration needed

**Recommendation:** Support tiered approach
1. **Tier 1 (MVP):** Shopify inventory (covers 50% of customers)
2. **Tier 2:** 3PL APIs (ShipBob, Flexport) (covers 30%)
3. **Tier 3:** Manual CSV upload (covers 15%)
4. **Tier 4:** Custom API integration (covers 5%, enterprise)

### Question 2.2: How do we model inventory constraints?

**Scenarios:**

**Scenario A: Out of stock**
- Product: Winter coat
- Inventory: 0 units
- Weather: Cold front coming
- Recommendation: ❌ Don't increase budget (will waste spend)

**Scenario B: Low stock**
- Product: Winter coat
- Inventory: 50 units (1 week supply at normal rate)
- Weather: Cold front coming (could sell 200 units)
- Recommendation: ⚠️ Increase budget slightly OR pause until restock

**Scenario C: Overstock**
- Product: Summer t-shirts
- Inventory: 5000 units (10 weeks supply)
- Weather: Summer ending (demand dropping)
- Recommendation: 🔥 Clearance sale + increased budget (move inventory)

**Scenario D: Pre-order / backorder**
- Product: New winter coat
- Inventory: -100 (100 pre-orders, arrives in 2 weeks)
- Weather: Cold front in 3 weeks
- Recommendation: ✅ Increase budget (can fulfill later)

**Current approach:** Undefined

**Recommendation:** Inventory-aware optimization
```python
recommendation = base_recommendation * inventory_multiplier

inventory_multiplier = {
    "out_of_stock": 0.0,           # Don't advertise
    "low_stock": 0.5,              # Reduce budget
    "normal_stock": 1.0,           # Normal
    "overstock": 1.5,              # Increase to clear
    "pre_order": 0.8,              # Moderate (lead time risk)
}
```

New tasks:
- T1.1.5: Inventory data integration (Shopify + 3PL + CSV)
- T4.1.11: Inventory-aware allocation optimizer
- T2.1.3: Inventory velocity features (days of supply, stockout risk)

### Question 2.3: Restock timing optimization?

**Advanced use case:** When should we restock given weather forecasts?

**Scenario:**
- Product: Winter coats
- Current inventory: 200 units (2 weeks supply)
- Weather forecast: Cold front in 3 weeks (could sell 500 units that week)
- Restock lead time: 2 weeks
- **Question:** Order restock now or wait?

**Recommendation:** Phase 2 feature
- T4.4.1: Inventory planning recommendations (restock timing)
- Requires: Weather forecasts + demand forecasts + lead time data
- High value for brands with long lead times (fashion, seasonal goods)

---

## Part 3: Geographic Modeling Implementation

### Question 3.1: How do we handle sparse geographic data?

**Problem:** Brand sells in 50 cities, but only 5 cities have enough data for city-level models

**Naive approach:**
- Model each city independently
- Result: 45 cities have terrible predictions (overfitting on sparse data)

**Better approach: Hierarchical Bayesian modeling**

```
sales_city ~
  national_baseline +                      # All cities share baseline
  weather_effect_national +                # Weather effect shared across cities
  weather_effect_state[state] +            # State-level variation
  weather_effect_city[city] +              # City-level variation (partial pooling)
  error
```

**Pooling strategy:**
- **NYC** (10k sales): 90% city-specific, 10% state/national
- **Topeka** (50 sales): 20% city-specific, 80% state/national (borrow from similar cities)

**New tasks:**
- T2.2.3: Hierarchical geographic modeling (city → metro → state → nation)
- T4.2.6: Partial pooling for sparse geographies

### Question 3.2: Weather metric selection?

**Question:** Which weather variables matter?

**Options:**
- **Temperature** (min, max, mean, feels-like)
- **Precipitation** (rain, snow, ice)
- **Wind** (speed, gusts)
- **Cloud cover** (sunny vs overcast)
- **Humidity**
- **Severe weather** (storms, hurricanes, floods)
- **Air quality** (smoke, pollution)
- **Pollen count** (allergies)

**Current approach:** Assume temperature + precipitation

**Reality:** Varies by product
- Winter coats: Temperature (cold)
- Umbrellas: Precipitation (rain)
- Air conditioners: Temperature (heat) + humidity
- Sunglasses: Cloud cover (sunny)
- Air purifiers: Air quality (smoke)
- Allergy medicine: Pollen count

**Recommendation:** Product-category-specific weather features
- Auto-detect relevant weather for each product category
- Feature engineering: "heating degree days", "cooling degree days", "consecutive rainy days"

**New tasks:**
- T2.1.4: Category-specific weather features (not just temp/precip)
- T4.2.7: Weather variable selection per product category

### Question 3.3: Geographic ad platform targeting?

**Problem:** Meta/Google use different geographic targeting

**Meta Ads:**
- City
- Radius around location
- DMA (Designated Market Area)
- State
- Country

**Google Ads:**
- Zip code
- City
- Metro area
- State
- Radius

**Shopify sales data:**
- Customer address (ship-to zip code)
- Store location (for retail)

**Mismatch:** Campaign targets "25 mile radius around Chicago", sales data has exact addresses

**Solution:**
- Reverse-geocode campaigns to zip codes
- Aggregate sales by campaign geography
- Match weather to campaign's actual footprint

**New tasks:**
- T1.1.6: Campaign geography normalization (map platform targeting to zips)
- T7.1.4: Geographic harmonization (reconcile platform differences)

---

## Part 4: Ad Platform Reality Check

### Question 4.1: Campaign structure complexity?

**Current assumption:** Brand → Campaign → Product (simple hierarchy)

**Reality:** Complex nested structure

**Meta Ads structure:**
```
Ad Account
  └─ Campaign (objective: conversions, budget: $1000/day)
      └─ Ad Set 1 (audience: Women 25-40 in NYC, budget: $500/day)
          └─ Ad 1a (creative: winter coat photo A)
          └─ Ad 1b (creative: winter coat video B)
      └─ Ad Set 2 (audience: Men 25-40 in Boston, budget: $500/day)
          └─ Ad 2a (creative: winter coat photo C)
```

**Question:** What level do we optimize?
- **Campaign level** - Too coarse (NYC + Boston mixed)
- **Ad Set level** - Right level (geography + audience)
- **Ad level** - Too granular (creative testing, not weather)

**Google Ads structure:**
```
Account
  └─ Campaign (budget: $1000/day, network: Search)
      └─ Ad Group 1 (keywords: "winter coats", bid: $2.50)
          └─ Ad 1a (headline: "Warm Winter Coats")
          └─ Ad 1b (headline: "Stay Cozy This Winter")
```

**Question:** What level do we optimize?
- **Campaign level** - Controls budget, network, geography
- **Ad Group level** - Keywords + bids (weather could affect bid strategy)

**Recommendation:**
- **Meta:** Optimize at Ad Set level (geography + audience)
- **Google Search:** Optimize at Campaign level (budget) + Ad Group level (bids)
- **Google Shopping:** Optimize at Campaign level (product groups)

**New tasks:**
- T5.1.3: Meta Ad Set level optimization (not just campaign)
- T5.2.3: Google bid strategy optimization (weather-aware bidding)

### Question 4.2: Budget hierarchy constraints?

**Reality:** Budgets are hierarchical with constraints

**Example:**
```
Total monthly budget: $100k
  └─ Meta Ads: $60k (60%)
      └─ Campaign A (Winter): $40k (max 50% of Meta)
          └─ Ad Set NYC: $20k (max 50% of Campaign A)
          └─ Ad Set Boston: $20k
      └─ Campaign B (Summer): $20k
  └─ Google Ads: $40k (40%)
      └─ Shopping: $30k
      └─ Search: $10k
```

**Constraints:**
- Total can't exceed $100k (hard cap)
- Meta can't exceed 70% of total (strategic allocation)
- Each campaign has min/max bounds
- Can't reallocate >20% per week (gradual changes)

**Current approach:** Undefined (assumes flexible budgets)

**Reality:** Budgets have complex constraints

**Recommendation:** Constraint-aware optimization
```python
maximize ROAS
subject to:
  sum(all_spend) <= total_budget
  meta_spend <= 0.7 * total_budget
  campaign_spend >= campaign_min
  campaign_spend <= campaign_max
  abs(new_budget - old_budget) <= 0.2 * old_budget  # max 20% change
```

**New tasks:**
- T4.1.12: Hierarchical budget constraints (nested min/max)
- T4.1.13: Change velocity limits (max % change per period)

---

## Part 5: Temporal Complexity

### Question 5.1: Forecast horizon vs ad platform responsiveness?

**Problem:** Weather forecasts have different time horizons, ad platforms respond at different speeds

**Weather forecast accuracy:**
- 1-3 days out: 90% accurate
- 4-7 days out: 75% accurate
- 8-14 days out: 60% accurate
- 15+ days out: Unreliable (seasonal averages)

**Ad platform response time:**
- **Meta/Google budget changes:** Immediate (same day impact)
- **Campaign creation:** 24-48 hours (review + learning phase)
- **Creative changes:** 3-7 days (learning phase reset)
- **Audience targeting changes:** 7-14 days (full learning)

**Mismatch:**
- We get accurate weather forecast for 3 days out
- But creative changes take 7 days to stabilize
- By the time new creative works, weather changed

**Recommendation:** Match recommendation type to forecast horizon
```
Forecast horizon 1-3 days:
  → Budget adjustments (fast response)
  → Bid strategy changes (fast response)

Forecast horizon 4-7 days:
  → Campaign on/off (medium response)
  → Product prioritization (medium response)

Forecast horizon 8-14 days:
  → Creative preparation (slow response)
  → Inventory planning (slow response)
```

**New tasks:**
- T4.1.14: Forecast-horizon-aware recommendation types
- T4.2.8: Action latency modeling (how long until change impacts ROAS?)

### Question 5.2: Causal lag between weather and purchases?

**Question:** Customer sees cold weather → how long until they buy winter coat?

**Scenarios:**

**Same-day purchase:**
- Unexpected cold → "I need a coat NOW" → Buy online for next-day delivery
- Lag: 0-1 days

**Planned purchase:**
- Cold forecast for next week → "I should buy a coat" → Research + buy in 3 days
- Lag: 3-7 days

**Seasonal preparation:**
- Fall arriving → "Winter is coming" → Buy coat 2 weeks before cold
- Lag: 14-30 days

**Current approach:** Undefined (assumes instant response)

**Reality:** Lag varies by product and urgency

**Recommendation:** Product-category-specific lags
```python
winter_coat_demand = (
  0.3 * weather_today +           # Emergency purchases
  0.5 * weather_3_days_ago +      # Planned purchases
  0.2 * weather_14_days_ahead     # Seasonal prep
)
```

**New tasks:**
- T2.1.5: Lagged weather features (weather → purchase lag per category)
- T4.2.9: Distributed lag models (multiple time horizons)

---

## Part 6: Product Catalog Complexity

### Question 6.1: Cross-product effects?

**Scenario:** Cold weather increases demand for:
- Winter coats ↑ 40%
- Hats ↑ 30%
- Gloves ↑ 35%
- **But also:** Sunglasses ↓ 60%, flip-flops ↓ 80%

**Question:** Do we recommend budget decreases for summer products?

**Current approach:** Undefined

**Options:**
1. **Increase only** - Never recommend decreasing budget (less risky)
2. **Increase + decrease** - Recommend both (more optimal but riskier)
3. **Reallocation** - Move budget from summer → winter (zero-sum)

**Recommendation:** Start with option 3 (reallocation)
- Safer than pure decreases (total spend stays constant)
- More optimal than pure increases (respects budget constraints)
- Clear narrative: "Move $5k from summer to winter"

**New tasks:**
- T4.1.15: Budget reallocation optimizer (shift between products)
- T2.1.6: Cross-product substitution effects

### Question 6.2: Product lifecycle stage?

**Scenario:** New product launch vs mature product

**New product (launched 1 week ago):**
- Limited sales data
- Weather effect unknown
- Need cold-start strategy

**Mature product (2 years old):**
- Rich sales history
- Weather effect well-established
- High-confidence recommendations

**Current approach:** Treat all products the same

**Recommendation:** Lifecycle-aware modeling
```python
if product_age < 30_days:
    # Cold-start: Use category average
    weather_effect = category_weather_effect
elif product_age < 90_days:
    # Warm-up: Blend category + product-specific
    weather_effect = 0.7 * category + 0.3 * product_specific
else:
    # Mature: Fully product-specific
    weather_effect = product_specific
```

**New tasks:**
- T2.2.4: Product lifecycle modeling (cold-start → mature)
- T4.2.10: Time-varying model confidence (lower for new products)

---

## Part 7: What Other Questions Are We Missing?

### Question 7.1: International / multi-currency?

**Scenario:** Brand sells in US, Canada, UK, EU

**Complexities:**
- Multiple currencies (USD, CAD, GBP, EUR)
- Different weather systems (Fahrenheit vs Celsius)
- Different ad platforms (Meta US vs Meta UK vs Baidu China)
- Different seasons (Northern vs Southern hemisphere)
- Different cultures (winter clothes style varies)

**Current approach:** US-only assumption

**Recommendation:** Start US-only, plan for international
- Phase 1: US only (simplify MVP)
- Phase 2: Canada (similar weather, currency conversion, metric system)
- Phase 3: UK/EU (different platforms, regulations, currencies)

### Question 7.2: Omnichannel (online + retail)?

**Scenario:** Brand has e-commerce + 50 retail stores

**Question:** Does weather affect online differently than in-store?

**Hypothesis:**
- **Severe weather** (snow, storm) → Online ↑, In-store ↓ (people stay home)
- **Mild cold** → In-store ↑ (impulse buy while shopping)
- **Heat wave** → Online ↑, In-store ↓ (avoid going out)

**Current approach:** E-commerce only

**Recommendation:** Phase 2 feature
- Track online vs in-store sales separately
- Model differential weather effects
- Optimize both channels

### Question 7.3: Competitor response?

**Scenario:** Everyone gets same weather forecast

**Question:** If all winter coat sellers increase ads in cold weather, does that:
- **Increase total market demand** (everyone wins)
- **Increase auction prices** (zero-sum game, no one wins)
- **Benefit first-movers** (competitive advantage for early adopters)

**Current approach:** Ignore competitors

**Reality:** Auction dynamics matter

**Recommendation:** Game theory research (T19.5.4)
- Model auction price response to weather
- Recommend actions that account for competitor behavior
- "Cold weather coming, but auction prices will rise 30%, recommend +10% budget (not +40%)"

### Question 7.4: Return rates & profitability?

**Scenario:** Cold weather → customers buy winter coats → 40% return rate when weather warms

**Question:** Should we factor return rates into ROAS?

**Current metric:** ROAS = Revenue / Ad Spend

**Better metric:**
```
Profitable ROAS = (Revenue - Returns - COGS - Shipping) / Ad Spend
```

**Reality:** Some weather-driven sales have high return rates

**Recommendation:** Return-adjusted ROAS
- Track return rates by product + weather condition
- Optimize for profitable ROAS, not gross ROAS
- "Don't recommend this product in borderline cold (high return rate)"

**New tasks:**
- T2.1.7: Return rate features (by product, by weather, by region)
- T4.1.16: Profitability-aware optimization (not just ROAS)

### Question 7.5: Brand new customers vs repeat customers?

**Scenario:** Weather-driven ad brings new customers

**Question:** Do weather-driven customers have different LTV?

**Hypothesis A:** Lower LTV (impulse buy, not loyal)
**Hypothesis B:** Higher LTV (discovered brand via weather, becomes fan)

**Current approach:** Undefined (optimize for immediate ROAS)

**Recommendation:** Customer cohort analysis
- Track LTV by acquisition weather
- Optimize for LTV, not just first-purchase ROAS
- "Cold-weather customers have 30% higher LTV → increase budget more"

**New tasks:**
- T2.1.8: Customer cohort features (acquisition weather → LTV)
- T4.1.17: LTV-aware optimization (not just immediate ROAS)

### Question 7.6: Creative & messaging optimization?

**Scenario:** Cold weather → should creative show snow/winter?

**Current approach:** Only optimize budget

**Advanced approach:** Optimize creative + messaging
- **Cold weather:** Show models in snow, "Stay warm this winter"
- **Hot weather:** Show models at beach, "Cool down with our new collection"

**Complexity:**
- Creative production lead time (weeks)
- A/B testing required
- Platform-specific creative specs

**Recommendation:** Phase 2 feature
- Phase 1: Budget optimization only
- Phase 2: Weather-aware creative rotation (use existing creatives)
- Phase 3: Weather-aware creative generation (AI-generated variations)

---

## Summary: Critical Missing Pieces

### Geographic Modeling

1. **T2.2.3:** Hierarchical geographic modeling (zip → county → metro → state → nation)
2. **T1.1.6:** Campaign geography normalization (map ad platform targeting to zips)
3. **T7.1.4:** Geographic harmonization (reconcile Shopify, Meta, Google geographies)
4. **T2.1.4:** Category-specific weather features (not just temp/precip)
5. **T4.2.6:** Partial pooling for sparse geographies (borrow strength)

### Inventory Integration

6. **T1.1.5:** Inventory data integration (Shopify + 3PL + CSV upload)
7. **T4.1.11:** Inventory-aware allocation (don't advertise out-of-stock)
8. **T2.1.3:** Inventory velocity features (days of supply, stockout risk)
9. **T4.4.1:** Inventory planning recommendations (restock timing)

### Ad Platform Complexity

10. **T5.1.3:** Meta Ad Set level optimization (not just campaign)
11. **T5.2.3:** Google bid strategy optimization (weather-aware bidding)
12. **T4.1.12:** Hierarchical budget constraints (nested min/max)
13. **T4.1.13:** Change velocity limits (max % change per period)

### Temporal Complexity

14. **T4.1.14:** Forecast-horizon-aware recommendations (match action to forecast accuracy)
15. **T2.1.5:** Lagged weather features (weather → purchase lag per category)
16. **T4.2.8:** Action latency modeling (time until change impacts ROAS)
17. **T4.2.9:** Distributed lag models (multiple time horizons)

### Product Catalog

18. **T4.1.15:** Budget reallocation optimizer (shift between products)
19. **T2.1.6:** Cross-product substitution effects
20. **T2.2.4:** Product lifecycle modeling (cold-start → mature)
21. **T4.2.10:** Time-varying model confidence (lower for new products)

### Profitability & Customer Value

22. **T2.1.7:** Return rate features (by weather condition)
23. **T4.1.16:** Profitability-aware optimization (returns + COGS + shipping)
24. **T2.1.8:** Customer cohort analysis (acquisition weather → LTV)
25. **T4.1.17:** LTV-aware optimization (not just immediate ROAS)

---

## Recommendations

### Immediate (Add to Roadmap Now)

**Epic 2 additions:**
- T2.2.3: Hierarchical geographic modeling (16 hrs)
- T2.1.3: Inventory velocity features (8 hrs)
- T2.1.4: Category-specific weather features (10 hrs)
- T2.1.5: Lagged weather features (8 hrs)

**Epic 1 additions:**
- T1.1.5: Inventory data integration (Shopify + CSV) (12 hrs)
- T1.1.6: Campaign geography normalization (8 hrs)

**Epic 4 additions:**
- T4.1.11: Inventory-aware allocation (14 hrs)
- T4.1.12: Hierarchical budget constraints (10 hrs)
- T4.1.13: Change velocity limits (6 hrs)
- T4.1.14: Forecast-horizon-aware recommendations (8 hrs)
- T4.1.15: Budget reallocation optimizer (12 hrs)

**Epic 5 additions:**
- T5.1.3: Meta Ad Set optimization (12 hrs)
- T5.2.3: Google bid strategy optimization (14 hrs)

### Phase 2 (After MVP)

- International expansion (multi-currency, metric system)
- Omnichannel (online + retail)
- Creative optimization (weather-aware messaging)
- Inventory planning (restock timing)
- LTV optimization (not just immediate ROAS)

---

**Bottom line:** We've been talking about "weather-aware ad optimization" without specifying the hard details: geographic granularity, inventory constraints, ad platform complexity, temporal lags, product lifecycle, profitability metrics. These aren't minor implementation details - they're core product decisions that determine if the model actually works in practice.
