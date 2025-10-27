/**
 * RoadmapTracker - Utility for updating task status across StateMachine and roadmap.yaml
 *
 * Used by UnifiedOrchestrator to keep roadmap in sync as agents execute tasks.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

import { logInfo, logWarning, logDebug } from '../telemetry/logger.js';

import type { StateMachine, TaskStatus } from './state_machine.js';

interface RoadmapTask {
  id: string;
  title: string;
  status: string;
  [key: string]: any;
}

interface RoadmapDocument {
  epics: Array<{
    id: string;
    milestones?: Array<{
      id: string;
      tasks: RoadmapTask[];
    }>;
  }>;
}

export class RoadmapTracker {
  private roadmapPath: string;
  private contextPath: string;

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly workspaceRoot: string
  ) {
    this.roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');
    this.contextPath = path.join(workspaceRoot, 'state', 'context.md');
  }

  /**
   * Update task status in both StateMachine and roadmap.yaml
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    details?: {
      agent?: string;
      duration?: number;
      output?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    const correlationId = `roadmap_tracker:${taskId}:${Date.now()}`;

    logDebug('Updating task status', { taskId, status, agent: details?.agent });

    if (status === 'in_progress' && details?.agent) {
      try {
        this.stateMachine.assignTask(taskId, details.agent, `${correlationId}:assign`);
      } catch (error) {
        logWarning('Failed to assign task to agent', {
          taskId,
          agent: details.agent,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 1. Update StateMachine (SQLite)
    try {
      await this.stateMachine.transition(
        taskId,
        status,
        details?.metadata,
        correlationId,
        details?.agent
      );
      logInfo('StateMachine updated', { taskId, status });
    } catch (error) {
      logWarning('Failed to update StateMachine', {
        taskId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 2. Update roadmap.yaml if task exists there
    try {
      await this.updateRoadmapYaml(taskId, status);
    } catch (error) {
      // YAML update is optional - many tasks may only exist in StateMachine
      logDebug('Roadmap YAML not updated (task may not exist in YAML)', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. Log to context if significant status change
    if (status === 'in_progress' || status === 'done') {
      try {
        await this.logToContext(taskId, status, details);
      } catch (error) {
        logWarning('Failed to log to context', {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Update roadmap.yaml file
   */
  private async updateRoadmapYaml(taskId: string, status: TaskStatus): Promise<void> {
    const content = await fs.readFile(this.roadmapPath, 'utf-8');
    const roadmap = yaml.parse(content) as RoadmapDocument;

    let found = false;

    // Find and update task in nested structure
    for (const epic of roadmap.epics || []) {
      for (const milestone of epic.milestones || []) {
        for (const task of milestone.tasks || []) {
          if (task.id === taskId) {
            task.status = status;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }

    if (!found) {
      throw new Error(`Task ${taskId} not found in roadmap.yaml`);
    }

    // Write back to file
    await fs.writeFile(this.roadmapPath, yaml.stringify(roadmap), 'utf-8');
    logInfo('Roadmap YAML updated', { taskId, status });
  }

  /**
   * Log progress to context.md
   */
  private async logToContext(
    taskId: string,
    status: TaskStatus,
    details?: { agent?: string; duration?: number; output?: string }
  ): Promise<void> {
    // Get task info
    const task = this.stateMachine.getTask(taskId);
    if (!task) {
      logWarning('Task not found for context logging', { taskId });
      return;
    }

    const timestamp = new Date().toISOString();
    const durationStr = details?.duration ? ` in ${(details.duration / 1000).toFixed(1)}s` : '';
    const agentStr = details?.agent ? ` (${details.agent})` : '';

    let message = '';

    if (status === 'in_progress') {
      message = `\n- [${timestamp}] **Started** ${taskId}: ${task.title}${agentStr}`;
    } else if (status === 'done') {
      message = `\n- [${timestamp}] **Completed** ${taskId}: ${task.title}${agentStr}${durationStr}`;
      if (details?.output && details.output.length > 0) {
        const preview = details.output.substring(0, 150).replace(/\n/g, ' ');
        message += `\n  Output: ${preview}${details.output.length > 150 ? '...' : ''}`;
      }
    }

    if (message) {
      try {
        const existing = await fs.readFile(this.contextPath, 'utf-8');

        // Insert under "Status Highlights" or at top if not found
        let updated: string;
        if (existing.includes('## Status Highlights')) {
          updated = existing.replace(
            '## Status Highlights',
            `## Status Highlights${message}`
          );
        } else if (existing.includes('## Current Focus')) {
          updated = existing.replace(
            '## Current Focus',
            `## Current Focus${message}`
          );
        } else {
          updated = `## Recent Activity${message}\n\n${existing}`;
        }

        await fs.writeFile(this.contextPath, updated, 'utf-8');
        logDebug('Context updated with progress', { taskId, status });
      } catch (error) {
        // Context update is best-effort
        logDebug('Context file not updated', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
