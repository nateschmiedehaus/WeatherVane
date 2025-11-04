import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { compareTelemetry } from '../check_telemetry_parity.js';

async function writeJsonLines(filePath: string, records: Record<string, unknown>[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

describe('check_telemetry_parity', () => {
  let tmpDir: string;
  let telemetryDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telemetry-parity-'));
    telemetryDir = path.join(tmpDir, 'state', 'telemetry');
  });

  it('returns ok when span counts and counter totals align', async () => {
    const jsonlTraces = [
      {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.state.transition',
        status: 'ok',
        attributes: { phase: 'SPEC' },
        durationMs: 12.3,
      },
      {
        traceId: 'trace-1',
        spanId: 'span-2',
        name: 'process.validation',
        status: 'ok',
        attributes: { phase: 'THINK' },
        durationMs: 5.1,
      },
    ];
    const otelTraces = [
      {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.state.transition',
        status: 'ok',
        durationMs: 12.3,
        attributes: { phase: 'SPEC' },
      },
      {
        traceId: 'trace-1',
        spanId: 'span-2',
        name: 'process.validation',
        status: 'ok',
        durationMs: 5.1,
        attributes: { phase: 'THINK' },
      },
    ];
    const jsonlCounters = [
      {
        timestamp: '2025-10-30T12:00:00.000Z',
        counter: 'phase_skips_attempted',
        value: 1,
        metadata: { from: 'THINK', to: 'IMPLEMENT' },
      },
    ];
    const otelCounters = [
      {
        counter: 'phase_skips_attempted',
        value: 1,
        metadata: { from: 'THINK', to: 'IMPLEMENT' },
      },
    ];

    const jsonlTracesPath = path.join(telemetryDir, 'traces.jsonl');
    const otelTracesPath = path.join(telemetryDir, 'otel_traces.jsonl');
    const jsonlCountersPath = path.join(telemetryDir, 'counters.jsonl');
    const otelCountersPath = path.join(telemetryDir, 'otel_counters.jsonl');

    await writeJsonLines(jsonlTracesPath, jsonlTraces);
    await writeJsonLines(otelTracesPath, otelTraces);
    await writeJsonLines(jsonlCountersPath, jsonlCounters);
    await writeJsonLines(otelCountersPath, otelCounters);

    const result = await compareTelemetry({
      workspaceRoot: tmpDir,
      jsonlTraces: jsonlTracesPath,
      otelTraces: otelTracesPath,
      jsonlCounters: jsonlCountersPath,
      otelCounters: otelCountersPath,
    });

    expect(result.summary.ok).toBe(true);
    expect(result.spanCounts.diffs.mismatchedValues).toHaveLength(0);
    expect(result.counterTotals.diffs.missingInOtel).toHaveLength(0);
  });

  it('fails when a counter total diverges', async () => {
    const jsonlTracesPath = path.join(telemetryDir, 'traces.jsonl');
    const otelTracesPath = path.join(telemetryDir, 'otel_traces.jsonl');
    const jsonlCountersPath = path.join(telemetryDir, 'counters.jsonl');
    const otelCountersPath = path.join(telemetryDir, 'otel_counters.jsonl');

    await writeJsonLines(jsonlTracesPath, [
      { traceId: 'trace-1', spanId: 'span-1', name: 'agent.state.transition' },
    ]);
    await writeJsonLines(otelTracesPath, [
      { traceId: 'trace-1', spanId: 'span-1', name: 'agent.state.transition' },
    ]);
    await writeJsonLines(jsonlCountersPath, [
      { counter: 'phase_backtracks', value: 2 },
    ]);
    await writeJsonLines(otelCountersPath, [
      { counter: 'phase_backtracks', value: 1 },
    ]);

    const result = await compareTelemetry({
      workspaceRoot: tmpDir,
      jsonlTraces: jsonlTracesPath,
      otelTraces: otelTracesPath,
      jsonlCounters: jsonlCountersPath,
      otelCounters: otelCountersPath,
    });

    expect(result.summary.ok).toBe(false);
    expect(result.counterTotals.diffs.mismatchedValues).toEqual([
      { key: 'phase_backtracks', jsonlValue: 2, otelValue: 1 },
    ]);
  });

  it('throws when a required file is missing', async () => {
    const jsonlTracesPath = path.join(telemetryDir, 'traces.jsonl');
    const otelTracesPath = path.join(telemetryDir, 'otel_traces.jsonl');
    const jsonlCountersPath = path.join(telemetryDir, 'counters.jsonl');
    const otelCountersPath = path.join(telemetryDir, 'otel_counters.jsonl');

    await writeJsonLines(jsonlTracesPath, [
      { traceId: 'trace-1', spanId: 'span-1', name: 'agent.state.transition' },
    ]);
    // Do not create otel traces file to simulate missing snapshot.
    await writeJsonLines(jsonlCountersPath, [
      { counter: 'phase_backtracks', value: 2 },
    ]);
    await writeJsonLines(otelCountersPath, [
      { counter: 'phase_backtracks', value: 2 },
    ]);

    await expect(
      compareTelemetry({
        workspaceRoot: tmpDir,
        jsonlTraces: jsonlTracesPath,
        otelTraces: otelTracesPath,
        jsonlCounters: jsonlCountersPath,
        otelCounters: otelCountersPath,
      }),
    ).rejects.toThrow(/No such file|ENOENT|missing/);
  });
});
