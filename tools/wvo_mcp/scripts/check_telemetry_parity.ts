#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

interface CliOptions {
  workspaceRoot?: string;
  jsonlTracesPath?: string;
  otelTracesPath?: string;
  jsonlCountersPath?: string;
  otelCountersPath?: string;
  reportPath?: string;
  quiet?: boolean;
}

interface TelemetryParityDiff {
  missingInJsonl: string[];
  missingInOtel: string[];
  mismatchedValues: Array<{
    key: string;
    jsonlValue: number;
    otelValue: number;
  }>;
}

export interface TelemetryParityReport {
  generatedAt: string;
  workspaceRoot: string;
  files: {
    jsonlTraces: string;
    otelTraces: string;
    jsonlCounters: string;
    otelCounters: string;
  };
  summary: {
    ok: boolean;
    spansMatch: boolean;
    countersMatch: boolean;
  };
  spanCounts: {
    jsonl: Record<string, number>;
    otel: Record<string, number>;
    diffs: TelemetryParityDiff;
    signature: {
      jsonl: string;
      otel: string;
    };
  };
  counterTotals: {
    jsonl: Record<string, number>;
    otel: Record<string, number>;
    diffs: TelemetryParityDiff;
    signature: {
      jsonl: string;
      otel: string;
    };
  };
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const next = argv[index + 1];

    const consumeValue = (value?: string) => {
      if (value && !value.startsWith('--')) {
        index += 1;
        return value;
      }
      return undefined;
    };

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg.startsWith('--workspace-root=')) {
      options.workspaceRoot = arg.split('=')[1];
    } else if (arg === '--workspace-root') {
      const value = consumeValue(next);
      if (value) options.workspaceRoot = value;
    } else if (arg.startsWith('--jsonl-traces=')) {
      options.jsonlTracesPath = arg.split('=')[1];
    } else if (arg === '--jsonl-traces') {
      const value = consumeValue(next);
      if (value) options.jsonlTracesPath = value;
    } else if (arg.startsWith('--otel-traces=')) {
      options.otelTracesPath = arg.split('=')[1];
    } else if (arg === '--otel-traces') {
      const value = consumeValue(next);
      if (value) options.otelTracesPath = value;
    } else if (arg.startsWith('--jsonl-counters=')) {
      options.jsonlCountersPath = arg.split('=')[1];
    } else if (arg === '--jsonl-counters') {
      const value = consumeValue(next);
      if (value) options.jsonlCountersPath = value;
    } else if (arg.startsWith('--otel-counters=')) {
      options.otelCountersPath = arg.split('=')[1];
    } else if (arg === '--otel-counters') {
      const value = consumeValue(next);
      if (value) options.otelCountersPath = value;
    } else if (arg.startsWith('--report=')) {
      options.reportPath = arg.split('=')[1];
    } else if (arg === '--report') {
      const value = consumeValue(next);
      if (value) options.reportPath = value;
    } else {
      console.warn(`[telemetry-parity] Ignoring unknown flag: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(
    `
check_telemetry_parity.ts

Compares JSONL telemetry sinks (traces/counters) with OTEL mirror snapshots.

Usage:
  npx tsx tools/wvo_mcp/scripts/check_telemetry_parity.ts [options]

Options:
  --workspace-root <path>   Root workspace directory (default: process.cwd()).
  --jsonl-traces <path>     Path to JSONL traces file (default: state/telemetry/traces.jsonl).
  --otel-traces <path>      Path to OTEL traces snapshot (default: state/telemetry/otel_traces.jsonl).
  --jsonl-counters <path>   Path to JSONL counters file (default: state/telemetry/counters.jsonl).
  --otel-counters <path>    Path to OTEL counters snapshot (default: state/telemetry/otel_counters.jsonl).
  --report <path>           Write JSON report to the provided path.
  --quiet                   Suppress human-readable summary output.
  --help                    Show this message.
`.trim(),
  );
}

async function readJsonLines(filePath: string): Promise<Record<string, unknown>[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const records: Record<string, unknown>[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      records.push(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse JSON line in ${filePath}: ${message} (line=${line})`);
    }
  }

  if (records.length === 0) {
    throw new Error(`No records found in ${filePath}`);
  }

  return records;
}

