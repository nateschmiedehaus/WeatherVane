import { Critic } from "./base.js";

export class LeakageCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }
}
