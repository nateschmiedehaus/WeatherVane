import { Critic } from "./base.js";

export class AcademicRigorCritic extends Critic {
  protected command(profile: string): string | null {
    // Academic rigor critic validates experimental design and statistical methodology
    // Runs on high profile to verify research quality
    const normalized = (profile ?? "").trim().toLowerCase();
    if (normalized === "high") {
      // Run meta-critique for Phase 0/1 epic to verify research rigor
      return "python tools/wvo_mcp/scripts/run_meta_critique.py --epic E12 --json";
    }
    return null;
  }
}
