/**
 * Persona feature extractor (placeholder)
 *
 * Given task metadata (files, labels, phase, etc.), extract normalized signals
 * for persona routing (domain scores, risk flags, scope estimates).
 */
export interface PersonaSignals {
  phase: string;
  filePaths: string[];
  domainScores: Record<string, number>;
  riskFlags: string[];
  scope: 'tiny' | 'small' | 'medium' | 'large';
}

export interface PersonaFeatureInput {
  phase: string;
  filePaths?: string[];
  labels?: string[];
  linesChanged?: number;
}

export function extractPersonaSignals(input: PersonaFeatureInput): PersonaSignals {
  const filePaths = input.filePaths ?? [];

  const domainScores: Record<string, number> = {
    orchestrator: 0,
    ml: 0,
    ux: 0,
    api: 0,
    security: 0,
  };

  for (const path of filePaths) {
    if (path.startsWith('tools/wvo_mcp/')) {
      domainScores.orchestrator += 1;
    }
    if (path.startsWith('apps/model/')) {
      domainScores.ml += 1;
    }
    if (path.startsWith('apps/web/')) {
      domainScores.ux += 1;
    }
    if (path.startsWith('apps/api/')) {
      domainScores.api += 1;
    }
    if (path.includes('security') || path.includes('auth')) {
      domainScores.security += 1;
    }
  }

  const maxScore = Math.max(1, ...Object.values(domainScores));
  for (const key of Object.keys(domainScores)) {
    domainScores[key] = Number((domainScores[key] / maxScore).toFixed(2));
  }

  const loc = input.linesChanged ?? 0;
  const scope: PersonaSignals['scope'] = loc <= 10 ? 'tiny' : loc <= 200 ? 'small' : loc <= 1000 ? 'medium' : 'large';

  const riskFlags: string[] = [];
  if ((input.labels ?? []).some((label) => label.toLowerCase().includes('security'))) {
    riskFlags.push('security');
  }
  if (filePaths.some((p) => p.includes('payment') || p.includes('auth'))) {
    riskFlags.push('auth');
  }

  return {
    phase: input.phase,
    filePaths,
    domainScores,
    riskFlags,
    scope,
  };
}
