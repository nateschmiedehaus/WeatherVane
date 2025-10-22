import type { ConfidenceLevel, PlanResponse, PlanSlice } from "../types/plan";
import type {
  ScenarioRecommendation,
  ScenarioRecommendationAdjustment,
} from "../types/scenario";

export interface ScenarioChannelBaseline {
  channel: string;
  spend: number;
  revenue: number;
  confidence: ConfidenceLevel;
  baseRoi: number | null;
}

export interface ScenarioBaseline {
  channels: ScenarioChannelBaseline[];
  totalSpend: number;
  totalRevenue: number;
  horizonDays: number;
}

export interface ScenarioAdjustmentMap {
  [channel: string]: number;
}

export interface ScenarioChannelOutcome {
  channel: string;
  confidence: ConfidenceLevel;
  baseSpend: number;
  baseRevenue: number;
  scenarioSpend: number;
  scenarioRevenue: number;
  deltaSpend: number;
  deltaRevenue: number;
  baseRoi: number | null;
  scenarioRoi: number | null;
}

export interface ScenarioOutcomeSummary {
  totalBaseSpend: number;
  totalScenarioSpend: number;
  totalBaseRevenue: number;
  totalScenarioRevenue: number;
  deltaSpend: number;
  deltaRevenue: number;
  baseRoi: number | null;
  scenarioRoi: number | null;
  weightedConfidence: ConfidenceLevel;
}

export interface ScenarioOutcome {
  summary: ScenarioOutcomeSummary;
  channels: ScenarioChannelOutcome[];
}

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["LOW", "MEDIUM", "HIGH"];
const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
const CONFIDENCE_SCORE: Record<ConfidenceLevel, number> = {
  HIGH: 1,
  MEDIUM: 0.6,
  LOW: 0.3,
};
const CONFIDENCE_RISK_ADJUSTMENT: Record<ConfidenceLevel, number> = {
  HIGH: 0.05,
  MEDIUM: 0.15,
  LOW: 0.3,
};

const DEFAULT_CONFIDENCE: ConfidenceLevel = "MEDIUM";

function normaliseConfidence(value: ConfidenceLevel | null | undefined): ConfidenceLevel {
  if (!value) {
    return DEFAULT_CONFIDENCE;
  }
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") {
    return value;
  }
  return DEFAULT_CONFIDENCE;
}

function sumSlices<T extends PlanSlice>(
  slices: T[],
  selector: (slice: T) => number | null | undefined,
): number {
  return slices.reduce((total, slice) => {
    const value = selector(slice);
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
    return total + numeric;
  }, 0);
}

function computeChannelConfidence(slices: PlanSlice[]): ConfidenceLevel {
  if (slices.length === 0) {
    return DEFAULT_CONFIDENCE;
  }
  const scores = slices.map((slice) => CONFIDENCE_WEIGHT[normaliseConfidence(slice.confidence)]);
  const worstScore = Math.min(...scores);
  return CONFIDENCE_ORDER.find((level) => CONFIDENCE_WEIGHT[level] === worstScore) ?? DEFAULT_CONFIDENCE;
}

function computeRoi(spend: number, revenue: number): number | null {
  if (!Number.isFinite(spend) || spend <= 0) {
    return null;
  }
  if (!Number.isFinite(revenue)) {
    return null;
  }
  return revenue / spend;
}

export function buildScenarioBaseline(plan: PlanResponse): ScenarioBaseline {
  const channelGroups = new Map<string, PlanSlice[]>();

  for (const slice of plan.slices) {
    const channel = slice.channel?.trim() || "Unassigned channel";
    const existing = channelGroups.get(channel);
    if (existing) {
      existing.push(slice);
    } else {
      channelGroups.set(channel, [slice]);
    }
  }

  const channels: ScenarioChannelBaseline[] = Array.from(channelGroups.entries()).map(([channel, slices]) => {
    const spend = sumSlices(slices, (slice) => slice.recommended_spend);
    const revenue = sumSlices(slices, (slice) => slice.expected_revenue?.p50 ?? null);
    const confidence = computeChannelConfidence(slices);
    return {
      channel,
      spend,
      revenue,
      confidence,
      baseRoi: computeRoi(spend, revenue),
    };
  });

  channels.sort((a, b) => b.spend - a.spend);

  const totalSpend = channels.reduce((total, channel) => total + channel.spend, 0);
  const totalRevenue = channels.reduce((total, channel) => total + channel.revenue, 0);

  return {
    channels,
    totalSpend,
    totalRevenue,
    horizonDays: plan.horizon_days,
  };
}

function clampMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, value);
}

function deriveWeightedConfidence(
  channels: ScenarioChannelOutcome[],
  totalScenarioSpend: number,
): ConfidenceLevel {
  if (!Number.isFinite(totalScenarioSpend) || totalScenarioSpend <= 0) {
    return DEFAULT_CONFIDENCE;
  }

  const weightedScore = channels.reduce((total, channel) => {
    const weight = channel.scenarioSpend / totalScenarioSpend;
    return total + weight * CONFIDENCE_WEIGHT[channel.confidence];
  }, 0);

  if (weightedScore >= 2.5) {
    return "HIGH";
  }
  if (weightedScore >= 1.75) {
    return "MEDIUM";
  }
  return "LOW";
}

export function applyScenarioAdjustments(
  baseline: ScenarioBaseline,
  adjustments: ScenarioAdjustmentMap,
): ScenarioOutcome {
  const channels: ScenarioChannelOutcome[] = baseline.channels.map((channel) => {
    const multiplier = clampMultiplier(adjustments[channel.channel] ?? 1);
    const delta = multiplier - 1;
    const risk = CONFIDENCE_RISK_ADJUSTMENT[channel.confidence] ?? CONFIDENCE_RISK_ADJUSTMENT.MEDIUM;

    let revenueMultiplier: number;
    if (delta >= 0) {
      revenueMultiplier = 1 + delta * (1 - risk);
    } else {
      revenueMultiplier = 1 + delta * (1 + risk);
    }
    if (!Number.isFinite(revenueMultiplier) || revenueMultiplier < 0) {
      revenueMultiplier = 0;
    }

    const scenarioSpend = channel.spend * multiplier;
    const scenarioRevenue = channel.revenue * revenueMultiplier;
    const baseSpend = channel.spend;
    const baseRevenue = channel.revenue;

    return {
      channel: channel.channel,
      confidence: channel.confidence,
      baseSpend,
      baseRevenue,
      scenarioSpend,
      scenarioRevenue,
      deltaSpend: scenarioSpend - baseSpend,
      deltaRevenue: scenarioRevenue - baseRevenue,
      baseRoi: channel.baseRoi,
      scenarioRoi: computeRoi(scenarioSpend, scenarioRevenue),
    };
  });

  const totalBaseSpend = baseline.totalSpend;
  const totalBaseRevenue = baseline.totalRevenue;
  const totalScenarioSpend = channels.reduce((total, channel) => total + channel.scenarioSpend, 0);
  const totalScenarioRevenue = channels.reduce((total, channel) => total + channel.scenarioRevenue, 0);

  const summary: ScenarioOutcomeSummary = {
    totalBaseSpend,
    totalScenarioSpend,
    totalBaseRevenue,
    totalScenarioRevenue,
    deltaSpend: totalScenarioSpend - totalBaseSpend,
    deltaRevenue: totalScenarioRevenue - totalBaseRevenue,
    baseRoi: computeRoi(totalBaseSpend, totalBaseRevenue),
    scenarioRoi: computeRoi(totalScenarioSpend, totalScenarioRevenue),
    weightedConfidence: deriveWeightedConfidence(channels, totalScenarioSpend),
  };

  return {
    summary,
    channels,
  };
}

function describeConfidence(level: ConfidenceLevel): string {
  switch (level) {
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "moderate";
    default:
      return "low";
  }
}

function deriveChannelRoi(channel: ScenarioChannelBaseline): number {
  if (channel.baseRoi && Number.isFinite(channel.baseRoi)) {
    return channel.baseRoi;
  }
  if (channel.spend <= 0) {
    return 0;
  }
  return channel.revenue / channel.spend;
}

