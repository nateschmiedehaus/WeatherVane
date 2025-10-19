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
