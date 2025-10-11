import { Critic } from "./base.js";

export class CausalCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }
}