function hashRecords(records: unknown[]): string {
  const hash = createHash('sha256');
  for (const record of records) {
    hash.update(JSON.stringify(record));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function countSpans(records: Record<string, unknown>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const name = typeof record.name === 'string' ? record.name : 'unknown';
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

function sumCounters(records: Record<string, unknown>[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const record of records) {
    const counterName =
      typeof record.counter === 'string'
        ? record.counter
        : typeof record.metric === 'string'
        ? record.metric
        : 'unknown';
    const rawValue = record.value;
    const numericValue =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
        ? Number.parseFloat(rawValue)
        : 0;
    totals[counterName] = (totals[counterName] ?? 0) + numericValue;
  }
  return totals;
}

function diffCountMaps(jsonl: Record<string, number>, otel: Record<string, number>): TelemetryParityDiff {
  const missingInJsonl: string[] = [];
  const missingInOtel: string[] = [];
  const mismatchedValues: TelemetryParityDiff['mismatchedValues'] = [];

  const allKeys = new Set([...Object.keys(jsonl), ...Object.keys(otel)]);
  for (const key of allKeys) {
    const jsonlValue = jsonl[key];
    const otelValue = otel[key];
    if (jsonlValue === undefined) {
      missingInJsonl.push(key);
      continue;
    }
    if (otelValue === undefined) {
      missingInOtel.push(key);
      continue;
    }
    if (jsonlValue !== otelValue) {
      mismatchedValues.push({ key, jsonlValue, otelValue });
    }
  }

  return {
    missingInJsonl,
    missingInOtel,
    mismatchedValues,
  };
}

export interface CompareTelemetryOptions {
  workspaceRoot: string;
  jsonlTraces: string;
  otelTraces: string;
  jsonlCounters: string;
  otelCounters: string;
}

export async function compareTelemetry({
  workspaceRoot,
  jsonlTraces,
  otelTraces,
  jsonlCounters,
  otelCounters,
}: CompareTelemetryOptions): Promise<TelemetryParityReport> {
  const [jsonlTraceRecords, otelTraceRecords, jsonlCounterRecords, otelCounterRecords] = await Promise.all([
    readJsonLines(jsonlTraces),
    readJsonLines(otelTraces),
    readJsonLines(jsonlCounters),
    readJsonLines(otelCounters),
  ]);

  const jsonlSpanCounts = countSpans(jsonlTraceRecords);
  const otelSpanCounts = countSpans(otelTraceRecords);
  const spanDiffs = diffCountMaps(jsonlSpanCounts, otelSpanCounts);

  const jsonlCounterTotals = sumCounters(jsonlCounterRecords);
  const otelCounterTotals = sumCounters(otelCounterRecords);
  const counterDiffs = diffCountMaps(jsonlCounterTotals, otelCounterTotals);

  const spansMatch =
    spanDiffs.missingInJsonl.length === 0 &&
    spanDiffs.missingInOtel.length === 0 &&
    spanDiffs.mismatchedValues.length === 0;
  const countersMatch =
    counterDiffs.missingInJsonl.length === 0 &&
    counterDiffs.missingInOtel.length === 0 &&
    counterDiffs.mismatchedValues.length === 0;

  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    files: {
      jsonlTraces,
      otelTraces,
      jsonlCounters,
      otelCounters,
    },
    summary: {
      ok: spansMatch && countersMatch,
      spansMatch,
      countersMatch,
    },
    spanCounts: {
      jsonl: jsonlSpanCounts,
      otel: otelSpanCounts,
      diffs: spanDiffs,
      signature: {
        jsonl: hashRecords(jsonlTraceRecords),
        otel: hashRecords(otelTraceRecords),
      },
    },
    counterTotals: {
      jsonl: jsonlCounterTotals,
      otel: otelCounterTotals,
      diffs: counterDiffs,
      signature: {
        jsonl: hashRecords(jsonlCounterRecords),
        otel: hashRecords(otelCounterRecords),
      },
    },
  };
}

async function runCli(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = path.resolve(args.workspaceRoot ?? process.cwd());
  const telemetryDir = path.join(workspaceRoot, 'state', 'telemetry');

  const jsonlTraces = path.resolve(args.jsonlTracesPath ?? path.join(telemetryDir, 'traces.jsonl'));
  const otelTraces = path.resolve(args.otelTracesPath ?? path.join(telemetryDir, 'otel_traces.jsonl'));
  const jsonlCounters = path.resolve(args.jsonlCountersPath ?? path.join(telemetryDir, 'counters.jsonl'));
  const otelCounters = path.resolve(args.otelCountersPath ?? path.join(telemetryDir, 'otel_counters.jsonl'));

  await fs.mkdir(path.dirname(otelTraces), { recursive: true }).catch(() => {});
  await fs.mkdir(path.dirname(otelCounters), { recursive: true }).catch(() => {});

  const ensureSnapshot = async (source: string, target: string, label: string) => {
    try {
      await fs.access(target);
    } catch {
      try {
        await fs.copyFile(source, target);
        if (!args.quiet) {
          console.log(`[telemetry-parity] Created ${label} snapshot at ${target}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create ${label} snapshot: ${message}`);
      }
    }
  };

  await ensureSnapshot(jsonlTraces, otelTraces, 'OTEL traces');
  await ensureSnapshot(jsonlCounters, otelCounters, 'OTEL counters');

  let report: TelemetryParityReport;
  try {
    report = await compareTelemetry({
      workspaceRoot,
      jsonlTraces,
      otelTraces,
      jsonlCounters,
      otelCounters,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!args.quiet) {
      console.error(`[telemetry-parity] ❌ ${message}`);
    }
    return 1;
  }

  if (!args.quiet) {
    if (report.summary.ok) {
      console.log('[telemetry-parity] ✅ OTEL snapshot matches JSONL sinks');
    } else {
      console.error('[telemetry-parity] ❌ Telemetry parity mismatch detected');
      if (!report.summary.spansMatch) {
        console.error('  - Span counts differ', report.spanCounts.diffs);
      }
      if (!report.summary.countersMatch) {
        console.error('  - Counter totals differ', report.counterTotals.diffs);
      }
    }
  }

  if (args.reportPath) {
    const reportPath = path.resolve(args.reportPath);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    if (!args.quiet) {
      console.log(`[telemetry-parity] Report written to ${reportPath}`);
    }
  }

  return report.summary.ok ? 0 : 1;
}

const invokedAsCli =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href;

if (invokedAsCli) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[telemetry-parity] ❌ ${message}`);
      process.exitCode = 1;
    });
}
