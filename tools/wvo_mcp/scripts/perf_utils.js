import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_METRICS = [
  { key: 'efficiency.durationMs', label: 'Average Duration (ms)', sampleSize: 5, tolerancePercent: 10 },
  { key: 'efficiency.costUsd', label: 'Average Token Cost (USD)', sampleSize: 5, tolerancePercent: 10 },
];

export async function loadConfig(workspaceRoot) {
  const configPath = path.join(workspaceRoot, 'state', 'config', 'perf_thresholds.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { metrics: {} };
    }
    throw error;
  }
}

export async function loadBaselines(workspaceRoot) {
  const baselinePath = path.join(workspaceRoot, 'state', 'automation', 'perf_baselines.json');
  try {
    const raw = await fs.readFile(baselinePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.metrics ?? {};
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export async function saveBaselines(workspaceRoot, baselines) {
  const baselinePath = path.join(workspaceRoot, 'state', 'automation', 'perf_baselines.json');
  const payload = {
    metrics: baselines,
    updated_at: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  await fs.writeFile(baselinePath, JSON.stringify(payload, null, 2));
}

export async function loadMetricsFile(workspaceRoot) {
  const metricsPath = path.join(workspaceRoot, 'state', 'telemetry', 'metrics.jsonl');
  try {
    const raw = await fs.readFile(metricsPath, 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function resolveMetricValue(entry, key) {
  if (!entry) return undefined;
  if (key.includes('.')) {
    const parts = key.split('.');
    let cursor = entry;
    for (const part of parts) {
      if (cursor && Object.prototype.hasOwnProperty.call(cursor, part)) {
        cursor = cursor[part];
      } else {
        cursor = undefined;
        break;
      }
    }
    if (typeof cursor === 'number') {
      return cursor;
    }
  }
  if (entry.metric === key && typeof entry.value === 'number') {
    return entry.value;
  }
  return undefined;
}

export function computeMetricAverage(entries, key, sampleSize = 5) {
  const values = [];
  for (let i = entries.length - 1; i >= 0 && values.length < sampleSize; i -= 1) {
    const value = resolveMetricValue(entries[i], key);
    if (typeof value === 'number' && Number.isFinite(value)) {
      values.push(value);
    }
  }
  if (values.length === 0) {
    return { average: null, samples: [] };
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  return { average: sum / values.length, samples: values };
}

export function evaluateRegression({ baseline, current, tolerancePercent, absoluteTolerance }) {
  if (baseline == null || current == null) {
    return { regressed: false, deltaPercent: null, deltaAbsolute: null };
  }
  const deltaAbsolute = current - baseline;
  const deltaPercent = baseline === 0 ? (deltaAbsolute === 0 ? 0 : Infinity) : (deltaAbsolute / baseline) * 100;
  const percentThreshold = tolerancePercent ?? 10;
  const absoluteThreshold = absoluteTolerance ?? 0;
  const exceedsPercent = deltaPercent > percentThreshold;
  const exceedsAbsolute = deltaAbsolute > absoluteThreshold;
  return {
    regressed: exceedsPercent || exceedsAbsolute,
    deltaPercent,
    deltaAbsolute,
  };
}

export function buildMetricPlan(workspaceRoot, config) {
  const overrides = config.metrics ?? {};
  const metricMap = new Map();

  for (const item of DEFAULT_METRICS) {
    metricMap.set(item.key, { ...item });
  }

  for (const [metricKey, options] of Object.entries(overrides)) {
    const existing = metricMap.get(metricKey) ?? { key: metricKey, label: metricKey, sampleSize: 5, tolerancePercent: 10 };
    metricMap.set(metricKey, {
      ...existing,
      ...options,
    });
  }

  return Array.from(metricMap.values());
}

export function buildReport({
  metrics,
  currentValues,
  baselines,
  regressions,
  updatedBaselines,
}) {
  return {
    generated_at: new Date().toISOString(),
    metrics: metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      sampleSize: metric.sampleSize,
      tolerancePercent: metric.tolerancePercent,
      absoluteTolerance: metric.absoluteTolerance,
      currentAverage: currentValues[metric.key]?.average ?? null,
      samples: currentValues[metric.key]?.samples ?? [],
      baseline: baselines[metric.key]?.baseline ?? null,
    })),
    regressions,
    updatedBaselines,
  };
}
