import { Critic } from "./base.js";

export class AcademicRigorCritic extends Critic {
  protected command(profile: string): string | null {
    // Academic rigor critic validates experimental design and statistical methodology.
    // Run meta-critique for Phase 0/1 epic to verify research rigor; the runner performs
    // dependency reconciliation across epics and surfaces methodological gaps as failures.
    const normalized = (profile ?? "").trim().toLowerCase();
    const metaCritiqueCmd = "python tools/wvo_mcp/scripts/run_meta_critique.py --epic E12 --json";

    if (!normalized) {
      return metaCritiqueCmd;
    }

    const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
    const onlyLowCapability =
      normalized === "low" ||
      (tokens.length > 0 && tokens.every((token) => token === "low"));
    if (onlyLowCapability) {
      // Even low capability agents can run the meta critique; skipping was being logged as a failure.
      return metaCritiqueCmd;
    }

    const disabledSignals = new Set(["disabled", "disable", "off", "skip"]);
    if (tokens.some((token) => disabledSignals.has(token))) {
      return null;
    }

    const allowedSignals = new Set([
      "medium",
      "high",
      "default",
      "autopilot",
      "director",
      "research",
      "analysis",
    ]);
    if (
      allowedSignals.has(normalized) ||
      tokens.some((token) => allowedSignals.has(token)) ||
      normalized.includes("medium") ||
      normalized.includes("high")
    ) {
      return metaCritiqueCmd;
    }

    // Fallback: treat any non-low capability as eligible to maintain coverage parity with causal critic.
    return metaCritiqueCmd;
  }
}
