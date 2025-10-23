# PoC Objectives - PRIORITY #1

**Last Updated**: 2025-10-23
**Status**: ACTIVE - This is the current top priority
**Owner**: Orchestrator (autonomous execution)

---

## Executive Summary

**THE GOAL**: Prove the model works when it should AND correctly identifies when it won't work.

We are NOT building infrastructure for the sake of infrastructure. We are building a **proof of concept** that demonstrates:

1. ✅ **Positive Case**: For weather-sensitive brands, the model predicts ad performance lift with high accuracy (R²≥0.65)
2. ✅ **Negative Case**: For random/non-weather-sensitive data, the model recognizes it can't help (low R², high uncertainty)
3. ✅ **End-to-End Simulation**: Full product experience simulated for diverse tenants

**Success = Demonstrating the model is NOT snake oil. It works when weather matters, and honestly admits when it doesn't.**

---

## The PoC Validation Strategy

### Phase 1: Diverse Synthetic Tenant Generation ✅ (In Progress)

**Generate 20+ simulated tenants with YEARS of data:**

**Tenant Types** (by weather sensitivity):

1. **Perfect Weather Sensitivity** (3-5 tenants)
   - **Example**: Rain gear brand where sales correlate 0.90+ with precipitation
   - **Data**: 3+ years of Shopify orders, Meta/Google ads, Klaviyo emails, Open-Meteo weather
   - **Expected Model Performance**: R²≥0.75, clear weather lift, strong recommendations
   - **Use Case**: "When rain forecast, increase ad spend 30% → ROAS improves 25%"

2. **High Weather Sensitivity** (5-7 tenants)
   - **Example**: Winter clothing, sunscreen, outdoor gear, HVAC
   - **Data**: Clear seasonal patterns + weather correlation (0.60-0.85)
   - **Expected Model Performance**: R²≥0.65, actionable weather features
   - **Use Case**: "Heatwave forecast → boost AC ads, expect 18% ROAS lift"

3. **Medium Weather Sensitivity** (5-7 tenants)
   - **Example**: General apparel, food delivery, some beauty products
   - **Data**: Weak-to-moderate weather correlation (0.30-0.60)
   - **Expected Model Performance**: R²=0.50-0.65, some weather features useful
   - **Use Case**: "Model identifies specific products sensitive to weather, not whole catalog"

4. **ZERO Weather Sensitivity - Random Data** (3-5 tenants)
   - **Example**: Electronics, books, software subscriptions
   - **Data**: Completely random relative to weather (correlation ≈0.00)
   - **Expected Model Performance**: R²<0.40, model should say "I can't help you"
   - **Use Case**: "Model output: 'Weather not predictive for this brand. Disable weather features.'"
   - **⚠️ CRITICAL**: This is GOOD science - proving the model doesn't hallucinate patterns!

**Data Requirements for Each Tenant**:
- **Shopify**: 3+ years of daily order data (revenue, product categories, customer locations)
- **Meta Ads**: Campaign spend, impressions, clicks, conversions, ROAS (daily)
- **Google Ads**: Same as Meta (shopping + search campaigns)
- **Klaviyo**: Email send volume, open rates, revenue attribution (daily)
- **Open-Meteo**: Weather data for customer locations (temperature, precipitation, wind, etc.)
- **Geographic spread**: Multiple US regions with different weather patterns

**Total Data Volume**: ~65,000 rows per tenant (3 years × 365 days × ~60 rows), 20 tenants = ~1.3M rows

---

### Phase 2: Model Training & Validation ⏳ (Next)

**For EACH simulated tenant, train a weather-aware MMM:**

**Training Process**:
1. **Feature Engineering**:
   - Ad spend by channel (Meta, Google)
   - Weather features (temp, precip, wind, etc.) with 0-14 day lags
   - Seasonal features (day of week, month, holidays)
   - Product category mix
   - Email activity

