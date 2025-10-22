import type { ConfidenceLevel, PlanSlice } from "../types/plan";

export interface HeroMetricSummary {
  roiMultiple: number | null;
  roiDeltaPct: number | null;
  liftAmount: number | null;
  guardrailConfidencePct: number | null;
  topDriver: string | null;
}

export type OpportunityKind = "primary" | "followUp" | "risk";

export interface OpportunityDescriptor {
  kind: OpportunityKind;
  slice: PlanSlice;
  reason: string;
  analyticsId: string;
}

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["HIGH", "MEDIUM", "LOW"];

export interface ConfidenceMixSegment {
  level: ConfidenceLevel;
  count: number;
  percentage: number;
}

export interface ConfidenceMixSummary {
  total: number;
  counts: Record<ConfidenceLevel, number>;
  segments: ConfidenceMixSegment[];
}

const sliceKey = (slice: PlanSlice): string =>
  `${slice.plan_date}::${slice.geo_group_id}::${slice.channel}`;

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
};

const clampPercentage = (value: number | null): number | null => {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
};

export const driverFromSlice = (slice: PlanSlice): string => {
  if (slice.rationale?.primary_driver) {
    return slice.rationale.primary_driver;
  }
  const supporting = slice.rationale?.supporting_factors ?? [];
  return supporting[0] ?? "Weather-driven opportunity";
};

const selectRiskNarrative = (slice: PlanSlice): string => {
  const risks = slice.rationale?.risks ?? [];
  const assumptions = slice.rationale?.assumptions ?? [];
  const fallback =
    slice.assumptions[0] ??
    risks[0] ??
    assumptions[0] ??
    "Guardrail anomaly flagged for operator review.";
  return fallback;
};

export const computeHeroMetricSummary = (slices: PlanSlice[]): HeroMetricSummary => {
  if (!slices.length) {
    return {
      roiMultiple: null,
      roiDeltaPct: null,
      liftAmount: null,
      guardrailConfidencePct: null,
      topDriver: null,
    };
  }

  const spendTotal = slices.reduce((acc, slice) => acc + slice.recommended_spend, 0);
  const revenueTotal = slices.reduce((acc, slice) => acc + slice.expected_revenue.p50, 0);

  const roiMultiple = safeDivide(revenueTotal, spendTotal);
  const roiDeltaPct = safeDivide(revenueTotal - spendTotal, spendTotal);
  const liftAmount =
    Number.isFinite(revenueTotal) && Number.isFinite(spendTotal)
      ? revenueTotal - spendTotal
      : null;

  const counts = slices.reduce<Record<ConfidenceLevel, number>>(
    (acc, slice) => {
      acc[slice.confidence] += 1;
      return acc;
    },
    { HIGH: 0, MEDIUM: 0, LOW: 0 },
  );
  const totalSlices = counts.HIGH + counts.MEDIUM + counts.LOW;
  const guardrailRatio = safeDivide(counts.HIGH + counts.MEDIUM * 0.5, totalSlices);
  const guardrailConfidencePct =
    guardrailRatio === null ? null : clampPercentage(guardrailRatio * 100);

  const topDriver =
    [...slices]
      .sort((a, b) => b.expected_revenue.p50 - a.expected_revenue.p50)
      .map((slice) => driverFromSlice(slice))[0] ?? null;

  return {
    roiMultiple,
    roiDeltaPct: roiDeltaPct === null ? null : roiDeltaPct * 100,
    liftAmount,
    guardrailConfidencePct,
    topDriver,
  };
};

const roundPercentage = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value * 10) / 10)) : 0;

export const computeConfidenceMixSummary = (slices: PlanSlice[]): ConfidenceMixSummary => {
  const counts: Record<ConfidenceLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };

  slices.forEach((slice) => {
    counts[slice.confidence] += 1;
  });

  const total = counts.HIGH + counts.MEDIUM + counts.LOW;
  const segments: ConfidenceMixSegment[] = CONFIDENCE_ORDER.map((level) => {
    const count = counts[level];
    const percentage = total === 0 ? 0 : roundPercentage((count / total) * 100);
    return { level, count, percentage };
  });

  return { total, counts, segments };
};

export const deriveOpportunityQueue = (slices: PlanSlice[]): OpportunityDescriptor[] => {
  if (!slices.length) {
    return [];
  }

  const sorted = [...slices].sort(
    (a, b) => b.expected_revenue.p50 - a.expected_revenue.p50,
  );

  const primary = sorted[0] ?? null;
  const followUp =
    sorted.find((slice) => slice !== primary && slice.confidence !== "LOW") ??
    sorted[1] ??
    null;
  const riskCandidate =
    sorted.find((slice) => slice.confidence === "LOW") ?? sorted[sorted.length - 1] ?? null;

  const queue: OpportunityDescriptor[] = [];

  if (primary) {
    queue.push({
      kind: "primary",
      slice: primary,
      reason: driverFromSlice(primary),
      analyticsId: "plan.card.approve",
    });
  }

  if (followUp && !queue.some((item) => sliceKey(item.slice) === sliceKey(followUp))) {
    queue.push({
      kind: "followUp",
      slice: followUp,
      reason: driverFromSlice(followUp),
      analyticsId: "plan.card.follow_up",
    });
  }

  if (riskCandidate && !queue.some((item) => sliceKey(item.slice) === sliceKey(riskCandidate))) {
    queue.push({
      kind: "risk",
      slice: riskCandidate,
      reason: selectRiskNarrative(riskCandidate),
      analyticsId: "plan.card.risk",
    });
  }

  return queue;
};
