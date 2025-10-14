import path from "node:path";

import { Critic } from "./base.js";

export class FailoverGuardrailCritic extends Critic {
  protected command(): string | null {
    const scriptPath = path.relative(
      this.workspaceRoot,
      path.join(this.workspaceRoot, "tools", "wvo_mcp", "scripts", "check_failover_guardrail.mjs"),
    );
    return `node "${scriptPath}" "${this.workspaceRoot}"`;
  }
}
