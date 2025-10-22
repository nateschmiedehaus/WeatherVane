import type { ScenarioBaseline, ScenarioOutcome, ScenarioChannelOutcome } from "./scenario-builder";
import type { ScenarioRecommendation } from "../types/scenario";

// CSV Headers for scenario data export
const SCENARIO_SUMMARY_HEADERS = [
  "export_type",
  "generated_at",
  "horizon_days",
  "total_base_spend",
  "total_scenario_spend",
  "delta_spend",
  "total_base_revenue",
  "total_scenario_revenue",
  "delta_revenue",
  "base_roi",
  "scenario_roi",
  "weighted_confidence",
];

const SCENARIO_CHANNEL_HEADERS = [
  "channel",
  "confidence",
  "base_spend",
  "base_revenue",
  "base_roi",
  "scenario_spend",
  "scenario_revenue",
  "scenario_roi",
  "delta_spend",
  "delta_revenue",
  "adjustment_multiplier",
];

const RECOMMENDATION_HEADERS = [
  "recommendation_id",
  "label",
  "description",
  "tags",
  "channel",
  "multiplier",
  "rationale",
  "confidence",
];

// PowerPoint slide data structure for programmatic generation
export interface PowerPointSlideData {
  slideType: "title" | "summary" | "channel_detail" | "recommendation" | "chart";
  title: string;
  subtitle?: string;
  content: PowerPointContentBlock[];
}

export interface PowerPointContentBlock {
  type: "text" | "table" | "metric" | "chart_reference";
  data: string | PowerPointTableData | PowerPointMetric | PowerPointChartRef;
}

export interface PowerPointTableData {
  headers: string[];
  rows: string[][];
}

export interface PowerPointMetric {
  label: string;
  value: string;
  delta?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface PowerPointChartRef {
  chartType: "bar" | "line" | "waterfall";
  title: string;
  dataPoints: { label: string; value: number }[];
}

const toScalar = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return value.toString();
};

