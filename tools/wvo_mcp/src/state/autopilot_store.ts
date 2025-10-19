import { promises as fs } from "node:fs";
import path from "node:path";

import YAML from "yaml";

import type { AutopilotAuditEntry, AutopilotState } from "../utils/types.js";

const DEFAULT_STATE: AutopilotState = {
  last_audit: null,
  audit_history: [],
  audit_count: 0,
};

export class AutopilotStore {
  private readonly filePath: string;

  constructor(private readonly stateRoot: string) {
    this.filePath = path.join(this.stateRoot, "autopilot.yaml");
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async read(): Promise<AutopilotState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = YAML.parse(raw) as AutopilotState | null;
      if (!parsed) {
        return { ...DEFAULT_STATE };
      }
      return {
        ...DEFAULT_STATE,
        ...parsed,
        last_audit: parsed.last_audit ?? null,
        audit_history: Array.isArray(parsed.audit_history) ? parsed.audit_history : [],
        audit_count: Number.isFinite(parsed.audit_count) ? parsed.audit_count : 0,
      };
    } catch (error) {
      return { ...DEFAULT_STATE };
    }
  }

  private async write(state: AutopilotState): Promise<void> {
    await this.ensureDirectory();
    const payload = YAML.stringify(state);
    await fs.writeFile(this.filePath, payload, "utf-8");
  }

  async recordAudit(entry: AutopilotAuditEntry): Promise<AutopilotState> {
    const state = await this.read();
    const timestamped: AutopilotAuditEntry = {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
    };
    const history = [timestamped, ...state.audit_history];

    const deduped: AutopilotAuditEntry[] = [];
    const seen = new Set<string>();
    for (const item of history) {
      const key = `${item.task_id ?? ""}:${item.timestamp}`;
      if (!seen.has(key)) {
        deduped.push(item);
        seen.add(key);
      }
      if (deduped.length >= 50) {
        break;
      }
    }

    const nextState: AutopilotState = {
      last_audit: timestamped,
      audit_history: deduped,
      audit_count: (state.audit_count ?? 0) + 1,
    };

    await this.write(nextState);
    return nextState;
  }
}
