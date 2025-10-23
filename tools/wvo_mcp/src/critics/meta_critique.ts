import { Critic } from "./base.js";

export class MetaCritiqueCritic extends Critic {
  protected command(profile: string): string | null {
    const epic = process.env.WVO_META_CRITIQUE_EPIC ?? "";
    if (!epic) {
      return null;
    }
    return `python tools/wvo_mcp/scripts/run_meta_critique.py --epic ${epic} --json`;
  }
}
