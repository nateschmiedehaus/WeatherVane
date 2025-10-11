import { Critic } from "./base.js";

export class TypecheckCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "low") {
      return null;
    }
    return "make typecheck";
  }
}
