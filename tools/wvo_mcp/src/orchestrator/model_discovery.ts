import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { execa } from 'execa';

import { logInfo, logWarning } from '../telemetry/logger.js';
import { recordBrowserLogin } from '../utils/browser_login_tracker.js';

import {
  ModelCatalogSchema,
  ModelCapability,
  ModelCapabilitySchema,
  ensureNotes,
} from './model_catalog_schema.js';
import { ROUTER_ALLOWED_MODELS, ROUTER_BANNED_PROVIDERS } from './router_lock.js';

type ProviderId = 'openai' | 'anthropic';

export interface DiscoveryOptions {
  workspaceRoot: string;
  runId?: string;
  journalLogger?: (entry: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface DiscoveryResult {
  models: ModelCapability[];
  source: 'discovery' | 'mixed' | 'policy';
  fallbackNotes: string[];
  discoveryPath: string;
  repairedPath: string;
  resourceUri: string;
}

interface CliConfig {
  command: string;
  args: string[];
  envOverride?: string;
}

interface ProviderConfig {
  envKeys: string[];
  cli?: CliConfig;
  fallbackModels: ModelCapability[];
}

const RUN_RESOURCE_PREFIX = 'resources://runs';

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    envKeys: ['OPENAI_API_KEY'],
    cli: {
      command: 'codex',
      args: ['models', 'list', '--json'],
      envOverride: 'WVO_MODEL_DISCOVERY_CLI_OPENAI',
    },
    fallbackModels: [
      {
        name: 'codex-5-high',
        provider: 'openai',
        context_window: 128_000,
        reasoning_strength: 'high',
        code_quality: 'high',
        latency_ms_est: 1800,
        price_class: 'premium',
        tool_use_ok: true,
        vision_ok: false,
        max_output_tokens: 8192,
        notes: ['allowlist'],
      },
      {
        name: 'codex-5-medium',
        provider: 'openai',
        context_window: 128_000,
        reasoning_strength: 'medium_high',
        code_quality: 'high',
        latency_ms_est: 1200,
        price_class: 'normal',
        tool_use_ok: true,
        vision_ok: false,
        max_output_tokens: 8192,
        notes: ['allowlist'],
      },
      {
        name: 'codex-5-low',
        provider: 'openai',
        context_window: 128_000,
        reasoning_strength: 'medium',
        code_quality: 'medium',
        latency_ms_est: 800,
        price_class: 'cheap',
        tool_use_ok: true,
        vision_ok: false,
        max_output_tokens: 8192,
        notes: ['allowlist'],
      },
    ].map(entry => ModelCapabilitySchema.parse(entry)),
  },
  anthropic: {
    envKeys: ['ANTHROPIC_API_KEY'],
    cli: {
      command: 'claude',
      args: ['models', 'list', '--json'],
      envOverride: 'WVO_MODEL_DISCOVERY_CLI_ANTHROPIC',
    },
    fallbackModels: [
      {
        name: 'claude-sonnet-4.5',
        provider: 'anthropic',
        context_window: 200_000,
        reasoning_strength: 'high',
        code_quality: 'high',
        latency_ms_est: 1600,
        price_class: 'premium',
        tool_use_ok: true,
        vision_ok: true,
        max_output_tokens: 8192,
        notes: ['allowlist'],
      },
      {
        name: 'claude-haiku-4.5',
        provider: 'anthropic',
        context_window: 200_000,
        reasoning_strength: 'medium',
        code_quality: 'medium',
        latency_ms_est: 700,
        price_class: 'cheap',
        tool_use_ok: true,
        vision_ok: true,
        max_output_tokens: 8192,
        notes: ['allowlist'],
      },
      {
        name: 'claude-opus-4.1',
        provider: 'anthropic',
        context_window: 200_000,
        reasoning_strength: 'ultra',
        code_quality: 'ultra',
        latency_ms_est: 2400,
        price_class: 'premium',
        tool_use_ok: true,
        vision_ok: true,
        max_output_tokens: 8192,
        notes: ['allowlist'],
      },
    ].map(entry => ModelCapabilitySchema.parse(entry)),
  },
};

