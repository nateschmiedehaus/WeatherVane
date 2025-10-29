/**
 * Compiler adapter for PersonaSpec integration (IMP-22)
 *
 * This module provides canonicalization, hashing, and compiler integration
 * for PersonaSpec. It ensures deterministic serialization for stable hashing
 * and drift detection.
 *
 * @module compiler_adapter
 */

import { createHash } from 'crypto';

/**
 * PersonaSpec structure for persona-aware prompt compilation.
 *
 * All fields are optional to support partial persona specifications.
 * Arrays are sorted deterministically during canonicalization.
 */
export interface PersonaSpec {
  phase_role?: string;           // Role for this phase (e.g., 'expert-planner')
  domain_overlays?: string[];    // Domain-specific content (e.g., ['api', 'web'])
  skill_packs?: string[];        // Available skill packs (e.g., ['typescript', 'vitest'])
  capabilities?: string[];       // Capabilities enabled (e.g., ['code', 'research'])
}

/**
 * Canonicalizes PersonaSpec into deterministic JSON string.
 *
 * Ensures stable serialization by:
 * 1. Sorting all object keys alphabetically
 * 2. Sorting all array elements alphabetically
 * 3. Removing undefined fields
 * 4. Using JSON.stringify for consistent output
 *
 * Same input → same canonical string → same hash.
 *
 * @param spec - PersonaSpec to canonicalize
 * @returns Canonical JSON string
 *
 * @example
 * ```typescript
 * const spec1 = { domain_overlays: ['web', 'api'], phase_role: 'planner' };
 * const spec2 = { phase_role: 'planner', domain_overlays: ['api', 'web'] };
 *
 * canonicalizePersonaSpec(spec1) === canonicalizePersonaSpec(spec2); // true
 * ```
 */
export function canonicalizePersonaSpec(spec: PersonaSpec): string {
  // Deep clone and sort to prevent mutation
  const sorted: any = {};

  // Add fields in alphabetical order (sorted keys)
  const keys = Object.keys(spec).sort();

  for (const key of keys) {
    const value = spec[key as keyof PersonaSpec];

    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Sort arrays deterministically
    if (Array.isArray(value)) {
      sorted[key] = [...value].sort();
    } else {
      sorted[key] = value;
    }
  }

  // Deterministic JSON stringify
  return JSON.stringify(sorted);
}

/**
 * Computes SHA-256 hash of PersonaSpec.
 *
 * Uses canonicalization to ensure stable hash across:
 * - Different key orders
 * - Different array orders
 * - Different processes/restarts
 *
 * @param spec - PersonaSpec to hash
 * @returns 64-character hex string (SHA-256)
 *
 * @example
 * ```typescript
 * const spec = { phase_role: 'expert-planner', domain_overlays: ['api'] };
 * const hash = hashPersonaSpec(spec);
 * console.log(hash); // e4d909c290347e2ef4a8...
 * ```
 */
export function hashPersonaSpec(spec: PersonaSpec): string {
  const canonical = canonicalizePersonaSpec(spec);
  return createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
}

/**
 * Formats PersonaSpec for prompt compiler persona slot.
 *
 * **IMP-22 IMPLEMENTATION**: Replaced stub with canonicalization.
 * Uses canonical JSON format for stable hashing and drift detection.
 *
 * @param spec - PersonaSpec to format
 * @returns Canonical JSON string for compiler persona slot
 *
 * @example
 * ```typescript
 * const spec = {
 *   phase_role: 'expert-planner',
 *   domain_overlays: ['api'],
 *   skill_packs: ['typescript']
 * };
 * const personaString = formatPersonaForCompiler(spec);
 * // Returns: '{"capabilities":[],"domain_overlays":["api"],"phase_role":"expert-planner","skill_packs":["typescript"]}'
 *
 * const compiler = new PromptCompiler();
 * const compiled = compiler.compile({
 *   system: 'You are Claude.',
 *   phase: 'STRATEGIZE',
 *   persona: personaString
 * });
 * ```
 */
export function formatPersonaForCompiler(spec: PersonaSpec): string {
  return canonicalizePersonaSpec(spec);
}
