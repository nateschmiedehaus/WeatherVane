import { describe, it, expect } from 'vitest';
import { PromptCompiler } from '../../prompt/compiler';
import { formatPersonaForCompiler, type PersonaSpec } from '../compiler_adapter';

describe('Compiler Adapter Integration (IMP-21-22-SYNC)', () => {
  describe('formatPersonaForCompiler', () => {
    it('should format complete persona spec', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner',
        domain_overlays: ['api', 'web'],
        skill_packs: ['typescript', 'vitest'],
        capabilities: ['code', 'research']
      };

      const formatted = formatPersonaForCompiler(spec);

      expect(formatted).toContain('Role: expert-planner');
      expect(formatted).toContain('Overlays: api, web');
      expect(formatted).toContain('Skills: typescript, vitest');
      expect(formatted).toContain('Capabilities: code, research');
    });

    it('should handle partial persona spec', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner'
      };

      const formatted = formatPersonaForCompiler(spec);

      expect(formatted).toBe('Role: expert-planner');
    });

    it('should handle empty persona spec', () => {
      const spec: PersonaSpec = {};
      const formatted = formatPersonaForCompiler(spec);

      expect(formatted).toBe('');
    });
  });

  describe('Integration with PromptCompiler', () => {
    it('should compile prompt with persona from adapter', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner',
        domain_overlays: ['api']
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile({
        system: 'You are Claude, an AI assistant.',
        phase: 'STRATEGIZE: Define objective and risks.',
        persona: formatPersonaForCompiler(spec)
      });

      expect(compiled.text).toContain('expert-planner');
      expect(compiled.text).toContain('api');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hashes for different personas', () => {
      const spec1: PersonaSpec = { phase_role: 'planner' };
      const spec2: PersonaSpec = { phase_role: 'reviewer' };

      const compiler = new PromptCompiler();

      const hash1 = compiler.compile({
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        persona: formatPersonaForCompiler(spec1)
      }).hash;

      const hash2 = compiler.compile({
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        persona: formatPersonaForCompiler(spec2)
      }).hash;

      expect(hash1).not.toBe(hash2);
    });

    it('should maintain hash stability with persona', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert',
        domain_overlays: ['api']
      };

      const compiler = new PromptCompiler();
      const hashes: string[] = [];

      for (let i = 0; i < 10; i++) {
        const compiled = compiler.compile({
          system: 'You are Claude.',
          phase: 'STRATEGIZE',
          persona: formatPersonaForCompiler(spec)
        });
        hashes.push(compiled.hash);
      }

      const unique = new Set(hashes);
      expect(unique.size).toBe(1); // All identical
    });
  });
});
