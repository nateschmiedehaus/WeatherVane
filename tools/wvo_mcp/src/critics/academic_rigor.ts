import { Critic } from "./base.js";

export class AcademicRigorCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }
}
