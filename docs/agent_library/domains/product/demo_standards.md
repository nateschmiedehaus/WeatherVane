# Demo Standards

Standards for demo environment, data, and user experience.

---

## Demo Environment

### Purpose

**Goal**: Showcase WeatherVane's value in 5 minutes without setup friction

**Audience**: Prospective customers (marketing managers, e-commerce operators)

**Success Criteria**:
- Visitor understands value in <2 minutes
- Can interact with demo without signup
- Sees realistic data (not "Lorem Ipsum")
- Experiences "aha moment" (weather → ROAS correlation)

---

## Demo Data Requirements

### Synthetic Tenant Profiles

**Location**: `state/analytics/synthetic_tenant_profiles.json`

**Profiles** (3 example businesses):

1. **Sunny Scoops Ice Cream** (Temperature-sensitive)
   - Product: Ice cream
   - Weather correlation: Temperature (+0.72)
   - ROAS baseline: $3.20
   - ROAS with weather optimization: $3.85 (+20%)

2. **Rainy Day Gear** (Precipitation-sensitive)
   - Product: Rain gear, umbrellas
   - Weather correlation: Precipitation (+0.65)
   - ROAS baseline: $2.80
   - ROAS with weather optimization: $3.35 (+20%)

3. **Green Thumb Lawn Care** (Multi-factor)
   - Product: Lawn care services
   - Weather correlation: Temperature (+0.45), Precipitation (-0.38)
   - ROAS baseline: $4.10
   - ROAS with weather optimization: $4.72 (+15%)

**Generation**: `scripts/weather/generate_synthetic_tenants.py`

---

### Data Realism Standards

**90-day historical data**:
- ✅ Real weather data (Open-Meteo API)
- ✅ Synthetic sales data with realistic seasonality
- ✅ Realistic ROAS (2.5-5.0 range)
- ✅ Weather-influenced variance (±20% based on conditions)

**No placeholders**:
- ❌ "Lorem ipsum" text
- ❌ "Test Company 1, 2, 3"
- ❌ Random numbers without meaning
- ✅ Realistic business names, products, metrics

---

## Demo User Experience

### Landing Page

**First screen** (no signup required):
```
┌─────────────────────────────────────────┐
│  WeatherVane: Weather-Aware Marketing   │
├─────────────────────────────────────────┤
│                                         │
│  See how weather impacts your ROAS     │
│                                         │
│  [Try Demo] ← One click, no signup     │
│                                         │
│  OR                                     │
│                                         │
│  [Sign Up for Free]                    │
└─────────────────────────────────────────┘
```

**"Try Demo" loads**: Pre-populated dashboard with Sunny Scoops data

---

### Demo Dashboard

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│  [Sunny Scoops Ice Cream] ▼  [Switch Demo]         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ROAS Improvement: +20% with weather optimization  │
│  $3.20 baseline → $3.85 weather-aware              │
│                                                     │
│  ┌─────────────────────────────────────────┐       │
│  │  ROAS vs Temperature (90 days)          │       │
│  │                                         │       │
│  │  [Interactive Chart: Scatter plot]     │       │
│  │   - X-axis: Temperature                │       │
│  │   - Y-axis: ROAS                       │       │
│  │   - Trend line: r=0.72 (strong)        │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  ┌─────────────────────────────────────────┐       │
│  │  Budget Recommendations (Next 7 Days)   │       │
│  │                                         │       │
│  │  Mon: 85°F → +18% budget ($1,180)      │       │
│  │  Tue: 78°F → +8% budget ($1,080)       │       │
│  │  Wed: 72°F → Normal ($1,000)           │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  [See How It Works] [Sign Up Now]                 │
└─────────────────────────────────────────────────────┘
```

**Interactions**:
- Switch between 3 demo tenants (dropdown)
- Hover over chart points to see date, temp, ROAS
- Click "See How It Works" → Explanation modal
- Click "Sign Up Now" → Signup flow

---

## Demo Narrative

### The Story

**Setup**: Meet Sunny Scoops Ice Cream
- Small business in NYC
- Runs Google Ads
- Struggling with inconsistent ROAS

**Problem**: Manual budget adjustments
- "I increase my ad budget on hot days, but often miss the window"
- "By the time I notice it's hot, the day is half over"
- "Sometimes I waste budget on days that cool down unexpectedly"

**Solution**: WeatherVane automation
- Automatically increases budget when forecast shows 80°F+
- Reduces budget when forecast shows <65°F
- Result: +20% ROAS improvement

**Proof**: Show the data
- Chart: Clear correlation between temperature and ROAS
- Historical: "On days >85°F, your ROAS averaged $4.20"
- Forecast: "Tomorrow is 87°F → we recommend +20% budget"

**Call to Action**: "Start your free trial"

See [Demo Executive Brief](/docs/DEMO_EXECUTIVE_BRIEF.md) for full narrative

---

## Demo Video Script

**Duration**: 2 minutes

**Script**: See [Demo Video Script](/docs/DEMO_VIDEO_SCRIPT.md)

**Key Moments**:
- 0:00-0:15 → Hook ("What if weather predicted your sales?")
- 0:15-0:45 → Problem (manual optimization is slow)
- 0:45-1:15 → Solution (automated weather-aware budgeting)
- 1:15-1:45 → Proof (show correlation chart, +20% ROAS)
- 1:45-2:00 → CTA ("Start free trial")

---

## Brand Guidelines

**Location**: `docs/DEMO_BRAND_PLAYBOOK.md`

### Color Palette

**Primary**:
- Sky Blue: `#4A90E2` (trust, weather)
- Sunshine Yellow: `#F5A623` (warmth, optimism)

