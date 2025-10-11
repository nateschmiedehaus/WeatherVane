import { Critic } from "./base.js";

export class DesignSystemCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "high") {
      return "npm run lint --prefix apps/web";
    }
    return null;
  }
}
