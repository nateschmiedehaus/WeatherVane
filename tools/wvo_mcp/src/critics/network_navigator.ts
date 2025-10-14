import { Critic } from "./base.js";

export class NetworkNavigatorCritic extends Critic {
  protected command(_profile: string): string | null {
    return "bash tools/wvo_mcp/scripts/check_network_access.sh";
  }
}
