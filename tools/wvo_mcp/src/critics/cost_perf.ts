import { Critic } from "./base.js";

export class CostPerfCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }
}
