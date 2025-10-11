import { Critic } from "./base.js";

export class TestsCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "low") {
      return "make test";
    }
    return "make test";
  }
}
