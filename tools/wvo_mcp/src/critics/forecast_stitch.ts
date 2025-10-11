import { Critic } from "./base.js";

export class ForecastStitchCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }
}
