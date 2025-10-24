import path from "node:path";

import type { CriticResult } from "../critics/base.js";
import { flattenTasks } from "../planner/roadmap_parser.js";
import type { StateMachine } from "./state_machine.js";
import { RoadmapStore } from "../state/roadmap_store.js";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { CRITIC_KEYS, SessionContext, type CriticKey } from "../session.js";
import { taskToPlanSummary } from "./roadmap_adapter.js";

interface CriticEnforcementResult {
  required: CriticKey[];
  results: CriticResult[];
  passed: boolean;
  failedCritics: CriticKey[];
}

const CRITIC_PREFIX = "critic:";
const CACHE_TTL_MS = 60_000;

export class CriticEnforcer {
  private readonly roadmapStore: RoadmapStore;
  private session?: SessionContext;
  private criticCache: Map<string, CriticKey[]> = new Map();
  private lastCacheRefresh = 0;

  constructor(
    private readonly workspaceRoot: string,
    private readonly options: { stateMachine?: StateMachine; sessionFactory?: () => SessionContext } = {},
  ) {
    const stateRoot = path.join(workspaceRoot, "state");
    this.roadmapStore = new RoadmapStore(stateRoot);
  }

  async enforce(taskId: string): Promise<CriticEnforcementResult> {
    const requiredCritics = await this.getRequiredCritics(taskId);
    if (requiredCritics.length === 0) {
      return { required: [], results: [], passed: true, failedCritics: [] };
    }

    const session = this.ensureSession();
    const results = await session.runCritics(requiredCritics);
    const failedCritics = results
      .filter((result) => !result.passed)
      .map((result) => result.critic as CriticKey);

    if (failedCritics.length > 0) {
      logWarning("Critic enforcement detected failures", {
        taskId,
        failedCritics,
      });
    } else {
      logInfo("Critic enforcement passed", { taskId, critics: requiredCritics });
    }

    return {
      required: requiredCritics,
      results,
      failedCritics,
      passed: failedCritics.length === 0,
    };
  }

  private ensureSession(): SessionContext {
    if (!this.session) {
      this.session = this.options.sessionFactory ? this.options.sessionFactory() : new SessionContext();
    }
    return this.session;
  }

  private async getRequiredCritics(taskId: string): Promise<CriticKey[]> {
    await this.refreshCacheIfNeeded();
    return this.criticCache.get(taskId) ?? [];
  }

  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheRefresh < CACHE_TTL_MS && this.criticCache.size > 0) {
      return;
    }
    if (this.options.stateMachine) {
      this.reloadCacheFromStateMachine();
    } else {
      await this.reloadCacheFromRoadmap();
    }
  }

  private reloadCacheFromStateMachine(): void {
    const stateMachine = this.options.stateMachine;
    if (!stateMachine) return;

    const tasks = stateMachine.getTasks();
    const nextCache = new Map<string, CriticKey[]>();
    const validKeys = new Set<CriticKey>(CRITIC_KEYS);

    for (const task of tasks) {
      const summary = taskToPlanSummary(task);
      const critics: CriticKey[] = [];
      for (const criterion of summary.exit_criteria ?? []) {
        if (!criterion.startsWith(CRITIC_PREFIX)) continue;
        const key = criterion.slice(CRITIC_PREFIX.length).trim();
        if (validKeys.has(key as CriticKey) && !critics.includes(key as CriticKey)) {
          critics.push(key as CriticKey);
        } else if (!validKeys.has(key as CriticKey)) {
          logWarning("Unknown critic referenced in exit criteria", {
            taskId: summary.id,
            criterion: key,
          });
        }
      }

      if (critics.length > 0) {
        nextCache.set(summary.id, critics);
      }
    }

    this.criticCache = nextCache;
    this.lastCacheRefresh = Date.now();
  }

  private async reloadCacheFromRoadmap(): Promise<void> {
    const roadmap = await this.roadmapStore.read();
    const summaries = flattenTasks(roadmap);
    const nextCache = new Map<string, CriticKey[]>();
    const validKeys = new Set<CriticKey>(CRITIC_KEYS);

    for (const summary of summaries) {
      const critics: CriticKey[] = [];
      for (const criterion of summary.exit_criteria ?? []) {
        if (!criterion.startsWith(CRITIC_PREFIX)) {
          continue;
        }
        const key = criterion.slice(CRITIC_PREFIX.length).trim();
        if (validKeys.has(key as CriticKey)) {
          const actualKey = key as CriticKey;
          if (!critics.includes(actualKey)) {
            critics.push(actualKey);
          }
        } else {
          logWarning("Unknown critic referenced in exit criteria", {
            taskId: summary.id,
            criterion: key,
          });
        }
      }
      if (critics.length > 0) {
        nextCache.set(summary.id, critics);
      }
    }

    this.criticCache = nextCache;
    this.lastCacheRefresh = Date.now();
  }
}
