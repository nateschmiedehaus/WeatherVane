import { z } from "zod";
import type { PlanNextInput, PlanTaskSummary, RoadmapDocument } from "../utils/types.js";
import { planNextInputSchema } from "../utils/schemas.js";

import { flattenTasks } from "./roadmap_parser.js";


export class PlannerEngine {
  constructor(private readonly roadmap: RoadmapDocument) {}

  next(input: PlanNextInput): PlanTaskSummary[] {
    const parsedInput = planNextInputSchema.parse(input);
    const { limit = 5, filters } = parsedInput;
    let tasks = flattenTasks(this.roadmap);

    if (filters?.status?.length) {
      tasks = tasks.filter((task) => filters.status?.includes(task.status));
    }

    if (filters?.epic_id) {
      tasks = tasks.filter((task) => task.epic_id === filters.epic_id);
    }

    if (filters?.milestone_id) {
      tasks = tasks.filter((task) => task.milestone_id === filters.milestone_id);
    }

    if (filters?.domain) {
      tasks = tasks.filter((task) => task.domain === filters.domain);
    }

    const domainPriority = (task: (typeof tasks)[number]) => {
      if (task.id && task.id.startsWith("CRIT-")) {
        return 4;
      }
      if (task.epic_id === "E12") {
        return 0;
      }
      if ((task.domain ?? "").toLowerCase() === "product") {
        return 1;
      }
      if ((task.domain ?? "").toLowerCase() === "mcp") {
        return 3;
      }
      return 2;
    };

    const statusOrder: Record<string, number> = {
      blocked: 0,
      pending: 1,
      in_progress: 2,
      done: 3,
    };

    tasks.sort((a, b) => {
      const priorityDiff = domainPriority(a) - domainPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return (a.estimate_hours ?? 0) - (b.estimate_hours ?? 0);
    });

    return tasks.slice(0, limit);
  }
}
