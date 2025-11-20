import { logWarning } from "../telemetry/logger.js";
import type { ModelRegistryData, ModelProvider, ProviderModels, ClaudeModel, CodexModel, ModelCost } from "./model_registry.js";

export interface ModelCandidate {
  provider: ModelProvider;
  id: string;
  name?: string;
  observedAt: string; // ISO
  contextWindow?: number;
  capabilities?: string[];
  capabilityTags?: Record<string, unknown>;
}

function isNewer(existing?: string, incoming?: string): boolean {
  if (!existing) return true;
  if (!incoming) return false;
  const a = Date.parse(existing);
  const b = Date.parse(incoming);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b > a;
}

function upsertProviderModels(models?: ProviderModels): ProviderModels {
  if (models) return { ...models };
  return { access_method: "api", models: [] };
}

export function mergeCandidates(registry: ModelRegistryData, candidates: ModelCandidate[]): ModelRegistryData {
  const next: ModelRegistryData = {
    ...registry,
    last_updated: new Date().toISOString(),
    providers: { ...registry.providers },
  };

  for (const candidate of candidates) {
    if (!candidate.provider || !candidate.id || !candidate.observedAt) {
      logWarning("ModelRegistryMerge: skipping invalid candidate", { candidate });
      continue;
    }

    const providerModels = upsertProviderModels(next.providers[candidate.provider]);
    const existingIdx = providerModels.models.findIndex((m: any) => m.id === candidate.id);

    if (existingIdx >= 0) {
      const existing: any = providerModels.models[existingIdx];
      if (isNewer(existing.last_checked, candidate.observedAt)) {
        providerModels.models[existingIdx] = {
          ...existing,
          name: candidate.name ?? existing.name ?? candidate.id,
          context_window: candidate.contextWindow ?? existing.context_window,
          capability_tags: candidate.capabilityTags ?? existing.capability_tags,
          capabilities: candidate.capabilities ?? existing.capabilities ?? [],
          last_checked: candidate.observedAt,
        };
      }
    } else {
      const base: any = {
        id: candidate.id,
        name: candidate.name ?? candidate.id,
        context_window: candidate.contextWindow ?? 128_000,
        capability_tags: candidate.capabilityTags,
        capabilities: candidate.capabilities ?? [],
        available: true,
        last_checked: candidate.observedAt,
      };

      // Add provider-specific required fields
      const cost: ModelCost = { input: 1.0, output: 2.0 }; // Placeholder costs

      if (candidate.provider === 'codex') {
        // CodexModel requires reasoning_levels and cost_per_mtok
        base.reasoning_levels = ['low', 'medium', 'high'];
        base.cost_per_mtok = cost;
      } else {
        // ClaudeModel, Gemini, O3 require max_output and cost_per_mtok
        base.max_output = Math.floor((candidate.contextWindow ?? 128_000) / 16);
        base.cost_per_mtok = cost;
      }

      providerModels.models.push(base);
    }

    next.providers[candidate.provider] = providerModels;
  }

  return next;
}
