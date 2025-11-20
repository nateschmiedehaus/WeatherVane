import fs from "node:fs";
import path from "node:path";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { mergeCandidates, type ModelCandidate as MergeCandidate } from "../models/model_registry_merge.js";
import type { ModelRegistryData, ModelProvider } from "../models/model_registry.js";

export interface ModelCandidate {
  provider: ModelProvider;
  id: string;
  observedAt: string; // ISO timestamp
  context: number;
  costTier: "fast" | "standard" | "deep";
  capabilities: {
    coding?: boolean;
    reasoning?: boolean;
    vision?: boolean;
  };
  lane: "fast" | "standard" | "deep";
  notes?: string;
}

function now(): string {
  return new Date().toISOString();
}

function geminiCandidates(): ModelCandidate[] {
  return [
    {
      provider: "gemini",
      id: "gemini-2.0-flash-exp",
      observedAt: now(),
      context: 128_000,
      costTier: "fast",
      capabilities: { coding: true, reasoning: true, vision: true },
      lane: "fast",
      notes: "Latest Gemini fast path",
    },
    {
      provider: "gemini",
      id: "gemini-2.0-pro-exp",
      observedAt: now(),
      context: 128_000,
      costTier: "standard",
      capabilities: { coding: true, reasoning: true, vision: true },
      lane: "standard",
      notes: "Balanced Gemini model",
    },
  ];
}

function claudeCandidates(): ModelCandidate[] {
  return [
    {
      provider: "claude",
      id: "claude-3.5-sonnet-latest",
      observedAt: now(),
      context: 200_000,
      costTier: "standard",
      capabilities: { coding: true, reasoning: true, vision: false },
      lane: "standard",
      notes: "Latest Claude balanced",
    },
    {
      provider: "claude",
      id: "claude-3.5-haiku-latest",
      observedAt: now(),
      context: 200_000,
      costTier: "fast",
      capabilities: { coding: true, reasoning: true, vision: false },
      lane: "fast",
      notes: "Latest Claude fast",
    },
  ];
}

function oSeriesCandidates(): ModelCandidate[] {
  return [
    {
      provider: "o3",
      id: "o3-mini-latest",
      observedAt: now(),
      context: 200_000,
      costTier: "fast",
      capabilities: { coding: true, reasoning: true, vision: false },
      lane: "fast",
      notes: "OpenAI small reasoning/coding",
    },
    {
      provider: "o3",
      id: "o3-pro-latest",
      observedAt: now(),
      context: 200_000,
      costTier: "deep",
      capabilities: { coding: true, reasoning: true, vision: true },
      lane: "deep",
      notes: "OpenAI deep reasoning",
    },
  ];
}

function codexCandidates(): ModelCandidate[] {
  return [
    {
      provider: "codex",
      id: "gpt-5-codex-latest",
      observedAt: now(),
      context: 128_000,
      costTier: "standard",
      capabilities: { coding: true, reasoning: true, vision: false },
      lane: "standard",
      notes: "Codex coding model",
    },
  ];
}

export function gatherCandidates(): ModelCandidate[] {
  return [
    ...geminiCandidates(),
    ...claudeCandidates(),
    ...oSeriesCandidates(),
    ...codexCandidates(),
  ];
}

function fromFile(filePath: string): ModelCandidate[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logWarning("ModelScout: Cached source is not an array; falling back to stubs", { filePath });
      return [];
    }
    const validated: ModelCandidate[] = [];
    for (const item of parsed) {
      if (!item?.provider || !item?.id || !item?.observedAt || !item?.context || !item?.lane) {
        logWarning("ModelScout: Skipping invalid cached entry", { item });
        continue;
      }
      validated.push({
        provider: item.provider as ModelProvider,
        id: String(item.id),
        observedAt: String(item.observedAt),
        context: Number(item.context),
        costTier: (item.costTier as any) ?? "standard",
        capabilities: item.capabilities ?? {},
        lane: item.lane,
        notes: item.notes,
      });
    }
    return validated;
  } catch (error) {
    logWarning("ModelScout: Failed to load cached source; falling back to stubs", {
      filePath,
      error: String(error),
    });
    return [];
  }
}

export function loadCandidates(): ModelCandidate[] {
  const source = process.env.WVO_SCOUT_SOURCE;
  if (source && fs.existsSync(source)) {
    logInfo("ModelScout: Loading candidates from cached source", { source });
    const loaded = fromFile(source);
    if (loaded.length > 0) {
      return loaded;
    }
  }
  return gatherCandidates();
}

function toMergeCandidates(candidates: ModelCandidate[]): MergeCandidate[] {
  return candidates.map((c) => ({
    provider: c.provider,
    id: c.id,
    lane: c.lane,
    observedAt: c.observedAt,
    contextWindow: c.context,
    capabilities: [
      c.capabilities.coding ? "coding" : null,
      c.capabilities.reasoning ? "reasoning" : null,
      c.capabilities.vision ? "vision" : null,
    ].filter(Boolean) as string[],
    capabilityTags: c.capabilities,
  }));
}

export function runScout(registryPath: string, backup = true): void {
  const candidates = toMergeCandidates(loadCandidates());
  const backupPath = `${registryPath}.bak`;
  if (!fs.existsSync(registryPath)) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify({ models: {} }, null, 2), "utf-8");
  }
  if (backup) {
    fs.copyFileSync(registryPath, backupPath);
  }
  const content = fs.readFileSync(registryPath, "utf-8");
  const registry = JSON.parse(content) as ModelRegistryData;
  const updated = mergeCandidates(registry, candidates);
  fs.writeFileSync(registryPath, JSON.stringify(updated, null, 2), "utf-8");
}
