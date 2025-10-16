import { describe, expect, it, beforeEach } from "vitest";

import { SessionContext } from "../session.js";
import type { CriticHistoryRecord, Task, TaskStatus } from "../orchestrator/state_machine.js";
import type { CriticIdentityProfile } from "../critics/base.js";

class MockStateMachine {
  public tasks: Task[] = [];
  public criticHistory: CriticHistoryRecord[] = [];

  getTasks(filter?: { status?: TaskStatus[] }): Task[] {
    if (!filter?.status || filter.status.length === 0) {
      return [...this.tasks];
    }
    return this.tasks.filter((task) => filter.status!.includes(task.status));
  }

  getCriticHistory(critic: string, options: { limit?: number } = {}): CriticHistoryRecord[] {
    const limit = Math.max(1, options.limit ?? 20);
    return this.criticHistory
      .filter((entry) => entry.critic === critic)
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .slice(0, limit);
  }
}

describe("SessionContext critic strategy", () => {
  let session: SessionContext;
  let stateMachine: MockStateMachine;
  let advisoryIdentity: CriticIdentityProfile;

  beforeEach(() => {
    session = new SessionContext();
    stateMachine = new MockStateMachine();
    (session as any).stateMachine = stateMachine;

    advisoryIdentity = {
      title: "Program Navigator",
      mission: "Maintain roadmap integrity.",
      powers: ["Audits roadmap transitions"],
      authority: "advisory",
      domain: "product",
      autonomy_guidance: "Escalate only when drift persists.",
    };
  });

  it("skips advisory critics when coverage is fresh and no follow-ups exist", async () => {
    stateMachine.criticHistory.push({
      id: 1,
      critic: "org_pm",
      category: "runtime_success",
      passed: true,
      created_at: Date.now(),
      metadata: { origin: "critic_runtime" },
    });

    const shouldRun = (session as any).shouldRunCritic("org_pm", advisoryIdentity, false);
    expect(shouldRun).toBe(false);
  });

  it("forces advisory critics when outstanding follow-ups exist", async () => {
    stateMachine.tasks.push({
      id: "CRIT-ORG_PM-1234",
      title: "Follow-up",
      status: "pending",
      type: "task",
      created_at: Date.now(),
      metadata: { source: "critic", critic: "org_pm" },
    } as Task);

    const shouldRun = (session as any).shouldRunCritic("org_pm", advisoryIdentity, false);
    expect(shouldRun).toBe(true);
  });
});
