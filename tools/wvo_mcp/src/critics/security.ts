import { Critic } from "./base.js";

export class SecurityCritic extends Critic {
  protected command(profile: string): string | null {
    // Security critic validates credential leaks, insecure defaults, and policy gaps.
    // Runs regardless of capability profile to maintain security guardrails.
    const normalized = (profile ?? "").trim().toLowerCase();
    const baseCmd = "node tools/wvo_mcp/scripts/run_security_checks.mjs";

    if (!normalized) {
      return baseCmd;
    }

    // Parse profile tokens to understand capability level
    const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);

    // Skip only if explicitly disabled or at "low" capability
    const disabledSignals = new Set(["disabled", "disable", "off", "skip"]);
    if (tokens.some((token) => disabledSignals.has(token))) {
      return null;
    }

    const onlyLowCapability =
      normalized === "low" ||
      (tokens.length > 0 && tokens.every((token) => token === "low"));
    if (onlyLowCapability) {
      return null;
    }

    // All other capability levels (medium, high, default, etc.) are eligible
    // Security is critical authority so we run it unless explicitly disabled
    return baseCmd;
  }
}
