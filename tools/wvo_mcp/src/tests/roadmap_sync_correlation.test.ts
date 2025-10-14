import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { syncRoadmapDocument } from "../orchestrator/roadmap_adapter.js";
import { StateMachine } from "../orchestrator/state_machine.js";

describe("Roadmap sync correlation IDs", () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "wvo-roadmap-sync-"));
    stateMachine = new StateMachine(workspaceRoot);
  });

  afterEach(() => {
    stateMachine.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("threads provided correlation base into roadmap sync events", async () => {
    const correlationBase = "mcp:plan_next:test-correlation";
    stateMachine.createTask(
      {
        id: "E-sync",
        title: "Sync Epic Task",
        type: "epic",
        status: "pending",
      },
      `${correlationBase}:epic`
    );

    const roadmap = {
      epics: [
        {
          id: "E-sync",
          title: "Sync Epic",
          milestones: [
            {
              id: "M-sync",
              title: "Sync Milestone",
              tasks: [
                {
                  id: "T-sync",
                  title: "Ensure correlation wiring",
                  owner: "tester",
                  status: "pending" as const,
                },
              ],
            },
          ],
        },
      ],
    };

    await syncRoadmapDocument(stateMachine, roadmap, { correlationBase });

    const events = stateMachine.getEvents({ taskId: "T-sync" });
    const createEvent = events.find((event) => event.event_type === "task_created");

    expect(createEvent?.correlation_id).toBe(`${correlationBase}:sync:T-sync:create`);
  });
});
