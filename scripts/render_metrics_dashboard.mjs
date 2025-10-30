#!/usr/bin/env node

/**
 * Metrics dashboard CLI
 *
 * Aggregates enforcement telemetry counters + alerts into a concise summary.
 * Produces human-readable output and optional JSON artifact.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDashboard } from '../tools/wvo_mcp/dist/src/telemetry/dashboard.js';

function printUsage() {
  console.log(`Usage: node scripts/render_metrics_dashboard.mjs [options]

Options:
  --workspace-root <path>    Workspace root (default: process.cwd()).
  --window-seconds <number>  Rolling window in seconds (default: 3600).
  --max-records <number>     Max records per signal to scan (optional).
  --output <path>            Write JSON dashboard artifact (default: state/telemetry/dashboard.json).
  --json-only                Skip human-readable output; still writes JSON.
  --help                     Show this help message.
`);
}

function parseArgs(argv) {
  const args = {
    workspaceRoot: process.cwd(),
    windowSeconds: 3600,
    maxRecords: undefined,
    output: path.join('state', 'telemetry', 'dashboard.json'),
    jsonOnly: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--workspace-root':
        args.workspaceRoot = path.resolve(argv[++i] ?? '');
        break;
      case '--window-seconds': {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value <= 0) {
          console.error('window-seconds must be a positive number');
          process.exit(1);
        }
        args.windowSeconds = value;
        break;
      }
      case '--max-records': {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value <= 0) {
          console.error('max-records must be a positive number');
          process.exit(1);
        }
        args.maxRecords = value;
        break;
      }
      case '--output':
        args.output = argv[++i];
        break;
      case '--json-only':
        args.jsonOnly = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  return args;
}

function formatNumber(value, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals) : 'n/a';
}

function formatTrend(trend) {
  if (trend === null || Number.isNaN(trend)) {
    return 'n/a';
  }
  const sign = trend > 0 ? '+' : '';
  return `${sign}${trend.toFixed(1)}%`;
}

function formatTopTasks(topTasks) {
  if (!topTasks || topTasks.length === 0) {
    return '—';
  }
  return topTasks
    .map(task => `${task.taskId} (${task.count}${task.lastTimestamp ? ` @ ${task.lastTimestamp}` : ''})`)
    .join('; ');
}

async function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDirForFile(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function renderToConsole(dashboard) {
  console.log(`WeatherVane Enforcement Dashboard`);
  console.log(`Generated: ${dashboard.generatedAt}`);
  console.log(`Window: ${dashboard.windowSeconds / 60} minutes`);
  console.log('');
  const header = [
    'Metric'.padEnd(25),
    'Total'.padStart(7),
    'Rate/hr'.padStart(10),
    'Prev'.padStart(7),
    'Trend'.padStart(8),
    'Top Tasks'
  ].join('  ');
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const metric of dashboard.metrics) {
    const row = [
      metric.metric.padEnd(25),
      String(metric.total).padStart(7),
      formatNumber(metric.ratePerHour).padStart(10),
      metric.previousTotal === null ? 'n/a'.padStart(7) : String(metric.previousTotal).padStart(7),
      formatTrend(metric.trendDelta).padStart(8),
      formatTopTasks(metric.topTasks)
    ].join('  ');
    console.log(row);
  }
  console.log('');
  if (dashboard.warnings.length > 0) {
    for (const warning of dashboard.warnings) {
      console.warn(`[warn] ${warning}`);
    }
  }
  console.log(`Alerts (latest evaluation: ${dashboard.alerts.evaluatedAt ?? 'n/a'})`);
  console.log(`  Critical: ${dashboard.alerts.triggered.critical} | Warn: ${dashboard.alerts.triggered.warn} | hadCritical=${dashboard.alerts.hadCritical}`);
  if (dashboard.alerts.activeAlerts.length > 0) {
    for (const alert of dashboard.alerts.activeAlerts) {
      console.log(`  • ${alert.name} [${alert.severity}]${alert.remediation ? ` → ${alert.remediation}` : ''}`);
    }
  } else {
    console.log('  • No alerts triggered in current evaluation window.');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const workspaceRoot = args.workspaceRoot ?? path.dirname(fileURLToPath(import.meta.url));

  try {
    const dashboard = await buildDashboard({
      workspaceRoot,
      windowSeconds: args.windowSeconds,
      maxRecords: Number.isFinite(args.maxRecords) ? args.maxRecords : undefined
    });

    if (!args.jsonOnly) {
      renderToConsole(dashboard);
    }

    if (args.output) {
      const outputPath = path.isAbsolute(args.output) ? args.output : path.resolve(workspaceRoot, args.output);
      await writeJson(outputPath, dashboard);
      if (!args.jsonOnly) {
        console.log(`Dashboard written to ${path.relative(workspaceRoot, outputPath)}`);
      }
    }
  } catch (error) {
    console.error('[metrics-dashboard] Failed to render dashboard:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

await main();
