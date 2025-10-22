import type { PlanResponse, PlanSlice, ExperimentPayload, ExperimentLift } from "../types/plan";

const CSV_HEADERS = [
  "plan_date",
  "geo_group_id",
  "category",
  "channel",
  "cell",
  "confidence",
  "recommended_spend",
  "expected_revenue_p10",
  "expected_revenue_p50",
  "expected_revenue_p90",
  "expected_roas_p10",
  "expected_roas_p50",
  "expected_roas_p90",
  "primary_driver",
  "supporting_factors",
  "assumptions",
  "risks",
];

const EXPERIMENT_HEADERS = [
  "experiment_id",
  "status",
  "metric_name",
  "treatment_geos",
  "control_geos",
  "treatment_spend",
  "control_spend",
  "lift_pct",
  "absolute_lift",
  "confidence_low",
  "confidence_high",
  "p_value",
  "is_significant",
  "sample_size",
  "generated_at",
];

const toScalar = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return value.toString();
};

const normaliseArray = (values: string[] | undefined): string =>
  (values ?? []).map((entry) => entry.replace(/\s+/g, " ").trim()).filter(Boolean).join("; ");

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

const sliceToRow = (slice: PlanSlice): string[] => {
  const roas = slice.expected_roas;
  const rationale = slice.rationale ?? {
    primary_driver: "",
    supporting_factors: [],
    assumptions: [],
    risks: [],
  };

  return [
    slice.plan_date,
    slice.geo_group_id,
    slice.category,
    slice.channel,
    slice.cell ?? "",
    slice.confidence,
    toScalar(slice.recommended_spend),
    toScalar(slice.expected_revenue.p10),
    toScalar(slice.expected_revenue.p50),
    toScalar(slice.expected_revenue.p90),
    toScalar(roas?.p10),
    toScalar(roas?.p50),
    toScalar(roas?.p90),
    rationale.primary_driver ?? "",
    normaliseArray(rationale.supporting_factors),
    normaliseArray(rationale.assumptions),
    normaliseArray(rationale.risks),
  ];
};

export const buildPlanCsv = (plan: PlanResponse): string => {
  const header = CSV_HEADERS.join(",");
  const rows = plan.slices.map((slice) => sliceToRow(slice).map(escapeCsvField).join(","));
  return [header, ...rows].join("\n");
};

export const buildPlanExportFilename = (tenantId: string, generatedAt: string): string => {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-") || "tenant";
  const timestamp = (() => {
    const date = new Date(generatedAt);
    if (Number.isNaN(date.getTime())) {
      return "unknown";
    }
    const iso = date.toISOString().replace(/\.\d{3}Z$/, "Z");
    return iso.replace(/:/g, "-");
  })();
  return `weathervane-plan-${safeTenant}-${timestamp}.csv`;
};

const experimentToRow = (experiment: ExperimentPayload): string[] => {
  const lift = experiment.lift;
  return [
    experiment.experiment_id,
    experiment.status,
    experiment.metric_name,
    experiment.treatment_geos.join("; "),
    experiment.control_geos.join("; "),
    toScalar(experiment.treatment_spend),
    toScalar(experiment.control_spend),
    lift ? toScalar(lift.lift_pct * 100) : "",
    lift ? toScalar(lift.absolute_lift) : "",
    lift ? toScalar(lift.confidence_low * 100) : "",
    lift ? toScalar(lift.confidence_high * 100) : "",
    lift ? toScalar(lift.p_value) : "",
    lift ? (lift.is_significant ? "true" : "false") : "",
    lift ? lift.sample_size.toString() : "",
    lift?.generated_at ?? "",
  ];
};

export const buildExperimentCsv = (experiments: ExperimentPayload[]): string => {
  const header = EXPERIMENT_HEADERS.join(",");
  const rows = experiments.map((exp) =>
    experimentToRow(exp).map(escapeCsvField).join(",")
  );
  return [header, ...rows].join("\n");
};

export const buildPlanWithExperimentsCsv = (plan: PlanResponse): string => {
  const planCsv = buildPlanCsv(plan);
  const experiments = plan.experiments ?? [];

  if (experiments.length === 0) {
    return planCsv;
  }

  const experimentCsv = buildExperimentCsv(experiments);
  return `${planCsv}\n\n[EXPERIMENTS]\n${experimentCsv}`;
};

export const buildExperimentsExportFilename = (
  tenantId: string,
  generatedAt: string
): string => {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-") || "tenant";
  const timestamp = (() => {
    const date = new Date(generatedAt);
    if (Number.isNaN(date.getTime())) {
      return "unknown";
    }
    const iso = date.toISOString().replace(/\.\d{3}Z$/, "Z");
    return iso.replace(/:/g, "-");
  })();
  return `weathervane-experiments-${safeTenant}-${timestamp}.csv`;
};
