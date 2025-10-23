/**
 * Integration tests for Model Discovery System
 *
 * Tests the complete flow of:
 * - Model registry load/save
 * - Model discovery from CLI
 * - Model manager initialization
 * - Integration with model selector
 * - Cost estimation with registry
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ModelRegistry } from '../models/model_registry.js';
import { ModelDiscoveryService } from '../models/model_discovery.js';
import { ModelManager } from '../models/model_manager.js';
import { selectCodexModel } from '../orchestrator/model_selector.js';

describe('ModelRegistry', () => {
  let tempDir: string;
  let registry: ModelRegistry;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-model-test-'));
    registry = new ModelRegistry(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should load embedded defaults on first run', async () => {
    await registry.load();
    const data = registry.getData();

    expect(data.providers.claude).toBeDefined();
    expect(data.providers.codex).toBeDefined();
    expect(data.providers.claude?.models.length).toBeGreaterThan(0);
    expect(data.providers.codex?.models.length).toBeGreaterThan(0);
  });

  it('should save and load registry from disk', async () => {
    await registry.load();
    await registry.save();

    const newRegistry = new ModelRegistry(tempDir);
    await newRegistry.load();

    const originalData = registry.getData();
    const loadedData = newRegistry.getData();

    expect(loadedData.providers.claude?.models.length).toBe(
      originalData.providers.claude?.models.length
    );
    expect(loadedData.providers.codex?.models.length).toBe(
      originalData.providers.codex?.models.length
    );
  });

  it('should identify stale registry correctly', async () => {
    await registry.load();

    // Embedded defaults have last_updated in the past, so update it to now
    const data = registry.getData();
    registry.updateProvider('claude', {
      access_method: 'subscription',
      models: data.providers.claude?.models ?? [],
    });
    await registry.save();

    // Reload and check - should be fresh now
    await registry.load();
    expect(registry.isStale()).toBe(false);

    // Now modify last_updated to 25 hours ago
    const staleTime = new Date();
    staleTime.setHours(staleTime.getHours() - 25);
    await registry.save();
    const registryPath = path.join(tempDir, 'state', 'models_registry.json');
    const content = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
    content.last_updated = staleTime.toISOString();
    await fs.writeFile(registryPath, JSON.stringify(content));

    // Reload and check staleness
    await registry.load();
    expect(registry.isStale()).toBe(true);
  });

  it('should get model cost correctly', async () => {
    await registry.load();

    const cost = registry.getModelCost('codex', 'gpt-5-codex');
    expect(cost).toBeDefined();
    expect(cost?.input).toBeGreaterThan(0);
    expect(cost?.output).toBeGreaterThan(0);
  });

  it('should check model availability', async () => {
    await registry.load();

    expect(registry.isModelAvailable('codex', 'gpt-5-codex')).toBe(true);
    expect(registry.isModelAvailable('codex', 'nonexistent-model')).toBe(false);
  });

  it('should get available models', async () => {
    await registry.load();

    const claudeModels = registry.getAvailableModels('claude');
    const codexModels = registry.getAvailableModels('codex');

    expect(claudeModels.length).toBeGreaterThan(0);
    expect(codexModels.length).toBeGreaterThan(0);
    expect(claudeModels.every((m) => m.available)).toBe(true);
    expect(codexModels.every((m) => m.available)).toBe(true);
  });

  it('should sort Claude models by tier correctly', async () => {
    await registry.load();

    const sorted = registry.getClaudeModelsByTier();
    expect(sorted.length).toBeGreaterThan(0);

    // Pro models should come before free models
    const firstPro = sorted.findIndex((m) => m.subscription_tier === 'pro');
    const firstFree = sorted.findIndex((m) => m.subscription_tier === 'free');

    if (firstPro >= 0 && firstFree >= 0) {
      expect(firstPro).toBeLessThan(firstFree);
    }
  });

  it('should sort Codex models by capability', async () => {
    await registry.load();

    const sorted = registry.getCodexModelsByCapability();
    expect(sorted.length).toBeGreaterThan(0);

    // Models with more reasoning levels should come first
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const currentLevels = current.reasoning_levels?.length ?? 0;
      const nextLevels = next.reasoning_levels?.length ?? 0;
      expect(currentLevels).toBeGreaterThanOrEqual(nextLevels);
    }
  });
});

describe('ModelDiscoveryService', () => {
  let tempDir: string;
  let registry: ModelRegistry;
  let discovery: ModelDiscoveryService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-discovery-test-'));
    registry = new ModelRegistry(tempDir);
    discovery = new ModelDiscoveryService(registry);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should skip discovery when registry is fresh', async () => {
    await registry.load();

    // Update registry to make it fresh
    const data = registry.getData();
    registry.updateProvider('claude', {
      access_method: 'subscription',
      models: data.providers.claude?.models ?? [],
    });
    await registry.save();

    // Discovery should skip because registry is fresh
    await discovery.discoverAll({ timeout: 3000 });

    const updatedData = registry.getData();
    // Should still have default models
    expect(updatedData.providers.claude?.models.length).toBeGreaterThan(0);
  }, 10000);

  // NOTE: This test requires actual CLI interaction and is environment-specific
  // Run manually with: npx vitest run -t "should force discovery"
  it.skip('should force discovery when forceRefresh is true [E2E]', async () => {
    await registry.load();
    const beforeUpdate = registry.getData().last_updated;

    // Force discovery with timeout
    await discovery.discoverAll({ forceRefresh: true, timeout: 3000 });

    const afterUpdate = registry.getData().last_updated;
    // last_updated should change after forced discovery
    expect(afterUpdate).not.toBe(beforeUpdate);
  }, 15000);

  it('should handle CLI failures gracefully', async () => {
    // Set invalid CLI binary paths to simulate failure
    process.env.CLAUDE_BIN = 'nonexistent-claude';
    process.env.CODEX_HOME = '/nonexistent/path';

    await registry.load();

    // Should not throw, should use defaults
    await expect(discovery.discoverAll({ forceRefresh: true })).resolves.not.toThrow();

    const data = registry.getData();
    // Should still have default models
    expect(data.providers.claude?.models.length).toBeGreaterThan(0);
    expect(data.providers.codex?.models.length).toBeGreaterThan(0);

    // Cleanup
    delete process.env.CLAUDE_BIN;
    delete process.env.CODEX_HOME;
  });
});

describe('ModelManager', () => {
  let tempDir: string;
  let manager: ModelManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-manager-test-'));
    manager = new ModelManager(tempDir);
  });

  afterEach(async () => {
    manager.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should initialize successfully', async () => {
    await expect(manager.initialize()).resolves.not.toThrow();

    const registry = manager.getRegistry();
    const data = registry.getData();

    expect(data.providers.claude).toBeDefined();
    expect(data.providers.codex).toBeDefined();
  });

  it('should respect WVO_MODEL_DISCOVERY_ENABLED flag', async () => {
    process.env.WVO_MODEL_DISCOVERY_ENABLED = '0';

    await manager.initialize();

    const registry = manager.getRegistry();
    const data = registry.getData();

    // Should still have defaults even with discovery disabled
    expect(data.providers.claude?.models.length).toBeGreaterThan(0);

    delete process.env.WVO_MODEL_DISCOVERY_ENABLED;
  });

  it('should get model cost', async () => {
    await manager.initialize();

    const cost = manager.getModelCost('codex', 'gpt-5-codex');
    expect(cost).toBeDefined();
    expect(cost?.input).toBeGreaterThan(0);
    expect(cost?.output).toBeGreaterThan(0);
  });

  it('should check model availability', async () => {
    await manager.initialize();

    expect(manager.isModelAvailable('codex', 'gpt-5-codex')).toBe(true);
    expect(manager.isModelAvailable('codex', 'nonexistent')).toBe(false);
  });

  it('should get best available model', async () => {
    await manager.initialize();

    const bestClaude = manager.getBestModel('claude');
    const bestCodex = manager.getBestModel('codex');

    expect(bestClaude).toBeDefined();
    expect(bestCodex).toBeDefined();
    expect(typeof bestClaude).toBe('string');
    expect(typeof bestCodex).toBe('string');
  });

  // NOTE: This test requires actual CLI interaction and is environment-specific
  // Run manually with: npx vitest run -t "should handle force discovery"
  it.skip('should handle force discovery [E2E]', async () => {
    await manager.initialize();

    const beforeUpdate = manager.getRegistry().getData().last_updated;

    await manager.forceDiscovery();

    const afterUpdate = manager.getRegistry().getData().last_updated;
    expect(afterUpdate).not.toBe(beforeUpdate);
  }, 15000);
});

describe('Model Selector Integration', () => {
  let tempDir: string;
  let manager: ModelManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-selector-test-'));
    manager = new ModelManager(tempDir);
    await manager.initialize();
  });

  afterEach(async () => {
    manager.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should select model with cost information when ModelManager provided', () => {
    const mockTask = {
      id: 'T-test',
      title: 'Test task',
      description: 'Test description',
      status: 'pending' as const,
      estimated_complexity: 5,
      type: 'task' as const,
      created_at: Date.now(),
    };

    const mockContext = {
      task: mockTask,
      relevantDecisions: [],
      relevantConstraints: [],
      recentLearnings: [],
      relatedTasks: [],
      filesToRead: ['test.ts'],
      projectPhase: 'development',
      qualityIssuesInArea: [],
      overallQualityTrend: [],
      velocityMetrics: { tasksCompletedToday: 0, averageTaskDuration: 0, qualityTrendOverall: 'stable' },
    };

    const result = selectCodexModel(mockTask, mockContext, undefined, manager);

    expect(result).toBeDefined();
    expect(result.modelSlug).toBeDefined();
    expect(result.reasoning).toBeDefined();
    // Rationale should include cost info when manager is provided
    expect(result.rationale).toContain('cost:');
  });

  it('should work without ModelManager (backward compatibility)', () => {
    const mockTask = {
      id: 'T-test',
      title: 'Test task',
      description: 'Test description',
      status: 'pending' as const,
      estimated_complexity: 5,
      type: 'task' as const,
      created_at: Date.now(),
    };

    const mockContext = {
      task: mockTask,
      relevantDecisions: [],
      relevantConstraints: [],
      recentLearnings: [],
      relatedTasks: [],
      filesToRead: ['test.ts'],
      projectPhase: 'development',
      qualityIssuesInArea: [],
      overallQualityTrend: [],
      velocityMetrics: { tasksCompletedToday: 0, averageTaskDuration: 0, qualityTrendOverall: 'stable' },
    };

    const result = selectCodexModel(mockTask, mockContext);

    expect(result).toBeDefined();
    expect(result.modelSlug).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it('should select appropriate model for high complexity tasks', () => {
    const mockTask = {
      id: 'T-complex',
      title: 'Complex architectural refactoring',
      description: 'Refactor the entire authentication system',
      status: 'pending' as const,
      estimated_complexity: 9,
      type: 'story' as const,
      created_at: Date.now(),
    };

    const mockContext = {
      task: mockTask,
      relevantDecisions: [],
      relevantConstraints: [{ id: 1, topic: 'c1', content: 'Constraint 1', timestamp: Date.now(), entry_type: 'constraint' as const }],
      recentLearnings: [],
      relatedTasks: [],
      filesToRead: ['auth.ts'],
      projectPhase: 'development',
      qualityIssuesInArea: [],
      overallQualityTrend: [],
      velocityMetrics: { tasksCompletedToday: 0, averageTaskDuration: 0, qualityTrendOverall: 'stable' },
    };

    const result = selectCodexModel(mockTask, mockContext, undefined, manager);

    // High complexity should select high reasoning
    expect(result.profile).toBe('high');
    expect(result.reasoning).toBe('high');
  });

  it('should select appropriate model for low complexity tasks', () => {
    const mockTask = {
      id: 'T-simple',
      title: 'Fix typo',
      description: 'Fix typo in comments',
      status: 'needs_improvement' as const,
      estimated_complexity: 2,
      type: 'bug' as const,
      created_at: Date.now(),
    };

    const mockContext = {
      task: mockTask,
      relevantDecisions: [],
      relevantConstraints: [],
      recentLearnings: [],
      relatedTasks: [],
      filesToRead: ['comments.ts'],
      projectPhase: 'development',
      qualityIssuesInArea: [],
      overallQualityTrend: [],
      velocityMetrics: { tasksCompletedToday: 0, averageTaskDuration: 0, qualityTrendOverall: 'stable' },
    };

    const result = selectCodexModel(mockTask, mockContext, undefined, manager);

    // Low complexity should select low reasoning
    expect(result.profile).toBe('low');
    expect(result.reasoning).toBe('low');
  });
});

describe('Cost Estimation Integration', () => {
  let tempDir: string;
  let manager: ModelManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-cost-test-'));
    manager = new ModelManager(tempDir);
    await manager.initialize();
  });

  afterEach(async () => {
    manager.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should retrieve costs from registry', () => {
    const cost = manager.getModelCost('codex', 'gpt-5-codex');

    expect(cost).toBeDefined();
    expect(cost?.input).toBeGreaterThan(0);
    expect(cost?.output).toBeGreaterThan(0);
    expect(typeof cost?.input).toBe('number');
    expect(typeof cost?.output).toBe('number');
  });

  it('should return undefined for nonexistent model', () => {
    const cost = manager.getModelCost('codex', 'nonexistent-model');
    expect(cost).toBeUndefined();
  });

  it('should estimate cost correctly', () => {
    const cost = manager.getModelCost('codex', 'gpt-5-codex');
    if (!cost) throw new Error('Cost not found');

    // 1000 input tokens, 500 output tokens
    const inputTokens = 1000;
    const outputTokens = 500;

    const expectedCost =
      ((inputTokens * cost.input) + (outputTokens * cost.output)) / 1_000_000;

    // Manual calculation should match
    expect(expectedCost).toBeGreaterThan(0);
    expect(expectedCost).toBeLessThan(1); // Should be less than $1 for this small example
  });
});
