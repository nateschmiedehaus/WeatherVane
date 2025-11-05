import { describe, it, expect } from 'vitest';
import { ContextAssembler } from './context_assembler.js';
import type { FeatureGatesReader } from './feature_gates.js';
import type { StateMachine } from './state_machine.js';
import type { LiveFlagsReader } from '../state/live_flags.js';

const stateMachineStub = {} as unknown as StateMachine;

function createFeatureGates(mode: 'compact' | 'verbose'): FeatureGatesReader {
  return {
    isCompactPromptMode: () => mode === 'compact',
    getPromptMode: () => mode,
    isSandboxPoolEnabled: () => false,
    getSandboxMode: () => 'none',
    getSchedulerMode: () => 'legacy',
    isAdminToolsEnabled: () => false,
    isUpgradeToolsEnabled: () => false,
    isRoutingToolsEnabled: () => false,
    isOutcomeLoggingEnabled: () => true,
  };
}

describe('ContextAssembler feature gating', () => {
  it('limits referenced files when compact prompt mode is enabled via feature gates', () => {
    const assembler = new ContextAssembler(stateMachineStub, process.cwd(), {
      featureGates: createFeatureGates('compact'),
    });

    const maxFiles = (assembler as unknown as { maxFilesToReference(): number }).maxFilesToReference();
    expect(maxFiles).toBe(3);
  });

  it('uses verbose defaults when compact mode is disabled via feature gates', () => {
    const assembler = new ContextAssembler(stateMachineStub, process.cwd(), {
      featureGates: createFeatureGates('verbose'),
    });

    const maxFiles = (assembler as unknown as { maxFilesToReference(): number }).maxFilesToReference();
    expect(maxFiles).toBe(5);
  });

  it('falls back to live flags when feature gates are not supplied', () => {
    const liveFlags: LiveFlagsReader = {
      get: () =>
        ({
          PROMPT_MODE: 'compact',
        }) as any,
      getValue: (key: string) => (key === 'PROMPT_MODE' ? ('compact' as const) : ('legacy' as const)),
    } as unknown as LiveFlagsReader;

    const assembler = new ContextAssembler(stateMachineStub, process.cwd(), {
      liveFlags,
    });

    const maxFiles = (assembler as unknown as { maxFilesToReference(): number }).maxFilesToReference();
    expect(maxFiles).toBe(3);
  });
});
