import { Critic } from "./base.js";

export class TestsCritic extends Critic {
  protected command(profile: string): string | null {
    return "bash tools/wvo_mcp/scripts/run_integrity_tests.sh";
  }
}