const escapeCsvField = (value: string): string => {
  if (value === "") {
    return "";
  }
  if (/[",\n]/.test(value)) {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return value;
};

const formatCurrency = (amount: number | null | undefined): string => {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "$0";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercent = (multiplier: number): string => {
  if (!Number.isFinite(multiplier)) {
    return "0%";
  }
  const deltaPct = (multiplier - 1) * 100;
  const rounded = Math.round(deltaPct);
  if (rounded === 0) {
    return "0%";
  }
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
};

const formatRoi = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "0.0x";
  }
  return `${value.toFixed(2)}x`;
};

/**
 * Build CSV export for scenario summary data
 */
export const buildScenarioSummaryCsv = (
  outcome: ScenarioOutcome,
  tenantId: string,
  horizonDays: number
): string => {
  const summary = outcome.summary;
  const header = SCENARIO_SUMMARY_HEADERS.join(",");

  const row = [
    "scenario_summary",
    new Date().toISOString(),
    horizonDays.toString(),
    toScalar(summary.totalBaseSpend),
    toScalar(summary.totalScenarioSpend),
    toScalar(summary.deltaSpend),
    toScalar(summary.totalBaseRevenue),
    toScalar(summary.totalScenarioRevenue),
    toScalar(summary.deltaRevenue),
    toScalar(summary.baseRoi),
    toScalar(summary.scenarioRoi),
    summary.weightedConfidence,
  ];

  return [header, row.map(escapeCsvField).join(",")].join("\n");
};

/**
 * Build CSV export for scenario channel details
 */
export const buildScenarioChannelsCsv = (
  outcome: ScenarioOutcome,
  adjustments: { [channel: string]: number }
): string => {
  const header = SCENARIO_CHANNEL_HEADERS.join(",");

  const rows = outcome.channels.map((channel: ScenarioChannelOutcome) => {
    const multiplier = adjustments[channel.channel] ?? 1;
    return [
      channel.channel,
      channel.confidence,
      toScalar(channel.baseSpend),
      toScalar(channel.baseRevenue),
      toScalar(channel.baseRoi),
      toScalar(channel.scenarioSpend),
      toScalar(channel.scenarioRevenue),
      toScalar(channel.scenarioRoi),
      toScalar(channel.deltaSpend),
      toScalar(channel.deltaRevenue),
      toScalar(multiplier),
    ];
  });

  return [header, ...rows.map((row) => row.map(escapeCsvField).join(","))].join("\n");
};

/**
 * Build CSV export for scenario recommendations
 */
export const buildRecommendationsCsv = (
  recommendations: ScenarioRecommendation[]
): string => {
  const header = RECOMMENDATION_HEADERS.join(",");

  const rows: string[][] = [];

  recommendations.forEach((rec) => {
    rec.adjustments.forEach((adj) => {
      rows.push([
        rec.id,
        rec.label,
        rec.description,
        rec.tags.join("; "),
        adj.channel,
        toScalar(adj.multiplier),
        adj.rationale,
        adj.confidence,
      ]);
    });
  });

  return [header, ...rows.map((row) => row.map(escapeCsvField).join(","))].join("\n");
};

/**
 * Build complete scenario export CSV with all sections
 */
export const buildCompleteScenarioCsv = (
  outcome: ScenarioOutcome,
  recommendations: ScenarioRecommendation[],
  adjustments: { [channel: string]: number },
  tenantId: string,
  horizonDays: number
): string => {
  const sections: string[] = [];

  // Summary section
  sections.push("[SCENARIO SUMMARY]");
  sections.push(buildScenarioSummaryCsv(outcome, tenantId, horizonDays));
  sections.push("");

  // Channel details section
  sections.push("[CHANNEL DETAILS]");
  sections.push(buildScenarioChannelsCsv(outcome, adjustments));
  sections.push("");

  // Recommendations section
  if (recommendations.length > 0) {
    sections.push("[RECOMMENDATIONS]");
    sections.push(buildRecommendationsCsv(recommendations));
  }

  return sections.join("\n");
};

/**
 * Generate filename for scenario export
 */
export const buildScenarioExportFilename = (
  tenantId: string,
  exportType: "csv" | "pptx"
): string => {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-") || "tenant";
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
  const extension = exportType === "csv" ? "csv" : "pptx.json";
  return `weathervane-scenario-${safeTenant}-${timestamp}.${extension}`;
};

/**
 * Build PowerPoint data structure for scenario export
 * This generates a JSON structure that can be used by external PowerPoint generation services
 */
export const buildPowerPointData = (
  outcome: ScenarioOutcome,
  recommendations: ScenarioRecommendation[],
  adjustments: { [channel: string]: number },
  tenantId: string,
  horizonDays: number
): PowerPointSlideData[] => {
  const slides: PowerPointSlideData[] = [];

  // Title slide
  slides.push({
    slideType: "title",
    title: "WeatherVane Scenario Analysis",
    subtitle: `${tenantId} • ${horizonDays}-day horizon • ${new Date().toLocaleDateString()}`,
    content: [],
  });

  // Summary slide
  const summary = outcome.summary;
  slides.push({
    slideType: "summary",
    title: "Scenario Impact Summary",
    content: [
      {
        type: "metric",
        data: {
          label: "Base Spend",
          value: formatCurrency(summary.totalBaseSpend),
          sentiment: "neutral",
        },
      },
      {
        type: "metric",
        data: {
          label: "Scenario Spend",
          value: formatCurrency(summary.totalScenarioSpend),
          delta: formatCurrency(summary.deltaSpend),
          sentiment: summary.deltaSpend >= 0 ? "positive" : "negative",
        },
      },
      {
        type: "metric",
        data: {
          label: "Base Revenue (p50)",
          value: formatCurrency(summary.totalBaseRevenue),
          sentiment: "neutral",
        },
      },
      {
        type: "metric",
        data: {
          label: "Scenario Revenue (p50)",
          value: formatCurrency(summary.totalScenarioRevenue),
          delta: formatCurrency(summary.deltaRevenue),
          sentiment: summary.deltaRevenue >= 0 ? "positive" : "negative",
        },
      },
      {
        type: "metric",
        data: {
          label: "Scenario ROI",
          value: formatRoi(summary.scenarioRoi),
          sentiment: "positive",
        },
      },
      {
        type: "metric",
        data: {
          label: "Confidence Level",
          value: summary.weightedConfidence,
          sentiment: "neutral",
        },
      },
    ],
  });

  // Channel details slide
  slides.push({
    slideType: "channel_detail",
    title: "Channel-by-Channel Impact",
    content: [
      {
        type: "table",
        data: {
          headers: ["Channel", "Adjustment", "Δ Spend", "Δ Revenue", "Scenario ROI"],
          rows: outcome.channels.map((channel) => [
            channel.channel,
            formatPercent(adjustments[channel.channel] ?? 1),
            formatCurrency(channel.deltaSpend),
            formatCurrency(channel.deltaRevenue),
            formatRoi(channel.scenarioRoi),
          ]),
        },
      },
    ],
  });

  // Chart slide - Spend delta waterfall
  slides.push({
    slideType: "chart",
    title: "Spend Allocation Changes",
    content: [
      {
        type: "chart_reference",
        data: {
          chartType: "waterfall",
          title: "Channel Spend Deltas",
          dataPoints: outcome.channels.map((channel) => ({
            label: channel.channel,
            value: channel.deltaSpend,
          })),
        },
      },
    ],
  });

  // Recommendations slides
  recommendations.forEach((rec) => {
    slides.push({
      slideType: "recommendation",
      title: rec.label,
      subtitle: rec.description,
      content: [
        {
          type: "text",
          data: `Tags: ${rec.tags.join(", ")}`,
        },
        {
          type: "table",
          data: {
            headers: ["Channel", "Adjustment", "Rationale"],
            rows: rec.adjustments.map((adj) => [
              adj.channel,
              formatPercent(adj.multiplier),
              adj.rationale,
            ]),
          },
        },
      ],
    });
  });

  return slides;
};

/**
 * Export PowerPoint data as JSON (for integration with external PPT generation services)
 */
export const exportPowerPointJson = (slides: PowerPointSlideData[]): string => {
  return JSON.stringify(
    {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      slides,
    },
    null,
    2
  );
};
