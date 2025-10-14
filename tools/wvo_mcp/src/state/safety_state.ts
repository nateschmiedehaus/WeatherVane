import { promises as fs } from "node:fs";
import path from "node:path";

type SafetySeverity = "info" | "warning" | "critical";

export interface SafetyIncident {
  id: string;
  timestamp: string;
  severity: SafetySeverity;
  summary: string;
  details?: Record<string, unknown>;
}

export interface SafetyState {
  mode: string;
  killSwitchEngaged: boolean;
  upgradeLockActive: boolean;
  incidents: SafetyIncident[];
  metadata: Record<string, unknown>;
  lastUpdated: string | null;
}

const DEFAULT_STATE: SafetyState = {
  mode: "stabilize",
  killSwitchEngaged: false,
  upgradeLockActive: false,
  incidents: [],
  metadata: {},
  lastUpdated: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafetyIncident(value: unknown): value is SafetyIncident {
  if (!isRecord(value)) {
    return false;
  }

  const { id, timestamp, severity, summary } = value;
  if (typeof id !== "string" || id.trim() === "") {
    return false;
  }
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    return false;
  }
  if (severity !== "info" && severity !== "warning" && severity !== "critical") {
    return false;
  }
  if (typeof summary !== "string" || summary.trim() === "") {
    return false;
  }

  return true;
}

function normalizeIncident(input: unknown): SafetyIncident | null {
  if (!isSafetyIncident(input)) {
    return null;
  }

  const normalized: SafetyIncident = {
    id: input.id.trim(),
    timestamp: new Date(input.timestamp).toISOString(),
    severity: input.severity,
    summary: input.summary.trim(),
  };

  if (isRecord(input.details)) {
    normalized.details = { ...input.details };
  }

  return normalized;
}

function normalizeState(input: unknown): SafetyState {
  if (!isRecord(input)) {
    return { ...DEFAULT_STATE };
  }

  const incidents: SafetyIncident[] = Array.isArray(input.incidents)
    ? input.incidents
        .map((incident) => normalizeIncident(incident))
        .filter((incident): incident is SafetyIncident => incident !== null)
    : [];

  const metadata = isRecord(input.metadata) ? { ...input.metadata } : {};

  const mode =
    typeof input.mode === "string" && input.mode.trim() !== ""
      ? input.mode
      : DEFAULT_STATE.mode;

  const killSwitchEngaged =
    typeof input.killSwitchEngaged === "boolean"
      ? input.killSwitchEngaged
      : DEFAULT_STATE.killSwitchEngaged;

  const upgradeLockActive =
    typeof input.upgradeLockActive === "boolean"
      ? input.upgradeLockActive
      : DEFAULT_STATE.upgradeLockActive;

  const lastUpdated =
    typeof input.lastUpdated === "string" && !Number.isNaN(Date.parse(input.lastUpdated))
      ? new Date(input.lastUpdated).toISOString()
      : DEFAULT_STATE.lastUpdated;

  return {
    mode,
    killSwitchEngaged,
    upgradeLockActive,
    incidents,
    metadata,
    lastUpdated,
  };
}

export class SafetyStateStore {
  private readonly filePath: string;

  constructor(private readonly workspaceRoot: string) {
    this.filePath = path.join(this.workspaceRoot, "state", "safety_state.json");
  }

  private async ensureDirectory(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  async read(): Promise<SafetyState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      if (!raw.trim()) {
        return { ...DEFAULT_STATE };
      }
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return { ...DEFAULT_STATE };
      }
      throw error;
    }
  }

  async write(state: SafetyState): Promise<SafetyState> {
    const payload = {
      ...state,
      lastUpdated: new Date().toISOString(),
    };
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
    return normalizeState(payload);
  }

  async update(partial: Partial<SafetyState>): Promise<SafetyState> {
    const current = await this.read();

    const nextIncidents =
      partial.incidents !== undefined
        ? partial.incidents
            .map((incident) => normalizeIncident(incident))
            .filter((incident): incident is SafetyIncident => incident !== null)
        : current.incidents;

    const nextMetadata = partial.metadata
      ? { ...current.metadata, ...partial.metadata }
      : current.metadata;

    const nextState: SafetyState = {
      mode: typeof partial.mode === "string" && partial.mode.trim() !== ""
        ? partial.mode
        : current.mode,
      killSwitchEngaged:
        typeof partial.killSwitchEngaged === "boolean"
          ? partial.killSwitchEngaged
          : current.killSwitchEngaged,
      upgradeLockActive:
        typeof partial.upgradeLockActive === "boolean"
          ? partial.upgradeLockActive
          : current.upgradeLockActive,
      incidents: nextIncidents,
      metadata: nextMetadata,
      lastUpdated: current.lastUpdated,
    };

    return this.write(nextState);
  }

  async recordIncident(incident: Omit<SafetyIncident, "id" | "timestamp"> & { id?: string; timestamp?: string }): Promise<SafetyState> {
    const current = await this.read();
    const timestamp = incident.timestamp ?? new Date().toISOString();
    const normalizedIncident = normalizeIncident({
      id: incident.id ?? `incident-${Date.now()}`,
      timestamp,
      severity: incident.severity,
      summary: incident.summary,
      details: incident.details,
    });

    if (!normalizedIncident) {
      return current;
    }

    const incidents = [
      normalizedIncident,
      ...current.incidents.filter((existing) => existing.id !== normalizedIncident.id),
    ].slice(0, 25);

    return this.write({
      ...current,
      incidents,
    });
  }

  async clear(): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
  }
}
