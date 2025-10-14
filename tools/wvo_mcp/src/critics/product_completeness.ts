import { Critic } from "./base.js";

export class ProductCompletenessCritic extends Critic {
  protected command(_profile: string): string | null {
    return "node tools/wvo_mcp/scripts/check_product_completeness.mjs";
  }
}
