/**
 * Compiler adapter for PersonaSpec integration (IMP-21-22-SYNC)
 *
 * This module provides a bridge between PersonaSpec (persona_router)
 * and PromptCompiler (prompt). It formats PersonaSpec data for the
 * compiler's persona slot.
 *
 * @module compiler_adapter
 */

/**
 * PersonaSpec structure (from persona_router/persona_spec.ts)
 *
 * NOTE: This is a simplified interface for the stub.
 * IMP-22 will use the full PersonaSpec from persona_spec.ts.
 */
export interface PersonaSpec {
  phase_role?: string;           // Role for this phase (e.g., 'expert-planner')
  domain_overlays?: string[];    // Domain-specific content (e.g., ['api', 'web'])
  skill_packs?: string[];        // Available skill packs (e.g., ['typescript', 'vitest'])
  capabilities?: string[];       // Capabilities enabled (e.g., ['code', 'research'])
}

/**
 * Formats PersonaSpec for prompt compiler persona slot.
 *
 * **STUB IMPLEMENTATION**: This is a minimal stub for IMP-21-22-SYNC.
 * IMP-22 will replace with proper canonicalization (sorted keys, stable hash).
 *
 * Current behavior: Simple pipe-separated string format.
 * IMP-22 behavior: Deterministic canonicalization with sorted keys.
 *
 * @param spec - PersonaSpec to format
 * @returns Serialized string for compiler persona slot
 *
 * @example
 * ```typescript
 * const spec = {
 *   phase_role: 'expert-planner',
 *   domain_overlays: ['api'],
 *   skill_packs: ['typescript']
 * };
 * const personaString = formatPersonaForCompiler(spec);
 * // Returns: "Role: expert-planner | Overlays: api | Skills: typescript"
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
  const parts: string[] = [];

  // Format each field if present
  if (spec.phase_role) {
    parts.push(`Role: ${spec.phase_role}`);
  }

  if (spec.domain_overlays && spec.domain_overlays.length > 0) {
    parts.push(`Overlays: ${spec.domain_overlays.join(', ')}`);
  }

  if (spec.skill_packs && spec.skill_packs.length > 0) {
    parts.push(`Skills: ${spec.skill_packs.join(', ')}`);
  }

  if (spec.capabilities && spec.capabilities.length > 0) {
    parts.push(`Capabilities: ${spec.capabilities.join(', ')}`);
  }

  // Join with pipe separator
  // IMP-22 will replace this with canonicalized JSON
  return parts.join(' | ');
}
