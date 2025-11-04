import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { discoverModelCatalog } from '../src/orchestrator/model_discovery.js';
import {
  ModelCatalogSchema,
  ModelCapabilitySchema,
  ensureNotes,
  type ModelCatalog,
} from '../src/orchestrator/model_catalog_schema.js';

interface CliOptions {
  changelogPath?: string;
}

type ModelEntry = ModelCatalog['models'][number];
type NormalizedModel = Omit<ModelEntry, 'notes'> & { notes: string[] };
type NormalizedCatalog = Omit<ModelCatalog, 'models'> & { models: NormalizedModel[] };

interface DiffEntry {
  key: string;
  previous?: NormalizedModel;
  next?: NormalizedModel;
  changedFields?: Array<keyof NormalizedModel>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(workspaceRoot, '..');
const orchestratorDir = path.join(workspaceRoot, 'src', 'orchestrator');
const policyPath = path.join(orchestratorDir, 'model_policy.yaml');
const lastJsonPath = path.join(orchestratorDir, 'models_last.json');

const MODEL_COMPARE_FIELDS: Array<keyof NormalizedModel> = [
  'context_window',
  'reasoning_strength',
  'code_quality',
  'latency_ms_est',
  'price_class',
  'tool_use_ok',
  'vision_ok',
  'max_output_tokens',
  'notes',
];

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const runId = `refresh-${new Date().toISOString()}`;

  const previousCatalog = await loadPreviousCatalog();
  const discoveryResult = await discoverModelCatalog({
    workspaceRoot,
    runId,
  });

  const nextCatalog = normalizeCatalog({
    models: discoveryResult.models,
    source: discoveryResult.source,
    timestamp: new Date().toISOString(),
    fallback: discoveryResult.fallbackNotes,
  });

  ModelCatalogSchema.parse(nextCatalog);

  const diff = diffCatalogs(previousCatalog, nextCatalog);
  const summary = buildSummary(runId, diff, discoveryResult.fallbackNotes ?? []);

  await writeChangelog(options.changelogPath, summary);
  console.log(summary);

  if (!diff.hasChanges) {
    console.log('Model catalog unchanged; skipping artifacts.');
    return;
  }

  await fs.writeFile(lastJsonPath, JSON.stringify(nextCatalog, null, 2) + '\n', 'utf8');
  console.log(`Wrote updated catalog to ${path.relative(repoRoot, lastJsonPath)}.`);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--changelog' && i + 1 < argv.length) {
      options.changelogPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: refresh_model_catalog.ts [--changelog path]

Runs the model discovery pipeline, validates the catalog, and emits a changelog summary.
When changes are detected the updated catalog is written to models_last.json.
`);
}

async function loadPreviousCatalog(): Promise<NormalizedCatalog> {
  try {
    const content = await fs.readFile(lastJsonPath, 'utf8');
    return normalizeCatalog(ModelCatalogSchema.parse(JSON.parse(content)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Failed to load ${path.relative(repoRoot, lastJsonPath)}:`, error);
    }
  }

  const policyDoc = await fs.readFile(policyPath, 'utf8');
  const parsed = YAML.parse(policyDoc) ?? {};
  const models = Array.isArray(parsed.models) ? parsed.models : [];
  const sanitized = models.map((entry: unknown) => ensureNotes(ModelCapabilitySchema.parse(entry)));
  return normalizeCatalog({
    models: sanitized,
    source: 'policy',
    timestamp: new Date().toISOString(),
  });
}

function normalizeCatalog(catalog: ModelCatalog): NormalizedCatalog {
  const models = [...catalog.models].map(normalizeModel).sort(compareModels);
  return {
    ...catalog,
    models,
  };
}

function normalizeModel(model: ModelEntry): NormalizedModel {
  return {
    ...model,
    notes: Array.isArray(model.notes) ? [...model.notes].sort() : [],
  };
}

function compareModels(a: NormalizedModel, b: NormalizedModel) {
  if (a.provider === b.provider) {
    return a.name.localeCompare(b.name);
  }
  return a.provider.localeCompare(b.provider);
}

function makeModelKey(model: NormalizedModel) {
  return `${model.provider}:${model.name}`;
}

function diffCatalogs(previous: NormalizedCatalog, next: NormalizedCatalog) {
  const previousMap = new Map<string, NormalizedModel>();
  previous.models.forEach((model) => previousMap.set(makeModelKey(model), model));
  const nextMap = new Map<string, NormalizedModel>();
  next.models.forEach((model) => nextMap.set(makeModelKey(model), model));

  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: DiffEntry[] = [];

  for (const [key, model] of nextMap.entries()) {
    if (!previousMap.has(key)) {
      added.push({ key, next: model });
      continue;
    }
    const previousModel = previousMap.get(key)!;
    const changedFields = MODEL_COMPARE_FIELDS.filter(
      (field) => JSON.stringify(previousModel[field]) !== JSON.stringify(model[field]),
    );
    if (changedFields.length > 0) {
      changed.push({
        key,
        previous: previousModel,
        next: model,
        changedFields,
      });
    }
  }

  for (const [key, model] of previousMap.entries()) {
    if (!nextMap.has(key)) {
      removed.push({ key, previous: model });
    }
  }

  return {
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
    added,
    removed,
    changed,
  };
}

function buildSummary(runId: string, diff: ReturnType<typeof diffCatalogs>, fallbackNotes: string[]) {
  const lines: string[] = [];
  lines.push(`## Model catalog refresh`);
  lines.push(`Run: ${runId}`);
  lines.push('');
  lines.push(
    fallbackNotes.length > 0 ? `Fallback notes: ${fallbackNotes.join(', ')}` : 'Fallback notes: none',
  );
  lines.push('');

  if (!diff.hasChanges) {
    lines.push('No model changes detected.');
    return lines.join('\n');
  }

  if (diff.added.length > 0) {
    lines.push('### Added');
    for (const entry of diff.added) {
      lines.push(`- ${formatModel(entry.next!)}`);
    }
    lines.push('');
  }
  if (diff.removed.length > 0) {
    lines.push('### Removed');
    for (const entry of diff.removed) {
      lines.push(`- ${formatModel(entry.previous!)}`);
    }
    lines.push('');
  }
  if (diff.changed.length > 0) {
    lines.push('### Updated');
    for (const entry of diff.changed) {
      const fieldChanges = entry.changedFields ?? [];
      const fieldDescriptions = fieldChanges
        .map((field) => formatFieldChange(field, entry.previous!, entry.next!))
        .filter(Boolean)
        .join(', ');
      lines.push(`- ${formatModel(entry.next!)} (${fieldDescriptions})`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function formatModel(model: NormalizedModel) {
  return `${model.name} [${model.provider}] ctx=${model.context_window} reasoning=${model.reasoning_strength} code=${model.code_quality}`;
}

function formatFieldChange(
  field: keyof NormalizedModel,
  previous: NormalizedModel,
  next: NormalizedModel,
) {
  const before = JSON.stringify(previous[field]);
  const after = JSON.stringify(next[field]);
  if (before === after) {
    return '';
  }
  return `${String(field)} ${before}→${after}`;
}

async function writeChangelog(targetPath: string | undefined, contents: string) {
  if (!targetPath) {
    return;
  }
  await fs.writeFile(targetPath, contents, 'utf8');
}

main().catch((error) => {
  console.error('refresh_model_catalog failed', error);
  process.exitCode = 1;
});
