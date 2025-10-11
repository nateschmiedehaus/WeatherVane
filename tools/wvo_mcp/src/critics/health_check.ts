import { Critic } from "./base.js";

export class HealthCheckCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "low") {
      return null;
    }
    if (profile === "medium") {
      return "make lint";
    }
    return "make lint && make test";
  }
}
