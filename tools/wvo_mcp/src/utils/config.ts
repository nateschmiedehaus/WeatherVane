import path from "node:path";

export type CodexProfile = "low" | "medium" | "high";

const DEFAULT_PROFILE: CodexProfile = "medium";

export function resolveWorkspaceRoot(): string {
  const flagIdx = process.argv.indexOf("--workspace");
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) {
    return path.resolve(process.argv[flagIdx + 1]);
  }

  return process.cwd();
}

export function getCodexProfile(): CodexProfile {
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
