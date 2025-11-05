import path from "node:path";

import type { StateMachine } from "../orchestrator/state_machine.js";

export interface CodeSearchResult {
  filePath: string;
  line: number;
  snippet: string;
}

export interface CodeSearchOptions {
  workspaceRoot?: string;
  limit?: number;
}

export class CodeSearchIndex {
  private readonly workspaceRoot: string;

  constructor(private readonly stateMachine: StateMachine | undefined, workspaceRoot: string, _options: CodeSearchOptions = {}) {
    this.workspaceRoot = workspaceRoot;
  }

  async refresh(): Promise<void> {
    // Placeholder implementation – full-text index can be added later.
    return;
  }

  async search(_query: string, options: CodeSearchOptions = {}): Promise<CodeSearchResult[]> {
    // Without a full index we return an empty result set while keeping the API stable.
    const limit = options.limit ?? 0;
    if (limit <= 0) {
      return [];
    }
    return [];
  }

  normalizePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.relative(this.workspaceRoot, filePath).replace(/\\/g, "/");
    }
    return filePath.replace(/\\/g, "/");
  }
}
