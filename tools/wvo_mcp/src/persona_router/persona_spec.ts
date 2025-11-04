/**
 * PersonaSpec describes the phase role, domain overlays, skill packs,
 * evaluation rubrics, tool allowlists, and model capabilities assigned to an agent.
 */

export type PhaseRole =
  | 'strategize'
  | 'spec'
  | 'plan'
  | 'think'
  | 'implement'
  | 'verify'
  | 'review'
  | 'pr'
  | 'monitor';

export type DomainId = 'orchestrator' | 'ml' | 'ux' | 'api' | 'security';
export type SkillPackId = 'observability' | 'leases_ledger' | 'playwright' | 'ml_stats' | 'security_scanners';
export type RubricId = 'strategy_fit' | 'spec_completeness' | 'plan_verifiability' | 'implementation_integrity' | 'verify_sufficiency' | 'review_quality' | 'pr_evidence' | 'monitor_readiness';
export type CapabilityTag = 'reasoning_high' | 'reasoning_ultra' | 'fast_code';

export interface PersonaSpec {
  phaseRole: PhaseRole;
  domainOverlays: Array<{
    domain: DomainId;
    weight: number; // 0-1 range
  }>;
  skillPacks: SkillPackId[];
  evalRubrics: RubricId[];
  toolAllowlist: string[];
  modelCapabilities: CapabilityTag[];
  scope: 'tiny' | 'small' | 'medium' | 'large';
  notes?: string;
}

export function validatePersonaSpec(spec: PersonaSpec): void {
  if (!spec.phaseRole) {
    throw new Error('persona_spec.missing_phase_role');
  }

  for (const overlay of spec.domainOverlays) {
    if (overlay.weight < 0 || overlay.weight > 1) {
      throw new Error('persona_spec.invalid_overlay_weight');
    }
  }

  const seenDomains = new Set<DomainId>();
  for (const overlay of spec.domainOverlays) {
    if (seenDomains.has(overlay.domain)) {
      throw new Error('persona_spec.duplicate_domain_overlay');
    }
    seenDomains.add(overlay.domain);
  }

  const allowedScopes: PersonaSpec['scope'][] = ['tiny', 'small', 'medium', 'large'];
  if (!allowedScopes.includes(spec.scope)) {
    throw new Error('persona_spec.invalid_scope');
  }
}
