import path from "node:path";

import { Critic } from "./base.js";

export class ManagerSelfCheckCritic extends Critic {
  protected command(): string | null {
    const scriptPath = path.relative(
      this.workspaceRoot,
      path.join(this.workspaceRoot, "tools", "wvo_mcp", "scripts", "check_manager_state.mjs"),
    );
    const workspaceArg = this.workspaceRoot;
    return `node "${scriptPath}" "${workspaceArg}"`;
  }
}
