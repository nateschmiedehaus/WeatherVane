import { Critic } from "./base.js";

export class CausalCritic extends Critic {
  protected command(profile: string): string | null {
    const normalized = (profile ?? "").trim().toLowerCase();
    const level = normalized === "high" ? "high" : "medium";
    return `python tools/wvo_mcp/scripts/run_causal_critic.py --level ${level}`;
  }
}
