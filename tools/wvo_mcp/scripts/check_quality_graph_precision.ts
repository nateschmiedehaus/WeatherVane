#!/usr/bin/env node
/**
 * Quality Graph Precision Checker
 *
 * Computes precision@5 for quality graph hints using a curated dataset of
 * query → relevant neighbor mappings. Intended for VERIFY/CI gating.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { findSimilarTasks } from '../src/quality_graph/similarity.js';
import { ensureQualityGraphDir, getVectorCount } from '../src/quality_graph/persistence.js';

type QueryExpectation = {
  task_id: string;
  relevant: string[];
};

type DatasetDefinition = {
  description?: string;
  baseline_precision: number;
  tolerance?: number;
  queries: QueryExpectation[];
};

export type PrecisionQueryReport = {
  taskId: string;
  relevant: string[];
  retrieved: string[];
  hits: number;
  precision: number;
};

export type PrecisionReport = {
  timestamp: string;
  workspaceRoot: string;
  datasetPath: string;
  baseline: number;
  tolerance: number;
  measured: number;
  delta: number;
  status: 'passed' | 'failed';
  queries: PrecisionQueryReport[];
};

export interface PrecisionOptions {
  workspaceRoot: string;
  datasetPath: string;
  reportPath?: string;
  toleranceOverride?: number;
  baselineOverride?: number;
  quiet?: boolean;
  minimumCorpus?: number;
}

function parseArgs(argv: string[]): PrecisionOptions {
  let workspaceRoot = process.cwd();
  let datasetPath = path.resolve(
    workspaceRoot,
    'tools/wvo_mcp/src/quality_graph/__fixtures__/precision/dataset.json',
  );
  let reportPath: string | undefined;
  let toleranceOverride: number | undefined;
  let baselineOverride: number | undefined;
  let quiet = false;
  let datasetExplicit = false;
  let minimumCorpus = 0;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--workspace-root':
      case '--workspace':
        workspaceRoot = path.resolve(argv[i + 1] ?? workspaceRoot);
        i += 1;
        break;
      case '--dataset':
        datasetPath = path.resolve(argv[i + 1] ?? datasetPath);
        datasetExplicit = true;
        i += 1;
        break;
      case '--report':
        reportPath = path.resolve(argv[i + 1] ?? '');
        i += 1;
        break;
      case '--tolerance':
        toleranceOverride = Number.parseFloat(argv[i + 1] ?? '');
        i += 1;
        break;
      case '--baseline':
        baselineOverride = Number.parseFloat(argv[i + 1] ?? '');
        i += 1;
        break;
      case '--min-corpus':
        minimumCorpus = Number.parseInt(argv[i + 1] ?? '', 10);
        if (Number.isNaN(minimumCorpus) || minimumCorpus < 0) {
          throw new Error('--min-corpus requires a non-negative integer');
        }
        i += 1;
        break;
      case '--quiet':
        quiet = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        // Ignore unknown args to stay flexible
        break;
    }
  }

  if (!datasetExplicit) {
    datasetPath = path.resolve(
      workspaceRoot,
      'tools/wvo_mcp/src/quality_graph/__fixtures__/precision/dataset.json',
    );
  }

  return {
    workspaceRoot,
    datasetPath,
    reportPath,
    toleranceOverride,
    baselineOverride,
    quiet,
    minimumCorpus,
  };
}

function printHelp(): void { // eslint-disable-line no-console
  console.log(`Usage: node tools/wvo_mcp/scripts/check_quality_graph_precision.ts [options]

Options:
  --workspace-root <path>   Workspace root (default: cwd)
  --dataset <path>          Dataset definition JSON (default: fixtures dataset)
  --report <path>           Write precision report JSON (default: state/automation/quality_graph_precision_report.json)
  --tolerance <number>      Override allowed delta from baseline (dataset default 0.02)
  --baseline <number>       Override baseline precision target
  --min-corpus <number>     Skip evaluation unless corpus >= threshold
  --quiet                   Suppress log output
  --help                    Show this message
`);
}

async function loadDataset(datasetPath: string): Promise<DatasetDefinition> {
  const raw = await fs.readFile(datasetPath, 'utf-8');
  const parsed = JSON.parse(raw) as DatasetDefinition;
  if (!parsed.queries || parsed.queries.length === 0) {
    throw new Error(`Dataset ${datasetPath} has no queries`);
  }
  if (typeof parsed.baseline_precision !== 'number') {
    throw new Error(`Dataset ${datasetPath} missing baseline_precision`);
  }
  return parsed;
}

async function ensureReportDir(reportPath: string): Promise<void> {
  const dir = path.dirname(reportPath);
  await fs.mkdir(dir, { recursive: true });
}

export async function evaluateQualityGraphPrecision(options: PrecisionOptions): Promise<PrecisionReport> {
  const dataset = await loadDataset(options.datasetPath);
  const baseline = options.baselineOverride ?? dataset.baseline_precision;
  const tolerance = options.toleranceOverride ?? dataset.tolerance ?? 0.02;

  const queriesReport: PrecisionQueryReport[] = [];
  let totalHits = 0;
  let totalRelevant = 0;
  const workspaceRoot = path.resolve(options.workspaceRoot);

  await ensureQualityGraphDir(workspaceRoot); // ensures state directory exists

  const corpusPath = path.join(workspaceRoot, 'state', 'quality_graph', 'task_vectors.jsonl');
  const corpusSize = await getVectorCount(workspaceRoot);
  if ((options.minimumCorpus ?? 0) > 0 && corpusSize < (options.minimumCorpus ?? 0)) {
    if (!options.quiet) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            status: 'skipped',
            reason: `Corpus size ${corpusSize} below threshold ${(options.minimumCorpus ?? 0)}`,
            corpusSize,
            threshold: options.minimumCorpus ?? 0,
          },
          null,
          2,
        ),
      );
    }
    return {
      timestamp: new Date().toISOString(),
      workspaceRoot,
      datasetPath: options.datasetPath,
      baseline,
      tolerance,
      measured: 0,
      delta: 0,
      status: 'passed',
      queries: [],
    };
  }

  try {
    await fs.access(corpusPath);
  } catch (error) {
    throw new Error(
      `Quality graph corpus missing at ${corpusPath}. Run reindex or record vectors before evaluating.`,
    );
  }

  for (const query of dataset.queries) {
    const relevantSet = new Set(query.relevant ?? []);
    let similar;
    try {
      similar = await findSimilarTasks(workspaceRoot, query.task_id, {
        k: 5,
        minSimilarity: 0,
        successOnly: false,
        excludeAbandoned: false,
      });
    } catch (error) {
      throw new Error(`Failed to query quality graph for ${query.task_id}: ${(error as Error).message}`);
    }

    const retrievedIds = similar.map(item => item.task_id);
    const hits = retrievedIds.filter(id => relevantSet.has(id)).length;
    const denominator = Math.min(5, Math.max(1, relevantSet.size));
    const precision = hits / denominator;

    totalHits += hits;
    totalRelevant += denominator;

    queriesReport.push({
      taskId: query.task_id,
      relevant: query.relevant,
      retrieved: retrievedIds,
      hits,
      precision,
    });
  }

  const measured = totalRelevant > 0 ? totalHits / totalRelevant : 1.0;
  const delta = baseline - measured;
  const status: 'passed' | 'failed' = delta > tolerance ? 'failed' : 'passed';

  const report: PrecisionReport = {
    timestamp: new Date().toISOString(),
    workspaceRoot,
    datasetPath: path.resolve(options.datasetPath),
    baseline,
    tolerance,
    measured,
    delta,
    status,
    queries: queriesReport,
  };

  if (options.reportPath) {
    await ensureReportDir(options.reportPath);
    await fs.writeFile(options.reportPath, JSON.stringify(report, null, 2));
  }

  if (!options.quiet) {
    // eslint-disable-next-line no-console
    console.log(
      `Quality graph precision: ${(measured * 100).toFixed(2)}% (baseline ${(baseline * 100).toFixed(
        2,
      )}% | tolerance ${(tolerance * 100).toFixed(2)}%) → ${status.toUpperCase()}`,
    );
  }

  return report;
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv);
  const reportPath =
    options.reportPath ??
    path.join(options.workspaceRoot, 'state', 'automation', 'quality_graph_precision_report.json');

  const report = await evaluateQualityGraphPrecision({
    ...options,
    reportPath,
  });

  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to evaluate quality graph precision', error);
    process.exitCode = 1;
  });
}
