import { describe, it, expect } from 'vitest';
import { extractPersonaSignals } from '../feature_extractor.js';
import { computePersonaSpec } from '../routing_rules.js';

describe('persona routing', () => {
  it('defaults to phase role when no files provided', () => {
    const signals = extractPersonaSignals({ phase: 'verify' });
    const persona = computePersonaSpec(signals);
    expect(persona.phaseRole).toBe('verify');
    expect(persona.domainOverlays).toHaveLength(0);
  });

  it('adds orchestrator overlay for tools/wvo_mcp files', () => {
    const signals = extractPersonaSignals({ phase: 'implement', filePaths: ['tools/wvo_mcp/src/orchestrator/state_graph.ts'] });
    const persona = computePersonaSpec(signals);
    expect(persona.domainOverlays.some((o) => o.domain === 'orchestrator')).toBe(true);
  });

  it('adds ml overlay for apps/model files', () => {
    const signals = extractPersonaSignals({ phase: 'think', filePaths: ['apps/model/train.py'] });
    const persona = computePersonaSpec(signals);
    expect(persona.domainOverlays.some((o) => o.domain === 'ml')).toBe(true);
    expect(persona.modelCapabilities).toContain('reasoning_ultra');
  });
});