2. **Model Training**:
   - Mixed Marketing Model (MMM) with weather variables
   - Adstock transformations (capture delayed ad effects)
   - Cross-validation: Train on 80% of data, test on 20%
   - Hyperparameter tuning via grid search

3. **Performance Metrics**:
   - **R² (out-of-sample)** - How well does model predict ROAS on unseen data?
   - **MAE/RMSE** - Prediction error magnitude
   - **Weather coefficient significance** - Are weather features statistically significant (p<0.05)?
   - **Weather lift attribution** - How much ROAS improvement attributed to weather optimization?

**Success Criteria by Tenant Type**:
- **Perfect weather sensitivity**: R²≥0.75, weather features highly significant (p<0.001)
- **High weather sensitivity**: R²≥0.65, weather features significant (p<0.05)
- **Medium weather sensitivity**: R²≥0.50, some weather features significant
- **ZERO weather sensitivity**: R²<0.40, weather features NOT significant (p>0.10) ← **This is success!**

**The NEGATIVE case is as important as the POSITIVE case!**

---

### Phase 3: End-to-End Product Simulation ⏳ (After Model Training)

**Simulate the FULL customer experience for each tenant:**

#### 3.1 Forecasted Weather Ingestion

**What**: Ingest 7-day weather forecasts for each tenant's geographic markets
**Source**: Open-Meteo forecast API (free, no key required)
**Data**: Temperature, precipitation probability, wind, etc. for next 7 days
**Frequency**: Updated daily (simulated for each day in historical period)

#### 3.2 Ad Spend Recommendation Generation

**For each tenant, each day, generate recommendations:**

**Input**:
- Current ad spend levels (Meta, Google)
- 7-day weather forecast
- Historical ROAS patterns
- Trained MMM model predictions

**Output** (what customer would see in product):
```
📊 Weather-Aware Ad Recommendations (Next 7 Days)

Day 1 (Tomorrow):
☔ Rain probability: 80% in NYC/LA markets
📈 PREDICTED ROAS: 4.2x (vs. baseline 3.1x)
💡 RECOMMENDATION: Increase Meta ad spend +35% ($2,100 → $2,835)
   Rationale: Rain expected to drive 28% increase in rain gear sales
   Confidence: High (based on 12 similar weather events)

Day 2-3:
☀️ Clear weather, no adjustment recommended

Day 4:
❄️ Cold snap expected (temp drop 15°F)
📈 PREDICTED ROAS: 3.8x (vs. baseline 3.1x)
💡 RECOMMENDATION: Increase winter clothing ad spend +20%
   Rationale: Cold weather historically increases sales 18%
   Confidence: Medium (similar events: 8)

...
```

**Automation Options** (what customer could enable):
- ✅ Auto-adjust ad budgets when weather forecast changes (±30% max)
- ✅ Auto-increase bids for weather-sensitive products
- ✅ Auto-send Klaviyo email campaigns when favorable weather forecast
- ✅ Daily Slack notification with recommendations

#### 3.3 Simulated Automation Execution

**For tenants with high weather sensitivity, SIMULATE what would happen if they enabled automation:**

**Scenario**: 30-day simulation with weather-aware automation ON vs. OFF

**Control Group** (baseline - no weather optimization):
- Ad spend follows current strategy
- ROAS = baseline (e.g., 3.1x)
- Total revenue = $X

**Treatment Group** (weather-aware automation):
- Ad spend adjusted based on 7-day weather forecast
- Example: Rain forecast → increase umbrella ad spend 30% for 2 days
- Simulated ROAS = baseline × (1 + weather_lift)
- Total revenue = $X × (1 + lift%)

**Expected Results** (for weather-sensitive tenant):
- **Lift**: +15-30% incremental revenue vs. control
- **ROAS improvement**: 3.1x → 3.8x-4.0x
- **Ad efficiency**: Same budget, better timing = higher return

**Expected Results** (for NON-weather-sensitive tenant):
- **Lift**: ~0% (model correctly says "weather doesn't matter for you")
- **Recommendation**: "Weather optimization disabled - not predictive for your brand"

