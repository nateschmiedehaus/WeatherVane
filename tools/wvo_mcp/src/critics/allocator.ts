import { Critic } from "./base.js";

export class AllocatorCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }
}
