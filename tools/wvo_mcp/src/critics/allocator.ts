import { Critic } from "./base.js";

export class AllocatorCritic extends Critic {
  protected command(profile: string): string | null {
    const trimmedProfile = (profile ?? "").trim();
    if (trimmedProfile.length > 0) {
      return `node tools/wvo_mcp/scripts/run_allocator_checks.mjs ${trimmedProfile}`;
    }
    return "node tools/wvo_mcp/scripts/run_allocator_checks.mjs";
  }
}
