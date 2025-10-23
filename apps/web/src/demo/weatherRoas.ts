export type WeatherSensitivity = "Extreme" | "High" | "Medium" | "Control";

export interface TenantMetricSnapshot {
  revenue: number;
  roas: number;
  spend: number;
}

export interface TenantWeatherProfile {
  id: string;
  label: string;
  location: string;
  sensitivity: WeatherSensitivity;
  persona: string;
  validationBadge: {
    label: string;
    tone: "success" | "caution" | "muted";
  };
  confidence: "High" | "Medium" | "Field test";
  weatherSignal: number;
  roasLift: {
    low: number;
    expected: number;
    high: number;
  };
  keyDrivers: string[];
  recommendedActions: string[];
  highlight: string;
  metrics: {
    withWeather: TenantMetricSnapshot;
    withoutWeather: TenantMetricSnapshot;
  };
}

export const weatherRoasTenants: TenantWeatherProfile[] = [
  {
    id: "summit-supply",
    label: "Summit Supply Cooperative",
    location: "Denver, CO",
    sensitivity: "Extreme",
    persona: "Blizzards and heat swings reshape demand every week.",
    validationBadge: {
      label: "Field test scheduled",
      tone: "caution",
    },
    confidence: "Field test",
    weatherSignal: 0.32,
    roasLift: {
      low: 0.18,
      expected: 0.26,
      high: 0.34,
    },
    keyDrivers: [
      "Blizzard follow-up promotions with scarcity messaging",
      "Heat rebound on hydration and sunscreen SKUs",
      "Guardrail lift from pausing generic retargeting during storms",
    ],
    recommendedActions: [
      "Shift $45k to insulated apparel during hail warnings to stay within CPA guardrails.",
      "Pair emergency supply ads with NOAA alerts and cap lifetime frequency at 4.",
    ],
    highlight:
      "Weather-aware allocation recovered $156K incremental revenue during the last cold snap.",
    metrics: {
      withWeather: {
        revenue: 1_352_000,
        roas: 3.9,
        spend: 347_000,
      },
      withoutWeather: {
        revenue: 1_196_000,
        roas: 3.2,
        spend: 347_000,
      },
    },
  },
  {
    id: "harbor-lane",
    label: "Harbor Lane Outfitters",
    location: "Brooklyn, NY",
    sensitivity: "High",
    persona: "Rain and heat patterns steer outerwear and commuter gear demand.",
    validationBadge: {
      label: "Ready for limited rollout",
      tone: "success",
    },
    confidence: "High",
    weatherSignal: 0.24,
    roasLift: {
      low: 0.12,
      expected: 0.17,
      high: 0.24,
    },
    keyDrivers: [
      "Precipitation-triggered umbrellas and waterproof boots bundle",
      "Heat-index targeting for breathable workwear",
    ],
    recommendedActions: [
      "Enable autopilot on Paid Social once radial rain alerts fire (±6 hour window).",
      "Reserve $18k budget headroom for late-week heat surges.",
    ],
    highlight:
      "Phase-one rollout shows repeatable 17% ROAS lift with weather features active.",
    metrics: {
      withWeather: {
        revenue: 1_224_000,
        roas: 3.4,
        spend: 360_000,
      },
      withoutWeather: {
        revenue: 1_118_000,
        roas: 3.0,
        spend: 360_000,
      },
    },
  },
  {
    id: "stride-collective",
    label: "Stride Collective Athletics",
    location: "Chicago, IL",
    sensitivity: "Medium",
    persona: "Seasonal swings nudge footwear and light outerwear velocity.",
    validationBadge: {
      label: "Production ready",
      tone: "success",
    },
    confidence: "Medium",
    weatherSignal: 0.15,
    roasLift: {
      low: 0.05,
      expected: 0.09,
      high: 0.14,
    },
    keyDrivers: [
      "Temperature drops drive spikes in insulated joggers",
      "Wind chills suppress outdoor gear conversions without proactive offers",
    ],
    recommendedActions: [
      "Mirror Paid Search copy to align with weather-aware prospecting narratives.",
      "Tag new spring releases with historical weather affinity for faster model learning.",
    ],
    highlight:
      "Weather-aware bidding keeps Chicago spend efficient when windchill suppresses store visits.",
    metrics: {
      withWeather: {
        revenue: 1_086_000,
        roas: 3.1,
        spend: 348_000,
      },
      withoutWeather: {
        revenue: 1_042_000,
        roas: 2.9,
        spend: 348_000,
      },
    },
  },
  {
    id: "control-co",
    label: "Control Collective",
    location: "Los Angeles, CA",
    sensitivity: "Control",
    persona: "Office accessories with negligible weather correlation.",
    validationBadge: {
      label: "Control group",
      tone: "muted",
    },
    confidence: "High",
    weatherSignal: 0.03,
    roasLift: {
      low: -0.01,
      expected: 0,
      high: 0.01,
    },
    keyDrivers: [
      "Minimal elasticity across temperature or precipitation",
      "Serves as regression backstop for false positives",
    ],
    recommendedActions: [
      "Keep connectors live to validate guardrail drift across non-weather categories.",
      "Use as baseline cohort for MMM backtests each quarter.",
    ],
    highlight:
      "Model correctly holds spend flat—proving weather features stay quiet on insensitive inventory.",
    metrics: {
      withWeather: {
        revenue: 982_000,
        roas: 2.8,
        spend: 352_000,
      },
      withoutWeather: {
        revenue: 980_000,
        roas: 2.8,
        spend: 352_000,
      },
    },
  },
];
