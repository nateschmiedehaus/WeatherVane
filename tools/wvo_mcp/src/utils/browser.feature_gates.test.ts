import { describe, it, expect } from 'vitest';

import type { FeatureGatesReader } from '../orchestrator/feature_gates.js';
import type { LiveFlagsReader } from '../state/live_flags.js';

import { BrowserManager } from './browser.js';

function createFeatureGates(mode: 'pool' | 'none'): FeatureGatesReader {
  return {
    isCompactPromptMode: () => false,
    getPromptMode: () => 'verbose',
    isSandboxPoolEnabled: () => mode === 'pool',
    getSandboxMode: () => mode,
    getSchedulerMode: () => 'legacy',
    isAdminToolsEnabled: () => false,
    isUpgradeToolsEnabled: () => false,
    isRoutingToolsEnabled: () => false,
  };
}

function createLiveFlags(mode: 'pool' | 'none'): LiveFlagsReader {
  return {
    get: () =>
      ({
        SANDBOX_MODE: mode,
      }) as any,
    getValue: (key: string) => (key === 'SANDBOX_MODE' ? mode : 'none'),
  } as unknown as LiveFlagsReader;
}

describe('BrowserManager feature gating', () => {
  it('uses feature gates to enable sandbox pooling', () => {
    const manager = new BrowserManager();
    manager.setFeatureGates(createFeatureGates('pool'));

    expect(manager.getCurrentSandboxMode()).toBe('pool');
  });

  it('defaults to non-pooled mode when feature gates disable it', () => {
    const manager = new BrowserManager();
    manager.setFeatureGates(createFeatureGates('none'));

    expect(manager.getCurrentSandboxMode()).toBe('none');
  });

  it('falls back to live flags when feature gates are not provided', () => {
    const manager = new BrowserManager();
    manager.setLiveFlags(createLiveFlags('pool'));

    expect(manager.getCurrentSandboxMode()).toBe('pool');
  });

  it('feature gates override previously configured live flags', () => {
    const manager = new BrowserManager();
    manager.setLiveFlags(createLiveFlags('none'));
    manager.setFeatureGates(createFeatureGates('pool'));

    expect(manager.getCurrentSandboxMode()).toBe('pool');
  });
});
