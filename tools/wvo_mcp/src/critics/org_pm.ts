import { Critic } from "./base.js";

export class OrgPmCritic extends Critic {
  protected command(_profile: string): string | null {
    // Reserved for future scripted health checks; currently no shell command required.
    return null;
  }
}
