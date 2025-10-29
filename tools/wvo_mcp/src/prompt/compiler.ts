import { createHash } from 'crypto';

/**
 * Input slots for prompt compilation.
 *
 * @property system - Core system instructions (REQUIRED)
 * @property phase - Phase-specific role/instructions (REQUIRED)
 * @property domain - Domain context (e.g., 'api', 'web', 'ml') (OPTIONAL)
 * @property skills - Available methods/tools (OPTIONAL)
 * @property rubric - Quality criteria (OPTIONAL)
 * @property context - Task-specific context anchors (OPTIONAL)
 */
export interface PromptInput {
  system: string;
  phase: string;
  domain?: string;
  skills?: string;
  rubric?: string;
  context?: string;
}

/**
 * Compiled prompt with stable hash.
 *
 * @property text - Assembled prompt text
 * @property hash - SHA-256 hash of canonical form (64-character hex)
 * @property slots - Original input slots (for debugging)
 * @property compiledAt - ISO 8601 timestamp
 */
export interface CompiledPrompt {
  text: string;
  hash: string;
  slots: PromptInput;
  compiledAt: string;
}

/**
 * Error thrown during prompt compilation.
 *
 * @property code - Structured error code
 * @property input - Partial input for debugging (sanitized)
 */
export class CompilationError extends Error {
  constructor(
    message: string,
    public code: string,
    public input?: Partial<PromptInput>
  ) {
    super(message);
    this.name = 'CompilationError';
  }
}

/**
 * Prompt compiler with deterministic canonicalization and stable hash.
 *
 * Compiles prompts from typed slots (system, phase, domain, skills, rubric, context)
 * with deterministic canonicalization for stable SHA-256 hash.
 *
 * @example
 * ```typescript
 * const compiler = new PromptCompiler();
 * const compiled = compiler.compile({
 *   system: 'You are Claude, an AI assistant...',
 *   phase: 'STRATEGIZE: Define objective, KPIs, risks...',
 *   context: 'Task: IMP-21'
 * });
 * console.log(compiled.hash); // e4d909c290347e2ef4a8...
 * console.log(compiled.text); // Assembled prompt
 * ```
 */
export class PromptCompiler {
  /**
   * Compiles a prompt from typed slots with deterministic hash.
   *
   * @param input - Prompt slots (system, phase, domain, skills, rubric, context)
   * @returns Compiled prompt with assembled text and stable hash
   * @throws CompilationError if required slots missing or invalid types
   *
   * @example
   * ```typescript
   * const compiler = new PromptCompiler();
   * const compiled = compiler.compile({
   *   system: 'You are Claude...',
   *   phase: 'STRATEGIZE: Define...'
   * });
   * console.log(compiled.hash); // e4d909c2...
   * ```
   */
  public compile(input: PromptInput): CompiledPrompt {
    // Step 1: Validate input
    this.validateInput(input);

    // Step 2: Assemble text from slots
    const text = this.assembleText(input);

    // Step 3: Canonicalize for deterministic hash
    const canonical = this.canonicalize(input);

    // Step 4: Compute SHA-256 hash
    const hash = this.computeHash(canonical);

    // Step 5: Return compiled prompt
    return {
      text,
      hash,
      slots: input,
      compiledAt: new Date().toISOString(),
    };
  }

  /**
   * Validates that required slots are present and have correct types.
   *
   * @param input - Input to validate
   * @throws CompilationError if validation fails
   */
  private validateInput(input: PromptInput): void {
    // Check required slots
    if (!input.system || typeof input.system !== 'string') {
      throw new CompilationError(
        'Missing or invalid required slot: system (must be non-empty string)',
        'MISSING_REQUIRED_SLOT',
        { system: input.system }
      );
    }

    if (!input.phase || typeof input.phase !== 'string') {
      throw new CompilationError(
        'Missing or invalid required slot: phase (must be non-empty string)',
        'MISSING_REQUIRED_SLOT',
        { phase: input.phase }
      );
    }

    // Check optional slots have correct types if provided
    const optionalSlots = ['domain', 'skills', 'rubric', 'context'] as const;
    for (const slot of optionalSlots) {
      const value = input[slot];
      if (value !== undefined && typeof value !== 'string') {
        throw new CompilationError(
          `Invalid slot type: ${slot} (must be string if provided)`,
          'INVALID_SLOT_TYPE',
          { [slot]: value }
        );
      }
    }
  }

  /**
   * Assembles final prompt text from slots via simple string interpolation.
   *
   * @param input - Input slots
   * @returns Assembled prompt text
   */
  private assembleText(input: PromptInput): string {
    const parts: string[] = [input.system, input.phase];

    // Add optional slots if present
    if (input.domain) parts.push(`Domain: ${input.domain}`);
    if (input.skills) parts.push(`Skills: ${input.skills}`);
    if (input.rubric) parts.push(`Rubric: ${input.rubric}`);
    if (input.context) parts.push(`Context: ${input.context}`);

    return parts.join('\n\n');
  }

  /**
   * Canonicalizes input for deterministic hash.
   *
   * Algorithm:
   * 1. Deep clone input (prevent mutation)
   * 2. Recursively sort all object keys
   * 3. JSON.stringify with sorted keys
   *
   * This ensures same input → same canonical string → same hash.
   *
   * @param input - Input to canonicalize
   * @returns Canonical JSON string
   */
  private canonicalize(input: PromptInput): string {
    // Deep clone to prevent mutation
    const cloned = JSON.parse(JSON.stringify(input));

    // Recursively sort keys
    const sorted = this.sortKeys(cloned);

    // Deterministic JSON stringify
    return JSON.stringify(sorted);
  }

  /**
   * Recursively sorts object keys for deterministic serialization.
   *
   * @param obj - Object to sort
   * @returns Object with sorted keys
   */
  private sortKeys(obj: any): any {
    // Handle primitives and null
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Handle arrays (recurse on elements)
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortKeys(item));
    }

    // Handle objects (sort keys and recurse)
    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach(key => {
        sorted[key] = this.sortKeys(obj[key]);
      });

    return sorted;
  }

  /**
   * Computes SHA-256 hash of canonical form.
   *
   * @param canonical - Canonical JSON string
   * @returns 64-character hex string (SHA-256 hash)
   */
  private computeHash(canonical: string): string {
    return createHash('sha256')
      .update(canonical, 'utf8')
      .digest('hex');
  }
}

/**
 * Checks if prompt compiler should be used based on PROMPT_COMPILER env var.
 *
 * Flag values:
 * - 'off' (default): Don't use compiler
 * - 'observe': Use compiler (for IMP-24 gradual rollout)
 * - 'enforce': Use compiler (same as observe for now)
 *
 * @returns true if compiler should be used
 */
export function shouldUseCompiler(): boolean {
  const flag = process.env.PROMPT_COMPILER || 'off';
  return flag === 'observe' || flag === 'enforce';
}
