import { describe, it, expect } from 'vitest';
import {
  PromptCompiler,
  CompilationError,
  type PromptInput,
  type CompiledPrompt,
} from '../compiler';

describe('PromptCompiler', () => {
  describe('Golden Tests - Baseline Prompts', () => {
    it('should compile STRATEGIZE baseline (system + phase + context)', () => {
      const input: PromptInput = {
        system: 'You are Claude, an AI assistant for software engineering.',
        phase: 'STRATEGIZE: Define objective, identify top 2 risks, set KPIs, and link to purpose.',
        context: 'Task: IMP-21 - Prompt Compiler',
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      // Verify text contains key components
      expect(compiled.text).toContain('STRATEGIZE');
      expect(compiled.text).toContain('objective');
      expect(compiled.text).toContain('IMP-21');

      // Verify hash format (64-char hex)
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);

      // Verify metadata
      expect(compiled.slots).toEqual(input);
      expect(compiled.compiledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should compile SPEC baseline (system + phase + rubric)', () => {
      const input: PromptInput = {
        system: 'You are Claude, an AI assistant for software engineering.',
        phase: 'SPEC: Define acceptance criteria, IO schemas, and verification mapping.',
        rubric: 'All acceptance criteria must be verifiable with automated tests.',
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      expect(compiled.text).toContain('SPEC');
      expect(compiled.text).toContain('acceptance criteria');
      expect(compiled.text).toContain('Rubric: All acceptance criteria');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should compile IMPLEMENT baseline (system + phase + domain + skills)', () => {
      const input: PromptInput = {
        system: 'You are Claude, an AI assistant for software engineering.',
        phase: 'IMPLEMENT: Build the solution according to SPEC and PLAN.',
        domain: 'api',
        skills: 'TypeScript, Node.js, Vitest',
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      expect(compiled.text).toContain('IMPLEMENT');
      expect(compiled.text).toContain('Domain: api');
      expect(compiled.text).toContain('Skills: TypeScript, Node.js, Vitest');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should compile VERIFY baseline (system + phase + rubric)', () => {
      const input: PromptInput = {
        system: 'You are Claude, an AI assistant for software engineering.',
        phase: 'VERIFY: Run all tests, benchmarks, and validate acceptance criteria.',
        rubric: 'All tests must pass, performance budgets must be met.',
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      expect(compiled.text).toContain('VERIFY');
      expect(compiled.text).toContain('tests');
      expect(compiled.text).toContain('Rubric: All tests must pass');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should compile minimal baseline (system only)', () => {
      const input: PromptInput = {
        system: 'You are Claude, an AI assistant.',
        phase: 'General purpose task.',
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      expect(compiled.text).toBe('You are Claude, an AI assistant.\n\nGeneral purpose task.');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Hash Stability Test (AC2)', () => {
    it('should produce identical hash across 100 runs (determinism)', () => {
      const input: PromptInput = {
        phase: 'STRATEGIZE: Define objective, KPIs, risks.',
        system: 'You are Claude, an AI assistant.',
        domain: 'api',
      };

      const compiler = new PromptCompiler();
      const hashes: string[] = [];

      for (let i = 0; i < 100; i++) {
        const compiled = compiler.compile(input);
        hashes.push(compiled.hash);
      }

      // All hashes should be identical
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
      expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce same hash regardless of object key order', () => {
      const input1: PromptInput = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        domain: 'api',
        context: 'Task 1',
      };

      // Same data, different key order
      const input2: PromptInput = {
        context: 'Task 1',
        phase: 'STRATEGIZE',
        system: 'You are Claude.',
        domain: 'api',
      };

      const compiler = new PromptCompiler();
      const hash1 = compiler.compile(input1).hash;
      const hash2 = compiler.compile(input2).hash;

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different inputs', () => {
      const input1: PromptInput = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
      };

      const input2: PromptInput = {
        system: 'You are Claude.',
        phase: 'SPEC',
      };

      const compiler = new PromptCompiler();
      const hash1 = compiler.compile(input1).hash;
      const hash2 = compiler.compile(input2).hash;

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Error Handling (AC6)', () => {
    it('should throw CompilationError for missing system slot', () => {
      const input = {
        phase: 'STRATEGIZE',
      } as any;

      const compiler = new PromptCompiler();

      expect(() => compiler.compile(input)).toThrow(CompilationError);
      expect(() => compiler.compile(input)).toThrow('Missing or invalid required slot: system');
    });

    it('should throw CompilationError for missing phase slot', () => {
      const input = {
        system: 'You are Claude.',
      } as any;

      const compiler = new PromptCompiler();

      expect(() => compiler.compile(input)).toThrow(CompilationError);
      expect(() => compiler.compile(input)).toThrow('Missing or invalid required slot: phase');
    });

    it('should throw CompilationError for invalid slot type', () => {
      const input = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        domain: 123, // Invalid: should be string
      } as any;

      const compiler = new PromptCompiler();

      expect(() => compiler.compile(input)).toThrow(CompilationError);
      expect(() => compiler.compile(input)).toThrow('Invalid slot type: domain');
    });

    it('should include error code in CompilationError', () => {
      const input = {
        phase: 'STRATEGIZE',
      } as any;

      const compiler = new PromptCompiler();

      try {
        compiler.compile(input);
        expect.fail('Should have thrown CompilationError');
      } catch (error) {
        expect(error).toBeInstanceOf(CompilationError);
        const compError = error as CompilationError;
        expect(compError.code).toBe('MISSING_REQUIRED_SLOT');
        expect(compError.name).toBe('CompilationError');
      }
    });
  });

  describe('Empty Optional Slots', () => {
    it('should handle empty optional slots correctly', () => {
      const input: PromptInput = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        domain: undefined,
        skills: undefined,
        rubric: undefined,
        context: undefined,
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      // Should only have system and phase (no optional slots)
      expect(compiled.text).toBe('You are Claude.\n\nSTRATEGIZE');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Text Assembly', () => {
    it('should assemble text with all slots in correct order', () => {
      const input: PromptInput = {
        system: 'System prompt',
        phase: 'Phase instructions',
        domain: 'api',
        skills: 'TypeScript',
        rubric: 'Quality criteria',
        context: 'Task context',
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      const expectedText = [
        'System prompt',
        'Phase instructions',
        'Domain: api',
        'Skills: TypeScript',
        'Rubric: Quality criteria',
        'Context: Task context',
      ].join('\n\n');

      expect(compiled.text).toBe(expectedText);
    });
  });

  describe('Immutability', () => {
    it('should not mutate input object', () => {
      const input: PromptInput = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        domain: 'api',
      };

      const inputCopy = JSON.parse(JSON.stringify(input));

      const compiler = new PromptCompiler();
      compiler.compile(input);

      expect(input).toEqual(inputCopy);
    });
  });

  describe('Persona Slot (IMP-22 Integration)', () => {
    it('should compile with persona slot', () => {
      const input: PromptInput = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        persona: 'Role: expert-planner | Skills: typescript'
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      expect(compiled.text).toContain('Persona: Role: expert-planner');
      expect(compiled.text).toContain('typescript');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should compile without persona slot (backward compat)', () => {
      const input: PromptInput = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE'
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile(input);

      expect(compiled.text).not.toContain('Persona:');
      expect(compiled.text).toBe('You are Claude.\n\nSTRATEGIZE');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should change hash when persona changes', () => {
      const compiler = new PromptCompiler();

      const hash1 = compiler.compile({
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        persona: 'Role: planner'
      }).hash;

      const hash2 = compiler.compile({
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        persona: 'Role: reviewer'
      }).hash;

      expect(hash1).not.toBe(hash2);
    });

    it('should maintain hash stability with persona', () => {
      const input: PromptInput = {
        system: 'You are Claude.',
        phase: 'STRATEGIZE',
        persona: 'Role: expert'
      };

      const compiler = new PromptCompiler();
      const hashes: string[] = [];

      for (let i = 0; i < 10; i++) {
        hashes.push(compiler.compile(input).hash);
      }

      const unique = new Set(hashes);
      expect(unique.size).toBe(1); // All identical
    });
  });
});

describe('Feature Flag', () => {
  it('should return false when PROMPT_COMPILER is off', async () => {
    const originalFlag = process.env.PROMPT_COMPILER;
    process.env.PROMPT_COMPILER = 'off';

    // Dynamic import to get fresh module with new env var
    const { shouldUseCompiler } = await import('../compiler.js?t=' + Date.now());
    expect(shouldUseCompiler()).toBe(false);

    process.env.PROMPT_COMPILER = originalFlag;
  });

  it('should return true when PROMPT_COMPILER is observe', async () => {
    const originalFlag = process.env.PROMPT_COMPILER;
    process.env.PROMPT_COMPILER = 'observe';

    const { shouldUseCompiler } = await import('../compiler.js?t=' + Date.now());
    expect(shouldUseCompiler()).toBe(true);

    process.env.PROMPT_COMPILER = originalFlag;
  });

  it('should return true when PROMPT_COMPILER is enforce', async () => {
    const originalFlag = process.env.PROMPT_COMPILER;
    process.env.PROMPT_COMPILER = 'enforce';

    const { shouldUseCompiler } = await import('../compiler.js?t=' + Date.now());
    expect(shouldUseCompiler()).toBe(true);

    process.env.PROMPT_COMPILER = originalFlag;
  });

  it('should default to false when PROMPT_COMPILER is not set', async () => {
    const originalFlag = process.env.PROMPT_COMPILER;
    delete process.env.PROMPT_COMPILER;

    const { shouldUseCompiler } = await import('../compiler.js?t=' + Date.now());
    expect(shouldUseCompiler()).toBe(false);

    process.env.PROMPT_COMPILER = originalFlag;
  });
});
