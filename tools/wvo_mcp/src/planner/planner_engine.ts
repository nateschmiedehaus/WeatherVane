import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { planNextInputSchema } from "../utils/schemas.js";
import type { PlanNextInput, PlanTaskSummary, RoadmapDocument } from "../utils/types.js";

import { flattenTasks } from "./roadmap_parser.js";


export class PlannerEngine {
  constructor(private readonly roadmap: RoadmapDocument, private readonly workspaceRoot?: string) {}

  next(input: PlanNextInput): PlanTaskSummary[] {
    const parsedInput = planNextInputSchema.parse(input);
    const { limit = 5, filters } = parsedInput;
    let tasks = flattenTasks(this.roadmap);

    // CHECK FOR COMMANDS FIRST (highest priority)
    const activeCommands = this.getActiveCommands();
    if (activeCommands.length > 0) {
      // Filter tasks based on command instructions
      tasks = this.filterTasksByCommands(tasks, activeCommands);
    }

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

    const getPriority = (task: (typeof tasks)[number]) => {
      // CRITICAL PRIORITY (highest - comes FIRST)
      // 1. Tasks with priority: 'critical' field
      if (task.priority === 'critical') {
        return 0;
      }
      // 2. Tasks with IDs containing REMEDIATION
      if (task.id && (task.id.includes('REMEDIATION') || task.id.startsWith('CRIT-'))) {
        return 0;
      }
      // 3. Epic E12 (legacy special case)
      if (task.epic_id === "E12") {
        return 0;
      }

      // HIGH PRIORITY
      if (task.priority === 'high') {
        return 1;
      }

      // MEDIUM PRIORITY (domain-based)
      if ((task.domain ?? "").toLowerCase() === "product") {
        return 2;
      }
      if ((task.domain ?? "").toLowerCase() === "mcp") {
        return 3;
      }

      // LOW PRIORITY
      if (task.priority === 'low') {
        return 5;
      }

      // DEFAULT
      return 4;
    };

    const statusOrder: Record<string, number> = {
      blocked: 0,
      pending: 1,
      in_progress: 2,
      done: 3,
    };

    tasks.sort((a, b) => {
      const priorityDiff = getPriority(a) - getPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return (a.estimate_hours ?? 0) - (b.estimate_hours ?? 0);
    });

    return tasks.slice(0, limit);
  }

  /**
   * Get active commands from commands.json
   */
  private getActiveCommands(): any[] {
    if (!this.workspaceRoot) {
      return [];
    }

    const commandsPath = path.join(this.workspaceRoot, 'state', 'commands.json');
    if (!existsSync(commandsPath)) {
      return [];
    }

    try {
      const commandData = JSON.parse(readFileSync(commandsPath, 'utf-8'));
      return commandData.commands?.filter((c: any) => c.status === 'pending') || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Filter tasks based on active command instructions
   */
  private filterTasksByCommands(tasks: PlanTaskSummary[], commands: any[]): PlanTaskSummary[] {
    if (commands.length === 0) {
      return tasks;
    }

    // Combine all command filters
    let filteredTasks = tasks;
    for (const command of commands) {
      if (command.task_filter) {
        // Filter tasks by pattern (e.g., "REMEDIATION", "T-MLR-")
        filteredTasks = filteredTasks.filter(task =>
          task.id.includes(command.task_filter) ||
          task.title.toLowerCase().includes(command.task_filter.toLowerCase())
        );
      }
    }

    // If we have filtered tasks, return only those
    // Otherwise return all tasks (command might be general instruction)
    return filteredTasks.length > 0 ? filteredTasks : tasks;
  }
}
