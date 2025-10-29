import type { PersonaSignals } from './feature_extractor.js';
import type { PersonaSpec, DomainId, PhaseRole, SkillPackId, CapabilityTag } from './persona_spec.js';

const PHASE_ROLE_MAP: Record<string, PhaseRole> = {
  strategize: 'strategize',
  specify: 'spec',
  plan: 'plan',
  thinker: 'think',
  think: 'think',
  implement: 'implement',
  verify: 'verify',
  review: 'review',
  pr: 'pr',
  monitor: 'monitor',
};

const DOMAIN_THRESHOLD = 0.6;

export function computePersonaSpec(signals: PersonaSignals): PersonaSpec {
  const phaseRole = PHASE_ROLE_MAP[signals.phase] ?? 'implement';

  const domainOverlays: PersonaSpec['domainOverlays'] = [];

  for (const [domain, score] of Object.entries(signals.domainScores)) {
    const normalizedScore = Number(score);
    if (normalizedScore >= DOMAIN_THRESHOLD) {
      domainOverlays.push({ domain: domain as DomainId, weight: normalizedScore });
    }
  }

  const modelCapabilities: CapabilityTag[] = [];

  if (phaseRole === 'think') {
    modelCapabilities.push('reasoning_ultra');
  } else if (phaseRole === 'implement') {
    modelCapabilities.push('fast_code');
  } else {
    modelCapabilities.push('reasoning_high');
  }

  const skillPacks: SkillPackId[] = [];

  const evalRubrics: PersonaSpec['evalRubrics'] = [];
  switch (phaseRole) {
    case 'strategize':
      evalRubrics.push('strategy_fit');
      break;
    case 'spec':
      evalRubrics.push('spec_completeness');
      break;
    case 'plan':
      evalRubrics.push('plan_verifiability');
      break;
    case 'think':
      evalRubrics.push('strategy_fit');
      break;
    case 'implement':
      evalRubrics.push('implementation_integrity');
      break;
    case 'verify':
      evalRubrics.push('verify_sufficiency');
      break;
    case 'review':
      evalRubrics.push('review_quality');
      break;
    case 'pr':
      evalRubrics.push('pr_evidence');
      break;
    case 'monitor':
      evalRubrics.push('monitor_readiness');
      break;
  }

  const toolAllowlist: string[] = [];

  return {
    phaseRole,
    domainOverlays,
    skillPacks,
    evalRubrics,
    toolAllowlist,
    modelCapabilities,
    scope: signals.scope,
  };
}
