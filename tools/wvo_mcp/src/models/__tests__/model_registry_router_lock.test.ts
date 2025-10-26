import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { ModelRegistry, type ProviderModels } from '../model_registry.js';

function createWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wvo-model-registry-'));
  return dir;
}

describe('ModelRegistry router lock enforcement', () => {
  it('drops disallowed models before persisting provider data', () => {
    const workspace = createWorkspace();
    const registry = new ModelRegistry(workspace);
    const payload: ProviderModels = {
      access_method: 'subscription',
      models: [
        {
          id: 'claude-haiku-4.5',
          name: 'Claude Haiku 4.5',
          context_window: 200000,
          max_output: 8192,
          cost_per_mtok: { input: 1, output: 2 },
          capabilities: ['reasoning'],
          available: true,
          subscription_tier: 'free',
        },
        {
          id: 'gpt-5-codex',
          name: 'GPT-5 Codex',
          context_window: 128000,
          max_output: 8192,
          cost_per_mtok: { input: 10, output: 20 },
          capabilities: ['coding'],
          available: true,
          subscription_tier: 'pro',
        },
      ],
    };

    try {
      registry.updateProvider('claude', payload);
      const provider = registry.getProviderModels('claude');
      expect(provider).toBeDefined();
      expect(provider?.models.map(model => (model as { id: string }).id)).toEqual(['claude-haiku-4.5']);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
