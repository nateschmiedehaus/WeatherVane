import path from "node:path";

export type CodexProfile = "low" | "medium" | "high";

const DEFAULT_PROFILE: CodexProfile = "medium";

export function resolveWorkspaceRoot(): string {
  const envRoot = process.env.WVO_WORKSPACE_ROOT;
  if (envRoot && envRoot.trim().length > 0) {
    return path.resolve(envRoot);
  }
  const flagIdx = process.argv.indexOf("--workspace");
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) {
    return path.resolve(process.argv[flagIdx + 1]);
  }

  return process.cwd();
}

export function resolveStateRoot(workspaceRoot: string): string {
  const configured = process.env.WVO_STATE_ROOT;
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured);
  }
  return path.join(workspaceRoot, "state");
}

export function getCodexProfile(): CodexProfile {
  const capability = process.env.WVO_CAPABILITY?.toLowerCase();
  if (capability === "low" || capability === "medium" || capability === "high") {
    return capability;
  }
  const raw = process.env.CODEX_PROFILE?.toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high") {
    return raw;
  }
  return DEFAULT_PROFILE;
}

export function shouldLimitHeavyOps(profile: CodexProfile): boolean {
  return profile === "low";
}

export function shouldEnableExtendedCritics(profile: CodexProfile): boolean {
  return profile === "high";
}

/**
 * IMP-22: Feature flag for persona hashing and drift detection
 *
 * Controls whether PersonaSpec hashing is enabled for prompt attestation.
 * Modes:
 * - 'off': Persona hashing disabled (default until IMP-21 integration validated)
 * - 'observe': Persona hashing enabled, drift logged but not blocking
 * - 'enforce': Persona hashing enabled, high drift may block transitions (future)
 *
 * @returns Current persona hashing mode
 */
export function getPersonaHashingMode(): 'off' | 'observe' | 'enforce' {
  const mode = process.env.PERSONA_HASHING_MODE?.toLowerCase();
  if (mode === 'observe' || mode === 'enforce') {
    return mode;
  }
  return 'off'; // Default: off until validated
}

/**
 * Check if persona hashing is enabled (observe or enforce mode)
 */
export function isPersonaHashingEnabled(): boolean {
  return getPersonaHashingMode() !== 'off';
}
