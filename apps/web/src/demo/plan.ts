import type { DemoPreferences } from "../lib/demo";
import type { PlanResponse, PlanSlice } from "../types/plan";

const isoDate = (offsetDays: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const opportunityByChannel: Record<
  DemoPreferences["primaryChannel"],
  { channel: string; headline: string; supporting: string[] }
> = {
  meta: {
    channel: "Meta Advantage+",
    headline: "Meta Advantage+ warm weather audiences ready for surge",
    supporting: [
      "Heatwave cohorts historically lift Meta conversion rate 18-24%",
      "Creative set `Sunrise Splash` optimized for high UV index days",
    ],
  },
  google: {
    channel: "Google Search",
    headline: "High-intent queries climbing ahead of weather swing",
    supporting: [
      "Weather-triggered bid rules show +32% impression share during anomalies",
      "Branded queries hold steady; non-brand 'cooler deals' up 44%",
    ],
  },
  email: {
    channel: "Klaviyo Email",
    headline: "Weather-conditioned lifecycle campaign primed for max reach",
    supporting: [
      "Segment `Heat Relief VIP` shows 58% open rate during >95°F streaks",
      "Pre-approved copy variation and assets already localized for TX + AZ",
    ],
  },
  pos: {
    channel: "Shopify POS",
    headline: "In-store traffic spikes with localized forecast signage",
    supporting: [
      "Geofenced push notifications lift footfall 21% during cold snaps",
      "Inventory buffer holds 4.2 days of surge-ready stock in top stores",
    ],
  },
};

const automationCopy: Record<
  DemoPreferences["automationComfort"],
  { label: string; guardrail: string }
> = {
  manual: {
    label: "Manual mode (review every recommendation)",
    guardrail: "Guardrails stay enforced; no automated pushes without sign-off.",
  },
  assist: {
    label: "Assist mode (one-click approvals)",
    guardrail: "Assist queue batches approvals at 7am local time; guardrails re-check before push.",
  },
  autopilot: {
    label: "Autopilot mode (hands-off within limits)",
    guardrail:
      "Autopilot respects daily delta caps and resets to Assist when guardrail breaches occur.",
  },
};

const baseSlices: PlanSlice[] = [
  {
    plan_date: isoDate(1),
    geo_group_id: "Texas · Gulf Region",
    category: "Cooling · Summer Essentials",
    channel: "Meta Advantage+",
    recommended_spend: 4200,
    expected_revenue: { p10: 6800, p50: 11200, p90: 14800 },
    expected_roas: { p10: 1.6, p50: 2.67, p90: 3.52 },
    confidence: "HIGH",
    assumptions: ["Historical conversion lift persists above 95°F heat index"],
    rationale: {
      primary_driver: "Heatwave (Δ +11°F) with dew point surge lifting beverage demand",
      supporting_factors: [
        "Three-day forecast with sustained UV index ≥8",
        "Meta Advantage+ audiences historically convert 22% better during heat anomalies",
        "Inventory levels at 96% of safety stock threshold",
      ],
      confidence_level: "HIGH",
      data_quality: "Weather + commerce backtest coverage 98%",
      assumptions: ["Creative set localized for TX already approved"],
      risks: ["Heat index above 105°F can reduce in-store traffic if not paired with delivery CTA"],
    },
  },
  {
    plan_date: isoDate(2),
    geo_group_id: "Colorado Front Range",
    category: "Outerwear · Cold Weather",
    channel: "Google Search",
    recommended_spend: 2600,
    expected_revenue: { p10: 4100, p50: 7200, p90: 9300 },
    expected_roas: { p10: 1.55, p50: 2.77, p90: 3.58 },
    confidence: "MEDIUM",
    assumptions: ["Snow advisory triggers same-day demand spike"],
    rationale: {
      primary_driver: "Incoming cold snap (Δ -16°F) with advisory issued",
      supporting_factors: [
        "Search demand for 'lightweight parka' up 41% vs seasonal baseline",
        "Merchandising dashboards show 14 days of stock coverage",
        "Google Smart Bidding historical lift +18% under similar weather anomalies",
      ],
      confidence_level: "MEDIUM",
      data_quality: "Weather coverage 96%; Google Ads attribution window overlapping sale period",
      assumptions: ["Courier capacity confirmed for overnight shipping"],
      risks: ["Blizzard severity could delay fulfillment, reducing realized lift"],
    },
  },
  {
    plan_date: isoDate(3),
    geo_group_id: "Pacific Northwest",
    category: "Rainwear · Commuter",
    channel: "Email · Klaviyo",
    recommended_spend: 1100,
    expected_revenue: { p10: 2200, p50: 3600, p90: 4500 },
    expected_roas: { p10: 2.0, p50: 3.27, p90: 4.09 },
    confidence: "HIGH",
    assumptions: ["Lifecycle drip campaign ready with weather conditional step"],
    rationale: {
      primary_driver: "Atmospheric river event delivering 1.8\" rain in Seattle metro",
      supporting_factors: [
        "Rain-triggered automation historically drives 32% click-to-open lift",
        "SMS follow-up variant already QA’d with compliance team",
        "Merch mix includes new breathable trench inventory",
      ],
      confidence_level: "HIGH",
      data_quality: "Email + SMS attribution pipeline verified (92% open tracking coverage)",
      assumptions: ["No deliverability degradation from recent sale blast"],
      risks: ["Must throttle sends if engagement dips below 18% to maintain inbox placement"],
    },
  },
  {
    plan_date: isoDate(4),
    geo_group_id: "Florida Peninsula",
    category: "Travel · Accessories",
    channel: "Meta Advantage+",
    recommended_spend: 1500,
    expected_revenue: { p10: 2000, p50: 3200, p90: 4300 },
    expected_roas: { p10: 1.33, p50: 2.13, p90: 2.87 },
    confidence: "LOW",
    assumptions: ["Tropical storm watch remains downgraded"],
    rationale: {
      primary_driver: "Transient humidity spike with improved beach conditions after storm clears",
      supporting_factors: [
        "Travel accessories cohort shows propensity shift +12%",
        "Paid social creative refresh scheduled with new summer narrative",
        "Airline bookings trending +7% week-over-week across Miami / Tampa",
      ],
      confidence_level: "LOW",
      data_quality: "Weather forecast volatility ±20%; campaign cohort limited to 180 conversions",
      assumptions: ["Storm center continues moving east; no renewed warnings"],
      risks: ["Rapid weather reversal could nullify demand spike"],
    },
  },
  {
    plan_date: isoDate(5),
    geo_group_id: "New York Metro",
    category: "Essentials · Rain Gear",
    channel: "Google Search",
    recommended_spend: 1800,
    expected_revenue: { p10: 2500, p50: 3900, p90: 5200 },
    expected_roas: { p10: 1.39, p50: 2.17, p90: 2.89 },
    confidence: "MEDIUM",
    assumptions: ["Transit alerts drive commuter prep purchases"],
    rationale: {
      primary_driver: "Back-to-back rainfall events with flood advisory",
      supporting_factors: [
        "Branded umbrella queries already up 33%",
        "Creative set `Storm Ready` flagged green in QA",
        "NY Metro heavy rainfall typically increases AOV 12%",
      ],
      confidence_level: "MEDIUM",
      data_quality: "Attribution mix contains 45-day lookback; minimal missing conversions",
      assumptions: ["Logistics team confirms expedited shipping thresholds met"],
      risks: ["Flooding disruptions can impact warehouse dispatch SLAs"],
    },
  },
];

export function buildDemoPlan(preferences: DemoPreferences): PlanResponse {
  const channelFocus = opportunityByChannel[preferences.primaryChannel];

  const adaptedSlices = baseSlices.map((slice, index) => {
    if (index === 0) {
      return {
        ...slice,
        channel: channelFocus.channel,
        rationale: {
          ...slice.rationale,
          primary_driver: channelFocus.headline,
          supporting_factors: channelFocus.supporting,
        },
      };
    }
    if (preferences.primaryChannel === "meta" && slice.channel === "Meta Advantage+") {
      return slice;
    }
    if (preferences.primaryChannel === "google" && slice.channel === "Google Search") {
      return slice;
    }
    if (preferences.primaryChannel === "email" && slice.channel.includes("Email")) {
      return slice;
    }
    if (preferences.primaryChannel === "pos" && slice.geo_group_id.includes("Texas")) {
      return {
        ...slice,
        channel: "Shopify POS · Local activation",
        rationale: {
          ...slice.rationale,
          supporting_factors: [
            "Localized signage kit scheduled for dawn delivery",
            "POS loyalty notifications set to trigger at doors-open",
            "In-store associates briefed on weather-specific offers",
          ],
        },
      };
    }
    return slice;
  });

  return {
    tenant_id: "demo-tour",
    generated_at: new Date().toISOString(),
    horizon_days: 7,
    slices: adaptedSlices,
    context_tags: [
      "demo",
      "calm-theme",
      `channel:${preferences.primaryChannel}`,
      `automation:${preferences.automationComfort}`,
    ],
    data_context: {
      metadata: {
        dataset_rows: {
          orders: 2340,
          campaigns: 58,
          weather_events: 12,
        },
        weather_source: "open-meteo · synthetic forecast (demo)",
      },
    },
    context_warnings: [
      {
        code: "demo-automation-mode",
        message: automationCopy[preferences.automationComfort].label,
        severity: "info",
        tags: ["demo", "automation"],
      },
      {
        code: "demo-guardrail-reminder",
        message: automationCopy[preferences.automationComfort].guardrail,
        severity: "warning",
        tags: ["demo", "guardrail"],
      },
    ],
    incrementality_summary: {
      treatment_mean: 3.08,
      control_mean: 2.54,
      absolute_lift: 0.54,
      lift: 0.212,
      p_value: 0.018,
      conf_low: 0.18,
      conf_high: 0.3,
      sample_size_treatment: 420,
      sample_size_control: 410,
      generated_at: new Date().toISOString(),
      is_significant: true,
    },
  };
}
