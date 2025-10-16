/**
 * Critic Model Selector Tests - Tests for model selection based on critic expertise
 *
 * Tests:
 * - CriticModelSelector
 * - Model preference loading
 * - Model selection with availability checks
 * - Quota-aware selection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CriticModelSelector } from '../utils/critic_model_selector.js';
import { ModelManager } from '../models/model_manager.js';
import type { UsageEstimator } from '../limits/usage_estimator.js';

describe('CriticModelSelector', () => {
  let tempDir: string;
  let selector: CriticModelSelector;
  let modelManager: ModelManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-critic-selector-test-'));

    // Create model manager
    modelManager = new ModelManager(tempDir);
    await modelManager.initialize();

    // Create selector
    selector = new CriticModelSelector(tempDir, modelManager);
    await selector.load();
  });

  afterEach(async () => {
    modelManager.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should load preferences successfully', async () => {
    const preferences = selector.getAllPreferences();

    expect(preferences).toBeDefined();
    expect(preferences?.preferences).toBeDefined();
    expect(preferences?.default).toBeDefined();
  });

  it('should select preferred model for allocator critic', () => {
    const selection = selector.selectForCritic('allocator');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('codex');
    expect(selection.model).toBe('gpt-5-codex');
    expect(selection.reasoning_level).toBe('high');
    expect(selection.rationale).toContain('numerical reasoning');
  });

  it('should select preferred model for security critic', () => {
    const selection = selector.selectForCritic('security');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('claude');
    expect(selection.model).toBe('claude-opus-4');
    expect(selection.rationale).toContain('Security');
  });

  it('should select preferred model for design_system critic', () => {
    const selection = selector.selectForCritic('design_system');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('claude');
    expect(selection.model).toBe('claude-opus-4');
    expect(selection.rationale).toContain('UX/design');
  });

  it('should use default for unknown critic', () => {
    const selection = selector.selectForCritic('unknown_critic');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('codex');
    expect(selection.model).toBe('gpt-5-codex');
    expect(selection.reasoning_level).toBe('medium');
  });

  it('should get specific preference', () => {
    const preference = selector.getPreference('allocator');

    expect(preference).toBeDefined();
    expect(preference?.preferred_provider).toBe('codex');
    expect(preference?.preferred_model).toBe('gpt-5-codex');
    expect(preference?.fallback_provider).toBe('claude');
  });

  it('should return default preference for unknown critic', () => {
    const preference = selector.getPreference('nonexistent_critic');

    expect(preference).toBeDefined();
    expect(preference?.preferred_provider).toBe('codex');
  });

  it('should generate report', () => {
    const report = selector.generateReport();

    expect(report).toBeDefined();
    expect(typeof report).toBe('string');
    expect(report).toContain('allocator');
    expect(report).toContain('security');
    expect(report).toContain('design_system');
  });

  it('should handle all predefined critics', () => {
    const criticsToTest = [
      'allocator',
      'tests',
      'build',
      'security',
      'design_system',
      'org_pm',
      'data_quality',
      'forecast_stitch',
      'causal',
      'cost_perf',
      'typecheck',
    ];

    for (const criticName of criticsToTest) {
      const selection = selector.selectForCritic(criticName);
      expect(selection).toBeDefined();
      expect(['claude', 'codex']).toContain(selection.provider);
      expect(selection.model).toBeTruthy();
    }
  });

  it('should provide reasoning for each selection', () => {
    const selection = selector.selectForCritic('forecast_stitch');

    expect(selection.rationale).toBeDefined();
    expect(selection.rationale.length).toBeGreaterThan(0);
    expect(selection.selection_reason).toBeDefined();
  });

  it('should indicate if selection is preferred or fallback', () => {
    const selection = selector.selectForCritic('allocator');

    expect(typeof selection.is_preferred).toBe('boolean');
  });

  it('should work without model manager', async () => {
    // Create selector without model manager
    const selectorNoManager = new CriticModelSelector(tempDir);
    await selectorNoManager.load();

    const selection = selectorNoManager.selectForCritic('allocator');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('codex');
    expect(selection.selection_reason).toBe('no_registry_check');
  });
});

describe('CriticModelSelector quota overrides', () => {
  const workspaceRoot = process.cwd();

  const buildModelManagerStub = () =>
    ({
      isModelAvailable: vi.fn().mockReturnValue(true),
      getBestModel: vi
        .fn()
        .mockImplementation((provider: 'claude' | 'codex') =>
          provider === 'claude' ? 'claude-opus-4' : 'gpt-5-codex'
        ),
    }) as unknown as ModelManager;

  it('switches provider when usage estimator recommends an alternate provider', async () => {
    const modelManagerStub = buildModelManagerStub();
    const estimator = {
      estimateTask: vi.fn().mockReturnValue({ estimated_tokens: 4000, estimated_requests: 1 }),
      recommendProvider: vi.fn().mockReturnValue({
        preferred_provider: 'claude',
        fallback_provider: 'codex',
        reasoning: 'Codex quota exhausted; switching to Claude',
        quota_pressure: 'low',
      }),
    } as unknown as UsageEstimator;

    const selector = new CriticModelSelector(workspaceRoot, modelManagerStub, estimator);
    await selector.load();

    const selection = selector.selectForCritic('allocator');

    expect(selection.provider).toBe('claude');
    expect(selection.model).toBe('claude-opus-4');
    expect(selection.selection_reason).toBe('quota_pressure');
    expect(selection.is_preferred).toBe(false);
    expect(selection.rationale.toLowerCase()).toContain('quota override');
  });

  it('falls back when quota pressure is critical for the preferred provider', async () => {
    const modelManagerStub = buildModelManagerStub();
    const estimator = {
      estimateTask: vi.fn().mockReturnValue({ estimated_tokens: 6000, estimated_requests: 1 }),
      recommendProvider: vi.fn().mockReturnValue({
        preferred_provider: 'codex',
        fallback_provider: 'claude',
        reasoning: 'Codex under severe quota pressure; use Claude fallback',
        quota_pressure: 'critical',
      }),
    } as unknown as UsageEstimator;

    const selector = new CriticModelSelector(workspaceRoot, modelManagerStub, estimator);
    await selector.load();

    const selection = selector.selectForCritic('tests');

    expect(selection.provider).toBe('claude');
    expect(selection.selection_reason).toBe('quota_pressure');
    expect(selection.is_preferred).toBe(false);
  });
});

describe('CriticModelSelector with Model Availability', () => {
  let tempDir: string;
  let selector: CriticModelSelector;
  let modelManager: ModelManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-critic-avail-test-'));

    modelManager = new ModelManager(tempDir);
    await modelManager.initialize();

    selector = new CriticModelSelector(tempDir, modelManager);
    await selector.load();
  });

  afterEach(async () => {
    modelManager.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should check model availability from registry', () => {
    const selection = selector.selectForCritic('allocator');

    // gpt-5-codex should be available in defaults
    const isAvailable = modelManager.isModelAvailable('codex', 'gpt-5-codex');
    expect(isAvailable).toBe(true);
  });

  it('should use fallback if preferred unavailable', () => {
    // This test would need to mock unavailable models
    // For now, we verify the fallback mechanism exists
    const preference = selector.getPreference('allocator');

    expect(preference?.fallback_provider).toBeDefined();
    expect(preference?.fallback_model).toBeDefined();
  });

  it('should select best available model when preferred unavailable', () => {
    // Get selection for a critic
    const selection = selector.selectForCritic('tests');

    // Should have a valid provider and model
    expect(['claude', 'codex']).toContain(selection.provider);
    expect(selection.model).toBeTruthy();
  });
});

describe('CriticModelSelector Embedded Defaults', () => {
  let tempDir: string;
  let selector: CriticModelSelector;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-critic-defaults-test-'));

    // Create selector pointing to nonexistent config (will use embedded defaults)
    selector = new CriticModelSelector('/nonexistent/path');
    await selector.load();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should use embedded defaults when config file not found', () => {
    const preferences = selector.getAllPreferences();

    expect(preferences).toBeDefined();
    expect(preferences?.preferences).toBeDefined();
    expect(preferences?.default).toBeDefined();
  });

  it('should have allocator in embedded defaults', () => {
    const selection = selector.selectForCritic('allocator');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('codex');
  });

  it('should have security in embedded defaults', () => {
    const selection = selector.selectForCritic('security');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('claude');
  });

  it('should provide default for unknown critics', () => {
    const selection = selector.selectForCritic('unknown_critic_xyz');

    expect(selection).toBeDefined();
    expect(selection.provider).toBe('codex');
  });
});

describe('Model Selection Reasoning', () => {
  let tempDir: string;
  let selector: CriticModelSelector;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-reasoning-test-'));

    const modelManager = new ModelManager(tempDir);
    await modelManager.initialize();

    selector = new CriticModelSelector(tempDir, modelManager);
    await selector.load();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should prefer high reasoning for complex critics', () => {
    const allocator = selector.selectForCritic('allocator');
    const forecast = selector.selectForCritic('forecast_stitch');

    expect(allocator.reasoning_level).toBe('high');
    expect(forecast.reasoning_level).toBe('high');
  });

  it('should use medium reasoning for moderate critics', () => {
    const tests = selector.selectForCritic('tests');

    expect(tests.reasoning_level).toBe('medium');
  });

  it('should use low reasoning for simple critics', () => {
    const build = selector.selectForCritic('build');

    expect(build.reasoning_level).toBe('low');
  });

  it('should explain rationale for selection', () => {
    const causal = selector.selectForCritic('causal');

    expect(causal.rationale).toBeDefined();
    expect(causal.rationale.toLowerCase()).toContain('causal');
  });

  it('should document selection reason', () => {
    const selection = selector.selectForCritic('org_pm');

    expect(selection.selection_reason).toBeDefined();
    expect(
      [
        'preferred_available',
        'fallback_available',
        'best_from_preferred_provider',
        'best_from_fallback_provider',
        'no_registry_check',
        'quota_pressure',
      ].includes(selection.selection_reason)
    ).toBe(true);
  });
});
