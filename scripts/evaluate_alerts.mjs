#!/usr/bin/env node

/**
 * Alert evaluator CLI
 *
 * Parses alert definitions (state/telemetry/alerts.yaml) and checks telemetry
 * JSONL sinks for threshold violations. Emits a summary and optional JSONL log.
 *
 * Exit codes:
 *  - 0: No critical alerts (warn-level alerts may exist).
 *  - 1: Runtime/config error.
 *  - 2: Critical alert triggered.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateAlerts } from '../tools/wvo_mcp/dist/src/telemetry/alerts.js';

function printUsage() {
  console.log(`Usage: node scripts/evaluate_alerts.mjs [options]

Options:
  --workspace-root <path>   Workspace root (defaults to process.cwd()).
  --config <path>           Path to alerts.yaml (default state/telemetry/alerts.yaml).
  --counters <path>         Path to counters JSONL (default state/telemetry/counters.jsonl).
  --metrics <path>          Path to metrics JSONL (default state/telemetry/metrics.jsonl).
  --output <path>           Path to write alerts JSONL summary (default state/telemetry/alerts.jsonl).
  --max-records <n>         Hard cap of records per signal to evaluate.
  --help                    Show this help message.
`);
}

function parseArgs(argv) {
  const args = {
    workspaceRoot: process.cwd(),
    config: undefined,
    counters: undefined,
    metrics: undefined,
    output: path.join('state', 'telemetry', 'alerts.jsonl'),
    maxRecords: undefined,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--workspace-root':
        args.workspaceRoot = path.resolve(argv[++i] ?? '');
        break;
      case '--config':
        args.config = argv[++i];
        break;
      case '--counters':
        args.counters = argv[++i];
        break;
      case '--metrics':
        args.metrics = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--max-records':
        args.maxRecords = Number(argv[++i]);
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

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function writeJsonl(filePath, summary) {
  const payload = JSON.stringify(summary);
  await ensureDir(filePath);
  await fs.appendFile(filePath, `${payload}\n`, 'utf-8');
}

function logSummary(summary, workspaceRoot) {
  console.log(`Alert evaluation @ ${summary.evaluatedAt}`);
  if (summary.warnings.length > 0) {
    for (const warn of summary.warnings) {
      console.warn(`[warn] ${warn}`);
    }
  }
  if (summary.errors.length > 0) {
    for (const err of summary.errors) {
      console.error(`[error] ${err}`);
    }
  }
  if (summary.results.length === 0) {
    console.log('No alerts defined in configuration.');
    return;
  }

  for (const result of summary.results) {
    const status = result.triggered ? result.severity.toUpperCase() : 'OK';
    console.log(
      `[${status}] ${result.name} count=${result.count} threshold ${result.threshold.operator} ${result.threshold.value} (window ${result.window.durationSeconds}s)`
    );
    if (result.triggered && result.samples.length > 0) {
      const relSamples = result.samples.map(sample => {
        const taskId = sample.taskId ?? 'unknown-task';
        return {
          timestamp: sample.timestamp,
          taskId,
          metadata: sample.metadata ?? {},
        };
      });
      console.log(`  samples: ${JSON.stringify(relSamples, null, 2)}`);
    }
    if (result.triggered && result.remediation) {
      console.log(`  remediation: ${result.remediation}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const workspaceRoot = args.workspaceRoot ?? path.dirname(fileURLToPath(import.meta.url));

  try {
    const summary = await evaluateAlerts({
      workspaceRoot,
      configPath: args.config,
      countersPath: args.counters,
      metricsPath: args.metrics,
      maxRecordsOverride: Number.isFinite(args.maxRecords) ? args.maxRecords : undefined,
    });

    logSummary(summary, workspaceRoot);

    if (args.output) {
      const outputPath = path.isAbsolute(args.output)
        ? args.output
        : path.resolve(workspaceRoot, args.output);
      await writeJsonl(outputPath, summary);
      console.log(`Alert summary appended to ${path.relative(workspaceRoot, outputPath)}`);
    }

    if (summary.hadCritical) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('[alert-evaluator] Failed to evaluate alerts:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();
