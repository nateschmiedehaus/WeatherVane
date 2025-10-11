import { Critic } from "./base.js";

export class SecurityCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "high") {
      return "make security || pip-audit";
    }
    return null;
  }
}
