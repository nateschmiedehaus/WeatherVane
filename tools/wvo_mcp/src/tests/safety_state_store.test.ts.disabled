import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SafetyStateStore,
  type SafetyIncident,
  type SafetyState,
} from "../state/safety_state.js";

const DEFAULT_STATE: SafetyState = {
  mode: "stabilize",
  killSwitchEngaged: false,
  upgradeLockActive: false,
  incidents: [],
  metadata: {},
  lastUpdated: null,
};

describe("SafetyStateStore persistence", () => {
  let workspace: string;
  let store: SafetyStateStore;
  let statePath: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "safety-state-"));
    const stateRoot = path.join(workspace, "state");
    store = new SafetyStateStore(stateRoot);
    statePath = path.join(stateRoot, "safety_state.json");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("returns the default state when the file is missing", async () => {
    const state = await store.read();
    expect(state).toStrictEqual(DEFAULT_STATE);
  });

  it("writes and normalizes state with trimmed incidents and metadata", async () => {
    const persisted = await store.write({
      mode: "rapid",
      killSwitchEngaged: true,
      upgradeLockActive: true,
      incidents: [
        {
          id: "  incident-1 ",
          timestamp: "2024-01-01T00:00:00Z",
          severity: "warning",
          summary: "  test ",
          details: { source: "unit" },
        },
        {
          id: "",
          timestamp: "invalid-date",
          severity: "warning",
          summary: "",
        },
      ],
      metadata: { origin: "test" },
      lastUpdated: null,
    });

    expect(persisted.mode).toBe("rapid");
    expect(persisted.killSwitchEngaged).toBe(true);
    expect(persisted.upgradeLockActive).toBe(true);
    expect(persisted.metadata).toStrictEqual({ origin: "test" });
    expect(persisted.lastUpdated).toBe("2024-01-02T03:04:05.000Z");

    expect(persisted.incidents).toHaveLength(1);
    expect(persisted.incidents[0]).toMatchObject({
      id: "incident-1",
      timestamp: "2024-01-01T00:00:00.000Z",
      severity: "warning",
      summary: "test",
      details: { source: "unit" },
    });

    const raw = JSON.parse(await fs.readFile(statePath, "utf8"));
    expect(raw.mode).toBe("rapid");
    expect(raw.killSwitchEngaged).toBe(true);
    expect(raw.upgradeLockActive).toBe(true);
    expect(raw.lastUpdated).toBe("2024-01-02T03:04:05.000Z");
    expect(Array.isArray(raw.incidents)).toBe(true);
    expect(raw.metadata).toStrictEqual({ origin: "test" });
  });

  it("merges updates while preserving existing normalized state", async () => {
    await store.write({
      mode: "rapid",
      killSwitchEngaged: true,
      upgradeLockActive: true,
      incidents: [],
      metadata: { origin: "seed" },
      lastUpdated: null,
    });

    vi.setSystemTime(new Date("2024-01-03T12:00:00.000Z"));

    const updated = await store.update({
      mode: "   ",
      metadata: { updatedBy: "unit" },
      incidents: [
        {
          id: "incident-2",
          timestamp: "2024-01-03T11:59:00Z",
          severity: "info",
          summary: "Normalized",
        },
        {
          id: "",
          timestamp: "invalid",
          severity: "invalid" as SafetyIncident["severity"],
          summary: "",
        },
      ],
      upgradeLockActive: false,
      lastUpdated: null,
    });

    expect(updated.mode).toBe("rapid");
    expect(updated.killSwitchEngaged).toBe(true);
    expect(updated.upgradeLockActive).toBe(false);
    expect(updated.lastUpdated).toBe("2024-01-03T12:00:00.000Z");
    expect(updated.metadata).toStrictEqual({ origin: "seed", updatedBy: "unit" });
    expect(updated.incidents).toHaveLength(1);
    expect(updated.incidents[0]).toMatchObject({
      id: "incident-2",
      timestamp: "2024-01-03T11:59:00.000Z",
      severity: "info",
      summary: "Normalized",
    });
  });

  it("records incidents with generated identifiers and caps the list to 25 entries", async () => {
    const existing: SafetyIncident[] = Array.from({ length: 25 }, (_, index) => ({
      id: `existing-${index}`,
      timestamp: new Date(Date.UTC(2024, 0, 1, index)).toISOString(),
      severity: "info",
      summary: `Incident ${index}`,
    }));

    await store.write({
      mode: "stabilize",
      killSwitchEngaged: false,
      upgradeLockActive: false,
      incidents: existing,
      metadata: {},
      lastUpdated: null,
    });

    vi.setSystemTime(new Date("2024-02-02T00:00:00.000Z"));

    const state = await store.recordIncident({
      severity: "critical",
      summary: "Outage detected",
      details: { source: "unit" },
    });

    expect(state.incidents).toHaveLength(25);
    expect(state.incidents[0].summary).toBe("Outage detected");
    expect(state.incidents[0].severity).toBe("critical");
    expect(state.incidents[0].details).toStrictEqual({ source: "unit" });
    expect(state.incidents[0].id.startsWith("incident-")).toBe(true);
    expect(state.incidents[0].timestamp).toBe("2024-02-02T00:00:00.000Z");
    expect(state.incidents.at(-1)?.id).toBe("existing-23");
  });

  it("clears state back to defaults", async () => {
    await store.write({
      mode: "rapid",
      killSwitchEngaged: true,
      upgradeLockActive: true,
      incidents: [
        {
          id: "incident-123",
          timestamp: "2024-01-01T00:00:00Z",
          severity: "warning",
          summary: "Initial incident",
        },
      ],
      metadata: { origin: "seed" },
      lastUpdated: null,
    });

    await store.clear();
    const state = await store.read();
    expect(state).toStrictEqual(DEFAULT_STATE);

    const raw = JSON.parse(await fs.readFile(statePath, "utf8"));
    expect(raw).toStrictEqual(DEFAULT_STATE);
  });
});