function buildAdjustmentsFromChannels(
  channels: ScenarioChannelBaseline[],
  options: { increase: boolean; bump: number },
): ScenarioRecommendationAdjustment[] {
  const { increase, bump } = options;
  if (!Number.isFinite(bump) || bump <= 0) {
    return [];
  }
  return channels.map((channel) => {
    const roi = deriveChannelRoi(channel);
    const multiplier = increase ? 1 + bump : 1 - bump;
    const direction = increase ? "Increase" : "Reduce";
    const formattedRoi = Number.isFinite(roi) && roi > 0 ? `${roi.toFixed(1)}x ROI` : "ROI signal building";
    return {
      channel: channel.channel,
      multiplier,
      confidence: channel.confidence,
      rationale: `${direction} by ${Math.round(bump * 100)}% (${formattedRoi}, ${describeConfidence(channel.confidence)} confidence).`,
    };
  });
}

export function deriveScenarioRecommendations(baseline: ScenarioBaseline): ScenarioRecommendation[] {
  if (!baseline.channels.length) {
    return [];
  }

  const roiValues = baseline.channels
    .map((channel) => deriveChannelRoi(channel))
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageRoi =
    roiValues.length > 0
      ? roiValues.reduce((total, value) => total + value, 0) / roiValues.length
      : 0;

  const confidenceValues = baseline.channels.map((channel) => CONFIDENCE_SCORE[channel.confidence]);
  const averageConfidence =
    confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length;

  const growthCandidates = baseline.channels.filter((channel) => {
    const roi = deriveChannelRoi(channel);
    const confidenceScore = CONFIDENCE_SCORE[channel.confidence];
    return roi >= averageRoi && confidenceScore >= Math.max(averageConfidence, 0.55);
  });

  const sortedByRoi = [...baseline.channels].sort(
    (a, b) => deriveChannelRoi(b) - deriveChannelRoi(a),
  );

  if (growthCandidates.length === 0 && sortedByRoi.length > 0) {
    growthCandidates.push(sortedByRoi[0]);
  }

  const trimCandidates = baseline.channels.filter((channel) => {
    const roi = deriveChannelRoi(channel);
    const confidenceScore = CONFIDENCE_SCORE[channel.confidence];
    return confidenceScore <= Math.max(averageConfidence - 0.05, 0.45) || roi <= averageRoi * 0.85;
  });

  if (trimCandidates.length === 0 && sortedByRoi.length > 0) {
    trimCandidates.push(sortedByRoi[sortedByRoi.length - 1]);
  }

  let rebalancePair: ScenarioChannelBaseline[] = [];
  if (sortedByRoi.length >= 2) {
    const top = sortedByRoi[0];
    const bottom = sortedByRoi[sortedByRoi.length - 1];
    if (top.channel !== bottom.channel) {
      rebalancePair = [top, bottom];
    }
  }

  const recommendations: ScenarioRecommendation[] = [
    {
      id: "accelerate_high_confidence",
      label: "Accelerate high-confidence reach",
      description: "Increase exposure on channels with resilient ROI and strong weather confidence.",
      adjustments: buildAdjustmentsFromChannels(growthCandidates, { increase: true, bump: 0.15 }),
      tags: ["growth", "high-confidence"],
    },
    {
      id: "stabilise_low_signal",
      label: "Stabilise low-signal spend",
      description: "Dial back budget from channels showing weak ROI or low confidence until telemetry firms up.",
      adjustments: buildAdjustmentsFromChannels(trimCandidates, { increase: false, bump: 0.1 }),
      tags: ["risk", "confidence"],
    },
  ];

  if (rebalancePair.length === 2) {
    const [increaseChannel, decreaseChannel] = rebalancePair;
    recommendations.push({
      id: "rebalance_mix",
      label: "Rebalance mix for weather swings",
      description: "Shift budget toward resilient performers while easing pressure on softer channels.",
      adjustments: [
        ...buildAdjustmentsFromChannels([increaseChannel], { increase: true, bump: 0.12 }),
        ...buildAdjustmentsFromChannels([decreaseChannel], { increase: false, bump: 0.08 }),
      ],
      tags: ["balanced", "mix-shift"],
    });
  }

  return recommendations;
}