**Secondary**:
- Forest Green: `#7ED321` (growth, success)
- Storm Gray: `#4A4A4A` (professionalism)

**Neutrals**:
- White: `#FFFFFF`
- Light Gray: `#F5F5F5`
- Dark Gray: `#333333`

### Typography

**Headings**: Inter (bold)
**Body**: Inter (regular)
**Code**: Fira Code (monospace)

### Tone

**Voice**: Friendly, professional, data-driven
**Style**: Clear, concise, jargon-free

**Good**:
- "Weather affects your sales. We help you adapt automatically."
- "See your ROAS improve by 15-20% with weather-aware budgeting."

**Bad**:
- "Leverage our proprietary ML algorithms to synergize weather data."
- "Utilize our platform to maximize ROI through meteorological intelligence."

---

## Demo Performance Standards

### Speed

**Target**: <2 seconds to interactive

**Optimizations**:
- Preload demo data in memory
- Cache weather API responses
- Optimize chart rendering
- Use CDN for assets

### Reliability

**Target**: 99.9% uptime

**Safeguards**:
- Fallback to cached data if API fails
- Graceful degradation (show static chart if dynamic fails)
- Error boundaries (don't crash entire demo)

---

## A/B Testing

### Variations to Test

**Headline**:
- A: "Weather-Aware Marketing Automation"
- B: "Increase ROAS by 20% with Weather Intelligence"

**CTA**:
- A: "Try Demo"
- B: "See It In Action"
- C: "Start Free Trial"

**Demo Flow**:
- A: Dashboard first (show value immediately)
- B: Explanation first (educate then show)

**Metrics**:
- Conversion rate (demo → signup)
- Time to conversion
- Engagement (chart interactions, tenant switches)

---

## Demo Maintenance

### Data Refresh

**Weekly**:
- Update weather data (keep demo current)
- Regenerate synthetic sales (maintain realism)

**Monthly**:
- Review correlation coefficients (ensure still realistic)
- Update tenant profiles if needed

**Quarterly**:
- A/B test new variations
- Gather user feedback
- Update narrative based on learnings

---

## Demo Validation Checklist

Before launching demo:
- [ ] All 3 tenant profiles load without errors
- [ ] Charts render correctly (no missing data)
- [ ] Weather data is current (<24 hours old)
- [ ] ROAS improvements are realistic (15-20%)
- [ ] No "Lorem Ipsum" or placeholder text
- [ ] Page loads in <2 seconds (p95)
- [ ] Mobile responsive (tested on 3 devices)
- [ ] Signup flow works end-to-end
- [ ] Analytics tracking is active

---

## References

- [Demo Executive Brief](/docs/DEMO_EXECUTIVE_BRIEF.md)
- [Demo Video Script](/docs/DEMO_VIDEO_SCRIPT.md)
- [Demo Brand Playbook](/docs/DEMO_BRAND_PLAYBOOK.md)
- [Synthetic Tenant Generation](/scripts/weather/generate_synthetic_tenants.py)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
