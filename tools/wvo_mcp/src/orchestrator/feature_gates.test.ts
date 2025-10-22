import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureGates } from './feature_gates.js';
import type { LiveFlagsReader } from '../state/live_flags.js';

describe('FeatureGates', () => {
  let mockLiveFlags: LiveFlagsReader;

  beforeEach(() => {
    // Create a mock that supports all flag types
    const flagValues = new Map<string, string>();
    mockLiveFlags = {
      get: () => ({
        PROMPT_MODE: 'compact',
        SANDBOX_MODE: 'none',
        SCHEDULER_MODE: 'legacy',
        SELECTIVE_TESTS: '0',
        DANGER_GATES: '0',
        MO_ENGINE: '0',
        OTEL_ENABLED: '0',
        UI_ENABLED: '0',
        RESEARCH_LAYER: '1',
        INTELLIGENT_CRITICS: '1',
        EFFICIENT_OPERATIONS: '1',
        RESEARCH_TRIGGER_SENSITIVITY: '0.5',
        CRITIC_INTELLIGENCE_LEVEL: '2',
        CRITIC_REPUTATION: '0',
        EVIDENCE_LINKING: '0',
        VELOCITY_TRACKING: '0',
        CONSENSUS_ENGINE: '1',
        DISABLE_NEW: '0',
      }),
      getValue: (key: string) => {
        switch (key) {
          case 'PROMPT_MODE':
            return (flagValues.get(key) || 'compact') as string;
          case 'SANDBOX_MODE':
            return (flagValues.get(key) || 'none') as string;
          case 'SCHEDULER_MODE':
            return (flagValues.get(key) || 'legacy') as string;
          case 'SELECTIVE_TESTS':
            return (flagValues.get(key) || '0') as string;
          case 'DANGER_GATES':
            return (flagValues.get(key) || '0') as string;
          case 'MO_ENGINE':
            return (flagValues.get(key) || '0') as string;
          case 'OTEL_ENABLED':
            return (flagValues.get(key) || '0') as string;
          case 'UI_ENABLED':
            return (flagValues.get(key) || '0') as string;
          case 'RESEARCH_LAYER':
            return (flagValues.get(key) || '1') as string;
          case 'INTELLIGENT_CRITICS':
            return (flagValues.get(key) || '1') as string;
          case 'EFFICIENT_OPERATIONS':
            return (flagValues.get(key) || '1') as string;
          case 'RESEARCH_TRIGGER_SENSITIVITY':
            return (flagValues.get(key) || '0.5') as string;
          case 'CRITIC_INTELLIGENCE_LEVEL':
            return (flagValues.get(key) || '2') as string;
          case 'CRITIC_REPUTATION':
            return (flagValues.get(key) || '0') as string;
          case 'EVIDENCE_LINKING':
            return (flagValues.get(key) || '0') as string;
          case 'VELOCITY_TRACKING':
            return (flagValues.get(key) || '0') as string;
          case 'CONSENSUS_ENGINE':
            return (flagValues.get(key) || '1') as string;
          case 'DISABLE_NEW':
            return (flagValues.get(key) || '0') as string;
          default:
            return '';
        }
      },
    } as unknown as LiveFlagsReader;
  });

  describe('PROMPT_MODE gate', () => {
    it('should default to compact mode', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isCompactPromptMode()).toBe(true);
      expect(gates.getPromptMode()).toBe('compact');
    });

    it('should detect verbose mode', () => {
      const mockVerbose: LiveFlagsReader = {
        getValue: (key: string) => (key === 'PROMPT_MODE' ? 'verbose' : ''),
      } as any;
      const gates = new FeatureGates(mockVerbose);
      expect(gates.isCompactPromptMode()).toBe(false);
      expect(gates.getPromptMode()).toBe('verbose');
    });
  });

  describe('SANDBOX_MODE gate', () => {
    it('should default to none (no pooling)', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isSandboxPoolEnabled()).toBe(false);
      expect(gates.getSandboxMode()).toBe('none');
    });

    it('should detect pool mode', () => {
      const mockPool: LiveFlagsReader = {
        getValue: (key: string) => (key === 'SANDBOX_MODE' ? 'pool' : ''),
      } as any;
      const gates = new FeatureGates(mockPool);
      expect(gates.isSandboxPoolEnabled()).toBe(true);
      expect(gates.getSandboxMode()).toBe('pool');
    });
  });

  describe('SCHEDULER_MODE gate', () => {
    it('should default to legacy mode', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isWsjfSchedulerEnabled()).toBe(false);
      expect(gates.getSchedulerMode()).toBe('legacy');
    });

    it('should detect WSJF mode', () => {
      const mockWsjf: LiveFlagsReader = {
        getValue: (key: string) => (key === 'SCHEDULER_MODE' ? 'wsjf' : ''),
      } as any;
      const gates = new FeatureGates(mockWsjf);
      expect(gates.isWsjfSchedulerEnabled()).toBe(true);
      expect(gates.getSchedulerMode()).toBe('wsjf');
    });
  });

  describe('SELECTIVE_TESTS gate', () => {
    it('should default to disabled (all tests)', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isSelectiveTestingEnabled()).toBe(false);
    });

    it('should detect enabled state', () => {
      const mockEnabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'SELECTIVE_TESTS' ? '1' : ''),
      } as any;
      const gates = new FeatureGates(mockEnabled);
      expect(gates.isSelectiveTestingEnabled()).toBe(true);
    });
  });

  describe('DANGER_GATES gate', () => {
    it('should default to disabled (relaxed mode)', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isDangerGatesEnabled()).toBe(false);
    });

    it('should detect enabled state', () => {
      const mockEnabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'DANGER_GATES' ? '1' : ''),
      } as any;
      const gates = new FeatureGates(mockEnabled);
      expect(gates.isDangerGatesEnabled()).toBe(true);
    });
  });

  describe('MO_ENGINE gate', () => {
    it('should default to disabled', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isMoEngineEnabled()).toBe(false);
    });

    it('should detect enabled state', () => {
      const mockEnabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'MO_ENGINE' ? '1' : ''),
      } as any;
      const gates = new FeatureGates(mockEnabled);
      expect(gates.isMoEngineEnabled()).toBe(true);
    });
  });

  describe('OTEL_ENABLED gate', () => {
    it('should default to disabled', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isOtelEnabled()).toBe(false);
    });

    it('should detect enabled state', () => {
      const mockEnabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'OTEL_ENABLED' ? '1' : '0'),
      } as any;
      const gates = new FeatureGates(mockEnabled);
      expect(gates.isOtelEnabled()).toBe(true);
    });
  });

  describe('RESEARCH_LAYER gate', () => {
    it('should default to enabled', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isResearchLayerEnabled()).toBe(true);
    });

    it('should detect disabled state', () => {
      const mockDisabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'RESEARCH_LAYER' ? '0' : '1'),
      } as any;
      const gates = new FeatureGates(mockDisabled);
      expect(gates.isResearchLayerEnabled()).toBe(false);
    });
  });

  describe('EFFICIENT_OPERATIONS gate', () => {
    it('should default to enabled', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isEfficientOperationsEnabled()).toBe(true);
    });

    it('should detect disabled state', () => {
      const mockDisabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'EFFICIENT_OPERATIONS' ? '0' : '1'),
      } as any;
      const gates = new FeatureGates(mockDisabled);
      expect(gates.isEfficientOperationsEnabled()).toBe(false);
    });
  });

  describe('Numeric gates (sensitivity, intelligence level)', () => {
    it('should parse research trigger sensitivity', () => {
      const mockSensitivity: LiveFlagsReader = {
        getValue: (key: string) => {
          if (key === 'RESEARCH_TRIGGER_SENSITIVITY') return '0.75';
          return '';
        },
      } as any;
      const gates = new FeatureGates(mockSensitivity);
      expect(gates.getResearchTriggerSensitivity()).toBe(0.75);
    });

    it('should parse critic intelligence level', () => {
      const mockLevel: LiveFlagsReader = {
        getValue: (key: string) => {
          if (key === 'CRITIC_INTELLIGENCE_LEVEL') return '3';
          return '';
        },
      } as any;
      const gates = new FeatureGates(mockLevel);
      expect(gates.getCriticIntelligenceLevel()).toBe(3);
    });

    it('should default to 0.5 for invalid sensitivity', () => {
      const mockInvalid: LiveFlagsReader = {
        getValue: (key: string) => (key === 'RESEARCH_TRIGGER_SENSITIVITY' ? 'invalid' : ''),
      } as any;
      const gates = new FeatureGates(mockInvalid);
      expect(gates.getResearchTriggerSensitivity()).toBe(0.5);
    });

    it('should default to 2 for invalid intelligence level', () => {
      const mockInvalid: LiveFlagsReader = {
        getValue: (key: string) => (key === 'CRITIC_INTELLIGENCE_LEVEL' ? 'invalid' : ''),
      } as any;
      const gates = new FeatureGates(mockInvalid);
      expect(gates.getCriticIntelligenceLevel()).toBe(2);
    });
  });

  describe('Emergency flag gates', () => {
    it('should detect disabled new features flag', () => {
      const mockDisabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'DISABLE_NEW' ? '1' : '0'),
      } as any;
      const gates = new FeatureGates(mockDisabled);
      expect(gates.shouldDisableNewFeatures()).toBe(true);
    });

    it('should default to allowing new features', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.shouldDisableNewFeatures()).toBe(false);
    });
  });

  describe('Consensus and reputation gates', () => {
    it('should detect consensus engine enabled state', () => {
      const gates = new FeatureGates(mockLiveFlags);
      expect(gates.isConsensusEngineEnabled()).toBe(true);
    });

    it('should detect critic reputation enabled state', () => {
      const mockEnabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'CRITIC_REPUTATION' ? '1' : '0'),
      } as any;
      const gates = new FeatureGates(mockEnabled);
      expect(gates.isCriticReputationEnabled()).toBe(true);
    });

    it('should detect evidence linking enabled state', () => {
      const mockEnabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'EVIDENCE_LINKING' ? '1' : '0'),
      } as any;
      const gates = new FeatureGates(mockEnabled);
      expect(gates.isEvidenceLinkingEnabled()).toBe(true);
    });

    it('should detect velocity tracking enabled state', () => {
      const mockEnabled: LiveFlagsReader = {
        getValue: (key: string) => (key === 'VELOCITY_TRACKING' ? '1' : '0'),
      } as any;
      const gates = new FeatureGates(mockEnabled);
      expect(gates.isVelocityTrackingEnabled()).toBe(true);
    });
  });

  describe('getSnapshot', () => {
    it('should return all flag states', () => {
      const mockSnapshot: LiveFlagsReader = {
        getValue: (key: string) => {
          const values: Record<string, string> = {
            PROMPT_MODE: 'verbose',
            SANDBOX_MODE: 'pool',
            SCHEDULER_MODE: 'wsjf',
            SELECTIVE_TESTS: '1',
            DANGER_GATES: '1',
            MO_ENGINE: '1',
            OTEL_ENABLED: '1',
            UI_ENABLED: '1',
            RESEARCH_LAYER: '0',
            INTELLIGENT_CRITICS: '0',
            EFFICIENT_OPERATIONS: '0',
            RESEARCH_TRIGGER_SENSITIVITY: '0.8',
            CRITIC_INTELLIGENCE_LEVEL: '3',
            CRITIC_REPUTATION: '1',
            EVIDENCE_LINKING: '1',
            VELOCITY_TRACKING: '1',
            CONSENSUS_ENGINE: '0',
            DISABLE_NEW: '1',
          };
          return values[key] || '';
        },
      } as any;

      const gates = new FeatureGates(mockSnapshot);
      const snapshot = gates.getSnapshot();

      expect(snapshot).toMatchObject({
        promptMode: 'verbose',
        sandboxMode: 'pool',
        schedulerMode: 'wsjf',
        selectiveTests: true,
        dangerGates: true,
        moEngine: true,
        otelEnabled: true,
        uiEnabled: true,
        researchLayerEnabled: false,
        intelligentCriticsEnabled: false,
        efficientOperationsEnabled: false,
        researchTriggerSensitivity: 0.8,
        criticIntelligenceLevel: 3,
        criticReputationEnabled: true,
        evidenceLinkingEnabled: true,
        velocityTrackingEnabled: true,
        consensusEngineEnabled: false,
        disableNewFeatures: true,
      });
    });
  });

  describe('dynamic flag updates', () => {
    it('should reflect updated flag values on each call', () => {
      const flagMap = new Map<string, string>();
      const dynamicFlags: LiveFlagsReader = {
        getValue: (key: string) => flagMap.get(key) || '',
      } as any;

      const gates = new FeatureGates(dynamicFlags);

      // Start with compact mode
      flagMap.set('PROMPT_MODE', 'compact');
      expect(gates.isCompactPromptMode()).toBe(true);

      // Switch to verbose mode
      flagMap.set('PROMPT_MODE', 'verbose');
      expect(gates.isCompactPromptMode()).toBe(false);

      // Switch back
      flagMap.set('PROMPT_MODE', 'compact');
      expect(gates.isCompactPromptMode()).toBe(true);
    });

    it('should reflect updated numeric flag values', () => {
      const flagMap = new Map<string, string>();
      const dynamicFlags: LiveFlagsReader = {
        getValue: (key: string) => flagMap.get(key) || '',
      } as any;

      const gates = new FeatureGates(dynamicFlags);

      flagMap.set('RESEARCH_TRIGGER_SENSITIVITY', '0.3');
      expect(gates.getResearchTriggerSensitivity()).toBe(0.3);

      flagMap.set('RESEARCH_TRIGGER_SENSITIVITY', '0.9');
      expect(gates.getResearchTriggerSensitivity()).toBe(0.9);
    });
  });
});
