import path from 'node:path';

import {
  buildMetricPlan,
  buildReport,
  computeMetricAverage,
  evaluateRegression,
  loadBaselines,
  loadConfig,
  loadMetricsFile,
  saveBaselines,
} from './perf_utils.js';
import type {
  MetricStats,
  PerformanceReport,
  RegressionEntry,
  UpdatedBaseline,
} from './perf_utils.js';

const UPDATE_FLAG = '--update-baseline';

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const shouldUpdateBaseline = process.argv.includes(UPDATE_FLAG);

  const config = await loadConfig(workspaceRoot);
  const metricsPlan = buildMetricPlan(workspaceRoot, config);
  const baselines = await loadBaselines(workspaceRoot);
  const metricEntries = await loadMetricsFile(workspaceRoot);

  const currentValues: Record<string, MetricStats> = {};
  const regressions: RegressionEntry[] = [];
  const updatedBaselines: UpdatedBaseline[] = [];

  for (const metric of metricsPlan) {
    const { key, sampleSize, tolerancePercent, absoluteTolerance } = metric;
    const stats = computeMetricAverage(metricEntries, key, sampleSize ?? 5);
    currentValues[key] = stats;

    if (stats.average == null) {
      console.log(`No samples found for metric ${key}; skipping.`);
      continue;
    }

    const baselineEntry = baselines[key];
    const result = evaluateRegression({
      baseline: baselineEntry?.baseline ?? null,
      current: stats.average,
      tolerancePercent: baselineEntry?.tolerancePercent ?? tolerancePercent,
      absoluteTolerance: baselineEntry?.absoluteTolerance ?? absoluteTolerance,
    });

    if (!baselineEntry || shouldUpdateBaseline) {
      baselines[key] = {
        baseline: stats.average,
        tolerancePercent: baselineEntry?.tolerancePercent ?? tolerancePercent,
        absoluteTolerance: baselineEntry?.absoluteTolerance ?? absoluteTolerance,
        updated_at: new Date().toISOString(),
      };
      updatedBaselines.push({ key, baseline: stats.average });
    }

    if (result.regressed) {
      regressions.push({
        key,
        label: metric.label,
        current: stats.average,
        baseline: baselines[key]?.baseline ?? null,
        deltaPercent: result.deltaPercent,
        deltaAbsolute: result.deltaAbsolute,
        tolerancePercent: baselines[key]?.tolerancePercent ?? tolerancePercent,
        absoluteTolerance: baselines[key]?.absoluteTolerance ?? absoluteTolerance,
      });
    }
  }

  if (updatedBaselines.length > 0) {
    await saveBaselines(workspaceRoot, baselines);
  }

  const report = buildReport({
    metrics: metricsPlan,
    currentValues,
    baselines,
    regressions,
    updatedBaselines,
  }) as PerformanceReport;
  await writeReport(workspaceRoot, report);

  if (regressions.length > 0) {
    console.error('Performance regression detected:');
    for (const regression of regressions) {
      console.error(
        `- ${regression.key} (baseline ${formatNumber(regression.baseline)} -> current ${formatNumber(
          regression.current,
        )}) delta=${formatPercent(regression.deltaPercent)} tolerance=${
          regression.tolerancePercent ?? 'default'
        }%`,
      );
    }
    process.exitCode = 1;
    return;
  }

  if (updatedBaselines.length > 0) {
    console.log('Baselines updated for metrics:', updatedBaselines.map((entry) => entry.key).join(', '));
  }

  console.log('Performance regression check passed.');
}

async function writeReport(workspaceRoot: string, report: PerformanceReport): Promise<void> {
  const reportPath = path.join(workspaceRoot, 'state', 'automation', 'perf_regression_report.json');
  const fs = await import('node:fs/promises');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
}

function formatNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return Number(value).toFixed(4);
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(2)}%`;
}

main().catch((error) => {
  console.error('Failed to check performance regressions', error);
  process.exitCode = 1;
});