#### 3.4 Demo Dashboard & Reporting

**Generate interactive demo showing:**

1. **Tenant Overview**:
   - Brand name, product category, weather sensitivity score
   - Historical ROAS trends
   - Weather correlation analysis

2. **Model Performance**:
   - R² score, prediction accuracy
   - Weather feature importance
   - Confidence intervals

3. **Recommendations**:
   - Next 7 days weather forecast + predicted ROAS
   - Suggested ad spend adjustments
   - Historical similar events and outcomes

4. **Automation Results** (if enabled):
   - Lift vs. baseline (revenue, ROAS)
   - Cost efficiency gains
   - Weather event attribution

**This is what we show to prospects in sales demos!**

---

## Why This PoC Strategy Matters (Business Context)

### For CEO (Revenue)
**Without PoC validation**: No demo → No sales meetings → No revenue
**With PoC validation**: Working demo → Prospect meetings → Pilot deals → $50K MRR by Q2 2026

**Current Blocker**: Can't sell a product we haven't proven works. PoC validation IS the path to revenue.

### For CMO (Positioning)
**Value Prop**: "Capture 15-30% more revenue by timing ads to weather"
**Proof Requirement**: We need to SHOW this works (positive case) AND that we're honest when it doesn't (negative case)
**Sales Narrative**: "Our model increased ROAS 28% for this rain gear brand, but correctly identified it wouldn't help this electronics brand"

### For Academic (Rigor)
**Good Science**: Negative results are as valuable as positive results
**Red Flag**: A model that always claims to work (regardless of data) is snake oil
**Credibility**: Showing we can identify when weather DOESN'T matter builds trust

### For CFO (Unit Economics)
**Cost**: Synthetic data generation + model training = ~$200 compute + 2 weeks dev time
**Value**: Working demo enables pilot deals → $5K/month per tenant → ROI = 25x first month
**Risk**: If we can't prove the model works, we have no business

---

## Current Status (2025-10-23)

### ✅ DONE (Infrastructure)
- Synthetic data generation framework exists
- MMM model scaffolding in place
- Open-Meteo weather connector working
- Orchestrator can autonomously execute tasks

### ⏳ IN PROGRESS (T-MLR-1.2)
- Generate 20 diverse tenants with 3 years of data
- Include weather-sensitive AND random (non-sensitive) tenants
- Store in `storage/seeds/synthetic_v2/`

### 🔜 NEXT (Critical Path)
1. **T-MLR-2.3**: Train MMM models for all 20 tenants
2. **T-MLR-2.4**: Validate model performance (R² metrics, statistical significance)
3. **NEW**: Build end-to-end simulation (forecast ingestion → recommendations → automation results)
4. **T12.Demo.1**: Create demo dashboard showing results for 3-5 exemplar tenants

### 🚫 NOT PRIORITIES RIGHT NOW
- Building production infrastructure (DB sharding, multi-tenant architecture, etc.)
- UI polish (Vercel-level design can wait)
- Real customer integrations (Shopify OAuth, Meta API, etc.)
- DevOps hardening (monitoring, alerting, SLAs)

**These become priorities AFTER we prove the model works!**

---

## Orchestrator Decision Framework Update

**When evaluating tasks, orchestrator should ask:**

### CEO Lens (Updated Priority)
1. **Does this directly contribute to PoC validation?**
   - Synthetic data generation → HIGH PRIORITY
   - Model training on synthetic data → HIGH PRIORITY
   - End-to-end simulation → HIGH PRIORITY
   - Demo dashboard for sales → HIGH PRIORITY
   - Infrastructure work that doesn't unblock PoC → LOW PRIORITY

2. **Does this prove the model works OR prove it correctly identifies when it won't work?**
   - Positive case validation (weather-sensitive tenants) → HIGH PRIORITY
   - Negative case validation (random data tenants) → HIGH PRIORITY
   - Both are EQUALLY important for credibility!

