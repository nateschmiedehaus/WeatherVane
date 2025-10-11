import { Critic } from "./base.js";

export class ExecReviewCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }
}