export async function discoverModelCatalog(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const env = options.env ?? process.env;
  const runId = normalizeRunId(options.runId ?? env.WVO_RUN_ID ?? '');
  const runDir = path.join(options.workspaceRoot, 'resources', 'runs', runId);
  await fs.mkdir(runDir, { recursive: true });

  const fallbackNotes: string[] = [];
  const models: ModelCapability[] = [];

  await guardAgainstBannedEnv(env, options.journalLogger);

  for (const [provider, config] of Object.entries(PROVIDERS) as Array<[ProviderId, ProviderConfig]>) {
    const { models: providerModels, notes } = await collectProviderCatalog(
      provider,
      config,
      env,
      options.workspaceRoot
    );
    models.push(...providerModels);
    fallbackNotes.push(...notes);
  }

  const catalogDocument = {
    models: models.map(ensureNotes),
    source: fallbackNotes.length > 0 ? 'mixed' : 'discovery',
    timestamp: new Date().toISOString(),
    fallback: Array.from(new Set(fallbackNotes)),
  };

  const validated = ModelCatalogSchema.parse(catalogDocument);
  await guardAgainstBannedEntries(validated.models, options.journalLogger);

  const discoveryPath = path.join(runDir, 'models_discovered.json');
  await fs.writeFile(discoveryPath, JSON.stringify(validated, null, 2));

  const resourceUri = `${RUN_RESOURCE_PREFIX}/${runId}/models_discovered.json`;
  logInfo('model_discovery.completed', {
    runId,
    resourceUri,
    fallbackNotes: Array.from(new Set(fallbackNotes)),
    modelCount: validated.models.length,
  });

  return {
    models: validated.models,
    source: (validated.source as DiscoveryResult['source']) ?? 'policy',
    fallbackNotes: Array.from(new Set(fallbackNotes)),
    discoveryPath,
    repairedPath: discoveryPath,
    resourceUri,
  };
}

async function guardAgainstBannedEnv(env: NodeJS.ProcessEnv, journalLogger?: (entry: string) => Promise<void>) {
  const bannedHits: string[] = [];
  if (env.GOOGLE_API_KEY) bannedHits.push('google');
  if (env.VERTEX_AI_PROJECT) bannedHits.push('google');
  if (env.XAI_API_KEY) bannedHits.push('xai');

  if (bannedHits.length) {
    const detail = `model_discovery:banned_env:${Array.from(new Set(bannedHits)).join(',')}`;
    await journalLogger?.(detail);
  }
}

async function guardAgainstBannedEntries(
  entries: ModelCapability[],
  journalLogger?: (entry: string) => Promise<void>
) {
  const banned = entries.filter(
    entry => ROUTER_BANNED_PROVIDERS.has(entry.provider as string) || !ROUTER_ALLOWED_MODELS.has(entry.name)
  );
  if (!banned.length) {
    return;
  }
  const descriptor = banned.map(entry => `${entry.provider}:${entry.name}`).join(',');
  await journalLogger?.(`model_discovery:banned_detected:${descriptor}`);
  throw new Error(`Disallowed models detected: ${descriptor}`);
}