### Academic Lens (Updated for Negative Results)
**Negative results are good science!**
- Task mentions "random data should fail" → BOOST SCORE
- Task mentions "model should recognize it can't help" → BOOST SCORE
- Task mentions "negative control" or "placebo tenant" → BOOST SCORE
- Only testing positive cases without negative controls → PENALTY

### PM Lens (Critical Path Focus)
**The critical path to revenue is:**
```
Synthetic Data (T-MLR-1.2) → Model Training (T-MLR-2.3) →
  Validation (T-MLR-2.4) → Demo Dashboard → Sales Meetings → Revenue
```

Any task NOT on this path should be deprioritized until PoC is proven.

---

## Success Metrics (PoC Validation)

### Technical Metrics
- ✅ **20+ diverse synthetic tenants** generated (various weather sensitivity levels)
- ✅ **3+ years of data** per tenant (~65K rows each)
- ✅ **R²≥0.65** for high weather-sensitive tenants (out-of-sample)
- ✅ **R²<0.40** for random-data tenants (correctly identifies no pattern)
- ✅ **Weather features significant** (p<0.05) for sensitive tenants
- ✅ **Weather features NOT significant** (p>0.10) for random tenants

### Business Metrics
- ✅ **Demo dashboard** shows 3-5 exemplar tenants (positive + negative cases)
- ✅ **15-30% simulated lift** for weather-sensitive tenants
- ✅ **~0% lift** for non-weather-sensitive tenants (honest result)
- ✅ **End-to-end simulation** (forecast → recommendations → automation → results)

### Sales Enablement
- ✅ **Working demo** that prospects can interact with
- ✅ **Proof of negative case** (we don't claim to help everyone)
- ✅ **Clear value prop validation** ("capture 15-30% more revenue")

---

## What "Done" Looks Like (PoC Complete)

**We can show a prospect:**

1. **Diverse Tenant Results**:
   - "Here's a rain gear brand - model predicts ROAS with 75% accuracy (R²=0.75)"
   - "Here's a winter clothing brand - model predicts 68% accuracy (R²=0.68)"
   - "Here's an electronics brand - model says 'weather not predictive' (R²=0.35)"
   - **The last one is as impressive as the first two!**

2. **Live Simulation**:
   - "Next 7 days: Rain forecast in NYC → Model recommends +30% ad spend for rain gear"
   - "Simulation shows this would have generated +24% ROAS lift in historical data"
   - "For electronics brand, model says 'no weather adjustment recommended'"

3. **Automation Demo**:
   - "If customer enables automation, system would have automatically adjusted ad spend 47 times in past 90 days"
   - "Estimated lift: +$43K incremental revenue (18% improvement)"
   - "Cost: Same ad budget, just better timing"

**This is what closes deals. This is the priority.**

---

## Next Actions for Orchestrator

**IMMEDIATE PRIORITIES** (this week):
1. Complete T-MLR-1.2 (synthetic data generation for 20 diverse tenants)
2. Start T-MLR-2.3 (train MMM models for all tenants)
3. Implement negative case validation (ensure random-data tenants show low R²)

**SHORT-TERM** (next 2 weeks):
4. Build end-to-end simulation (forecast → recommendations → automation)
5. Create demo dashboard with 5 exemplar tenants (3 positive, 2 negative)
6. Generate demo video/walkthrough for sales

**DEPRIORITIZE** (until PoC proven):
- Production infrastructure scaling
- Real customer OAuth integrations
- UI/UX polish (beyond demo quality)
- DevOps hardening
- Multi-tenant database architecture

**RULE**: If a task doesn't directly contribute to proving the model works (positive + negative cases), it waits until after PoC validation.

---

**Remember: We're not building a SaaS platform yet. We're proving the core idea works (and admitting when it doesn't). That's the priority.**

---

*This document should be referenced by orchestrator when evaluating task priorities via the CEO, Academic, and PM lenses.*
