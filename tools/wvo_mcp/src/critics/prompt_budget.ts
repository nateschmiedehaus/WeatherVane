import path from "node:path";

import { Critic } from "./base.js";

export class PromptBudgetCritic extends Critic {
  protected command(_profile: string): string | null {
    const scriptPath = path.relative(
      this.workspaceRoot,
      path.join(
        this.workspaceRoot,
        "tools",
        "wvo_mcp",
        "scripts",
        "check_prompt_budget.mjs",
      ),
    );
    return `node "${scriptPath}" "${this.workspaceRoot}"`;
  }
}
