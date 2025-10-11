import { Critic } from "./base.js";

export class DataQualityCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "high") {
      return "python apps/worker/run.py DEMO --smoke-test";
    }
    return null;
  }
}
