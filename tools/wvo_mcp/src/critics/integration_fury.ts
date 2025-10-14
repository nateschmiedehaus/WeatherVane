import { Critic } from "./base.js";

export class IntegrationFuryCritic extends Critic {
  protected command(_profile: string): string | null {
    return "bash tools/wvo_mcp/scripts/run_fierce_integration_tests.sh";
  }
}
