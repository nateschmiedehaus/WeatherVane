import { Critic } from "./base.js";

export class BuildCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "low") {
      return "make lint";
    }
    return "make lint";
  }
}
