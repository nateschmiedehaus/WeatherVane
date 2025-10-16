import { Critic } from "./base.js";

export class OrgPmCritic extends Critic {
  protected command(_profile: string): string | null {
    return 'node tools/wvo_mcp/scripts/check_org_pm_state.mjs';
  }
}