function normalizeRunId(runId?: string): string {
  if (!runId || runId.trim().length === 0) {
    return `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  }

  const trimmed = runId.trim();
  const prefixed = trimmed.startsWith('run-') ? trimmed : `run-${trimmed}`;

  // Filesystem limit for directory names is typically 255 bytes
  // Reserve space for parent path, so cap at 100 chars for safety
  const MAX_RUN_ID_LENGTH = 100;

  if (prefixed.length <= MAX_RUN_ID_LENGTH) {
    return prefixed;
  }

  // For long IDs, use first 50 chars + hash of full ID + last 20 chars
  // This maintains some readability while ensuring uniqueness
  const hash = hashString(prefixed);
  const prefix = prefixed.slice(0, 50);
  const suffix = prefixed.slice(-20);
  return `${prefix}-${hash}-${suffix}`;
}

function hashString(str: string): string {
  // Simple hash function for runId truncation
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

async function collectProviderCatalog(
  provider: ProviderId,
  config: ProviderConfig,
  env: NodeJS.ProcessEnv,
  workspaceRoot: string
): Promise<{ models: ModelCapability[]; notes: string[] }> {
  const notes: string[] = [];
  const envPresent = config.envKeys.some(key => Boolean(env[key]?.trim()));
  const cliPreferred = Boolean(config.cli) && shouldUseCli(env);
  if (!envPresent) {
    if (cliPreferred) {
      notes.push(`browser_login:${provider}`);
    } else {
      notes.push(`env_missing:${provider}`);
    }
  }

  let discovered: ModelCapability[] | undefined;
  if (config.cli && cliPreferred) {
    const cli = resolveCli(config.cli, env);
    if (cli) {
      const stdout = await runCliDiscovery(cli.command, cli.args, provider);
      if (stdout) {
        const parsed = hydrateCliModels(stdout, provider, config.fallbackModels);
        if (parsed.length) {
          discovered = parsed;
          notes.push(`cli_discovery:${provider}`);
          await recordBrowserLogin(workspaceRoot, provider);
        } else {
          notes.push(`cli_no_allowed:${provider}`);
        }
      } else {
        notes.push(`cli_failed:${provider}`);
      }
    } else {
      notes.push(`cli_unconfigured:${provider}`);
    }
  } else if (config.cli && envPresent && !cliPreferred) {
    notes.push(`cli_disabled:${provider}`);
  } else if (config.cli && !envPresent && !cliPreferred) {
    notes.push(`cli_skipped:${provider}`);
  }

  const models = discovered ?? cloneModels(config.fallbackModels, `fallback:${provider}`);
  if (!discovered) {
    notes.push(`fallback_used:${provider}`);
  }
  return { models, notes: Array.from(new Set(notes)) };
}

function resolveCli(cli: CliConfig, env: NodeJS.ProcessEnv): { command: string; args: string[] } | null {
  const override = cli.envOverride ? env[cli.envOverride] : undefined;
  const command = (override ?? cli.command)?.trim();
  if (!command) {
    return null;
  }
  return { command, args: cli.args };
}

async function runCliDiscovery(command: string, args: string[], provider: string): Promise<string | null> {
  try {
    const result = await execa(command, args, { reject: true });
    return result.stdout;
  } catch (error) {
    logWarning('model_discovery.cli_error', {
      provider,
      command,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function hydrateCliModels(
  stdout: string,
  provider: ProviderId,
  fallbackModels: ModelCapability[]
): ModelCapability[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    logWarning('model_discovery.cli_parse_failed', {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
  const entries = normalizeCliEntries(parsed);
  if (!entries.length) {
    return [];
  }
  const fallbackMap = new Map(fallbackModels.map(model => [model.name, model]));
  const hydrated: ModelCapability[] = [];
  for (const entry of entries) {
    const name = extractModelName(entry);
    if (!name || !ROUTER_ALLOWED_MODELS.has(name)) {
      continue;
    }
    const template = fallbackMap.get(name);
    if (!template) {
      continue;
    }
    const enriched = mergeCliEntry(template, entry);
    hydrated.push(enriched);
  }
  return hydrated;
}

function normalizeCliEntries(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.models)) {
      return record.models;
    }
    if (Array.isArray(record.data)) {
      return record.data;
    }
  }
  return [];
}

function extractModelName(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const candidates = ['name', 'model', 'id'];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function mergeCliEntry(template: ModelCapability, entry: unknown): ModelCapability {
  const record = (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const contextWindow = coerceNumber(record.context_window ?? record.contextWindow);
  const latency = coerceNumber(record.latency_ms ?? record.latency ?? record.latencyMs);
  const maxOutput = coerceNumber(record.max_output_tokens ?? record.max_output ?? record.maxOutputTokens);
  const merged = {
    ...template,
    context_window: contextWindow ?? template.context_window,
    latency_ms_est: latency ?? template.latency_ms_est,
    max_output_tokens: maxOutput ?? template.max_output_tokens,
    notes: appendNotes(template.notes, ['cli_discovery']),
  };
  return ModelCapabilitySchema.parse(merged);
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function appendNotes(base: string[] | undefined, additions: string[]): string[] {
  return Array.from(new Set([...(base ?? []), ...additions]));
}

function cloneModels(models: ModelCapability[], note?: string): ModelCapability[] {
  return models.map(model =>
    ModelCapabilitySchema.parse({
      ...model,
      notes: note ? appendNotes(model.notes, [note]) : model.notes,
    })
  );
}

function shouldUseCli(env: NodeJS.ProcessEnv): boolean {
  if (env.WVO_MODEL_DISCOVERY_DISABLE_CLI === '1') {
    return false;
  }
  if (env.WVO_MODEL_DISCOVERY_ENABLE_CLI === '1') {
    return true;
  }
  return true;
}
