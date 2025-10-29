import { describe, it, expect } from 'vitest';
import { PromptCompiler } from '../../prompt/compiler';
import {
  formatPersonaForCompiler,
  canonicalizePersonaSpec,
  hashPersonaSpec,
  type PersonaSpec
} from '../compiler_adapter';

describe('PersonaSpec Canonicalization (IMP-22)', () => {
  describe('canonicalizePersonaSpec', () => {
    it('should produce deterministic output for same input', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner',
        domain_overlays: ['api', 'web'],
        skill_packs: ['typescript', 'vitest'],
        capabilities: ['code', 'research']
      };

      const canonical1 = canonicalizePersonaSpec(spec);
      const canonical2 = canonicalizePersonaSpec(spec);

      expect(canonical1).toBe(canonical2);
    });

    it('should be independent of object key order', () => {
      const spec1: PersonaSpec = {
        phase_role: 'planner',
        domain_overlays: ['api'],
        skill_packs: ['typescript'],
        capabilities: ['code']
      };

      const spec2: PersonaSpec = {
        capabilities: ['code'],
        skill_packs: ['typescript'],
        phase_role: 'planner',
        domain_overlays: ['api']
      };

      expect(canonicalizePersonaSpec(spec1)).toBe(canonicalizePersonaSpec(spec2));
    });

    it('should be independent of array element order', () => {
      const spec1: PersonaSpec = {
        phase_role: 'planner',
        domain_overlays: ['web', 'api', 'ml']
      };

      const spec2: PersonaSpec = {
        phase_role: 'planner',
        domain_overlays: ['api', 'ml', 'web']
      };

      expect(canonicalizePersonaSpec(spec1)).toBe(canonicalizePersonaSpec(spec2));
    });

    it('should handle empty spec', () => {
      const spec: PersonaSpec = {};
      const canonical = canonicalizePersonaSpec(spec);

      expect(canonical).toBe('{}');
    });

    it('should handle partial spec', () => {
      const spec: PersonaSpec = {
        phase_role: 'planner'
      };

      const canonical = canonicalizePersonaSpec(spec);
      const parsed = JSON.parse(canonical);

      expect(parsed).toEqual({ phase_role: 'planner' });
    });

    it('should skip undefined fields', () => {
      const spec: PersonaSpec = {
        phase_role: 'planner',
        domain_overlays: undefined,
        skill_packs: ['typescript']
      };

      const canonical = canonicalizePersonaSpec(spec);
      const parsed = JSON.parse(canonical);

      expect(parsed).toEqual({
        phase_role: 'planner',
        skill_packs: ['typescript']
      });
      expect(parsed.domain_overlays).toBeUndefined();
    });
  });

  describe('hashPersonaSpec', () => {
    it('should produce 64-character hex hash', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner',
        domain_overlays: ['api']
      };

      const hash = hashPersonaSpec(spec);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce same hash for same input', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert',
        domain_overlays: ['api', 'web']
      };

      const hash1 = hashPersonaSpec(spec);
      const hash2 = hashPersonaSpec(spec);

      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of key order', () => {
      const spec1: PersonaSpec = {
        phase_role: 'planner',
        domain_overlays: ['api']
      };

      const spec2: PersonaSpec = {
        domain_overlays: ['api'],
        phase_role: 'planner'
      };

      expect(hashPersonaSpec(spec1)).toBe(hashPersonaSpec(spec2));
    });

    it('should produce same hash regardless of array order', () => {
      const spec1: PersonaSpec = {
        domain_overlays: ['web', 'api']
      };

      const spec2: PersonaSpec = {
        domain_overlays: ['api', 'web']
      };

      expect(hashPersonaSpec(spec1)).toBe(hashPersonaSpec(spec2));
    });

    it('should produce different hash for different input', () => {
      const spec1: PersonaSpec = { phase_role: 'planner' };
      const spec2: PersonaSpec = { phase_role: 'reviewer' };

      const hash1 = hashPersonaSpec(spec1);
      const hash2 = hashPersonaSpec(spec2);

      expect(hash1).not.toBe(hash2);
    });

    it('should maintain hash stability over multiple iterations', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert',
        domain_overlays: ['api', 'web'],
        skill_packs: ['typescript']
      };

      const hashes: string[] = [];
      for (let i = 0; i < 100; i++) {
        hashes.push(hashPersonaSpec(spec));
      }

      const unique = new Set(hashes);
      expect(unique.size).toBe(1); // All hashes identical
    });
  });

  describe('formatPersonaForCompiler', () => {
    it('should return canonical JSON', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner',
        domain_overlays: ['api', 'web']
      };

      const formatted = formatPersonaForCompiler(spec);
      const parsed = JSON.parse(formatted);

      expect(parsed.phase_role).toBe('expert-planner');
      expect(parsed.domain_overlays).toEqual(['api', 'web']);
    });

    it('should be deterministic', () => {
      const spec: PersonaSpec = {
        phase_role: 'planner',
        skill_packs: ['typescript', 'vitest']
      };

      const formatted1 = formatPersonaForCompiler(spec);
      const formatted2 = formatPersonaForCompiler(spec);

      expect(formatted1).toBe(formatted2);
    });

    it('should handle empty spec', () => {
      const spec: PersonaSpec = {};
      const formatted = formatPersonaForCompiler(spec);

      expect(formatted).toBe('{}');
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
