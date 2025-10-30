export interface MetricOverride {
  label?: string;
  sampleSize?: number;
  tolerancePercent?: number;
  absoluteTolerance?: number;
}

export interface MetricsConfig {
  metrics?: Record<string, MetricOverride>;
}

export interface BaselineEntry {
  baseline: number | null;
  tolerancePercent?: number;
  absoluteTolerance?: number;
  updated_at?: string;
}

export interface BaselineStore {
  [metricKey: string]: BaselineEntry | undefined;
}

export interface MetricPlanEntry {
  key: string;
  label: string;
  sampleSize?: number;
  tolerancePercent?: number;
  absoluteTolerance?: number;
}

export interface MetricStats {
  average: number | null;
  samples: number[];
}

export interface RegressionResult {
  regressed: boolean;
  deltaPercent: number | null;
  deltaAbsolute: number | null;
}

export interface RegressionInput {
  baseline: number | null;
  current: number | null;
  tolerancePercent?: number;
  absoluteTolerance?: number;
}

export interface PerformanceReport {
  generated_at: string;
  metrics: Array<{
    key: string;
    label: string;
    sampleSize?: number;
    tolerancePercent?: number;
    absoluteTolerance?: number;
    currentAverage: number | null;
    samples: number[];
    baseline: number | null;
  }>;
  regressions: RegressionEntry[];
  updatedBaselines: UpdatedBaseline[];
}

export interface RegressionEntry {
  key: string;
  label: string;
  current: number | null;
  baseline: number | null;
  deltaPercent: number | null;
  deltaAbsolute: number | null;
  tolerancePercent?: number;
  absoluteTolerance?: number;
}

export interface UpdatedBaseline {
  key: string;
  baseline: number | null;
}

export declare function loadConfig(workspaceRoot: string): Promise<MetricsConfig>;
export declare function loadBaselines(workspaceRoot: string): Promise<BaselineStore>;
export declare function saveBaselines(workspaceRoot: string, baselines: BaselineStore): Promise<void>;
export declare function loadMetricsFile(workspaceRoot: string): Promise<Array<Record<string, unknown>>>;
export declare function computeMetricAverage(
  entries: Array<Record<string, unknown>>,
  key: string,
  sampleSize?: number
): MetricStats;
export declare function evaluateRegression(input: RegressionInput): RegressionResult;
export declare function buildMetricPlan(workspaceRoot: string, config: MetricsConfig): MetricPlanEntry[];
export declare function buildReport(input: {
  metrics: MetricPlanEntry[];
  currentValues: Record<string, MetricStats>;
  baselines: BaselineStore;
  regressions: RegressionEntry[];
  updatedBaselines: UpdatedBaseline[];
}): PerformanceReport;
