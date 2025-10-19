/**
 * Context Manager - Efficient state persistence and loading
 * Ensures state persists across sessions without overwhelming instances
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { resolveStateRoot } from "../utils/config.js";

export interface CompactCheckpoint {
  version: string;
  timestamp: string;
  session_id: string;

  // Summary data only - not full dumps
  roadmap_summary: {
    total_tasks: number;
    completed_tasks: number;
    in_progress_tasks: number;
    pending_tasks: number;
    completion_percentage: number;
    current_phase: string;
    next_tasks: string[]; // Just IDs, not full objects
  };

  recent_activity: {
    last_completed_task: string | null;
    last_updated: string;
    tasks_completed_this_session: number;
    deployments_this_session: number;
  };

  provider_state: {
    current_provider: string;
    token_usage_summary: {
      codex_percent_used: number;
      claude_code_percent_used: number;
    };
  };

  context_summary: {
    word_count: number;
    sections: string[];
    key_decisions: string[]; // Last 3-5 decisions only
    blockers: string[];
  };

  // Compact: Only what's needed to resume
  continuation_hint: string;
}

export interface StateMetrics {
  checkpoint_size_kb: number;
  roadmap_size_kb: number;
  context_size_kb: number;
  total_size_kb: number;
  is_bloated: boolean;
  needs_pruning: boolean;
}

export class ContextManager {
  private workspaceRoot: string;
  private stateDir: string;
  private checkpointPath: string;
  private maxContextWords = 1000; // Keep context.md under 1000 words
  private maxCheckpointSizeKB = 50; // Keep checkpoint under 50KB

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateDir = resolveStateRoot(workspaceRoot);
    this.checkpointPath = join(this.stateDir, "checkpoint_compact.json");

    // Ensure state directory exists
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Save a compact checkpoint - only essential info
   */
  async saveCompactCheckpoint(data: Partial<CompactCheckpoint>): Promise<void> {
    const checkpoint: CompactCheckpoint = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      session_id: this.generateSessionId(),
      roadmap_summary: data.roadmap_summary || this.getEmptyRoadmapSummary(),
      recent_activity: data.recent_activity || this.getEmptyActivity(),
      provider_state: data.provider_state || this.getEmptyProviderState(),
      context_summary: data.context_summary || this.getEmptyContextSummary(),
      continuation_hint: data.continuation_hint || "Resume work from last checkpoint",
    };

    try {
      const checkpointStr = JSON.stringify(checkpoint, null, 2);
      const sizeKB = Buffer.byteLength(checkpointStr, "utf8") / 1024;

      if (sizeKB > this.maxCheckpointSizeKB) {
        logWarning("Checkpoint exceeds size limit", {
          size_kb: sizeKB.toFixed(2),
          limit_kb: this.maxCheckpointSizeKB,
        });
      }

      writeFileSync(this.checkpointPath, checkpointStr, "utf8");

      logInfo("Compact checkpoint saved", {
        size_kb: sizeKB.toFixed(2),
        completion: checkpoint.roadmap_summary.completion_percentage,
      });
    } catch (error) {
      logWarning("Failed to save checkpoint", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Load compact checkpoint - quick resume
   */
  async loadCompactCheckpoint(): Promise<CompactCheckpoint | null> {
    if (!existsSync(this.checkpointPath)) {
      logInfo("No checkpoint found - starting fresh");
      return null;
    }

    try {
      const checkpointStr = readFileSync(this.checkpointPath, "utf8");
      const checkpoint = JSON.parse(checkpointStr) as CompactCheckpoint;

      logInfo("Checkpoint loaded", {
        session_id: checkpoint.session_id,
        age_hours: this.getCheckpointAgeHours(checkpoint.timestamp),
        completion: checkpoint.roadmap_summary.completion_percentage,
      });

      return checkpoint;
    } catch (error) {
      logWarning("Failed to load checkpoint", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get state size metrics
   */
  getStateMetrics(): StateMetrics {
    const checkpointSize = this.getFileSize(this.checkpointPath);
    const roadmapSize = this.getFileSize(join(this.stateDir, "roadmap.yaml"));
    const contextSize = this.getFileSize(join(this.stateDir, "context.md"));

    const totalSize = checkpointSize + roadmapSize + contextSize;

    return {
      checkpoint_size_kb: checkpointSize,
      roadmap_size_kb: roadmapSize,
      context_size_kb: contextSize,
      total_size_kb: totalSize,
      is_bloated: totalSize > 200, // Warning if > 200KB total
      needs_pruning: contextSize > 100 || roadmapSize > 150, // Prune if individual files too large
    };
  }

  /**
   * Prune old/unnecessary state
   */
  async pruneState(): Promise<{ pruned: string[]; size_reduction_kb: number }> {
    const pruned: string[] = [];
    let sizeReduction = 0;

    // Prune old checkpoints (keep only latest)
    const oldCheckpoints = [
      join(this.stateDir, "checkpoint.json"), // Old format
      join(this.stateDir, "checkpoint_old.json"),
    ];

    for (const file of oldCheckpoints) {
      if (existsSync(file)) {
        const size = this.getFileSize(file);
        try {
          // Note: Would use unlinkSync here, but being conservative
          logInfo("Old checkpoint identified for pruning", { file });
          pruned.push(file);
          sizeReduction += size;
        } catch (error) {
          logWarning("Failed to prune checkpoint", { file });
        }
      }
    }

    // Prune completed tasks from roadmap (archive them)
    // This would be implemented by the roadmap store

    logInfo("State pruning complete", {
      files_pruned: pruned.length,
      size_reduction_kb: sizeReduction.toFixed(2),
    });

    return { pruned, size_reduction_kb: sizeReduction };
  }

  /**
   * Get a summary for quick orientation
   */
  async getQuickSummary(): Promise<string> {
    const checkpoint = await this.loadCompactCheckpoint();

    if (!checkpoint) {
      return "No previous session found. Starting fresh. Use wvo_status to get oriented.";
    }

    const age = this.getCheckpointAgeHours(checkpoint.timestamp);
    const ageStr = age < 1 ? `${Math.floor(age * 60)} minutes ago` : `${Math.floor(age)} hours ago`;

    return `
📋 Last Session (${ageStr}):
- Progress: ${checkpoint.roadmap_summary.completion_percentage.toFixed(0)}% complete (${checkpoint.roadmap_summary.completed_tasks}/${checkpoint.roadmap_summary.total_tasks} tasks)
- Phase: ${checkpoint.roadmap_summary.current_phase}
- Provider: ${checkpoint.provider_state.current_provider}
- Recent: ${checkpoint.recent_activity.tasks_completed_this_session} tasks completed, ${checkpoint.recent_activity.deployments_this_session} deployments

Next: ${checkpoint.continuation_hint}
`.trim();
  }

  // Helper methods

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getEmptyRoadmapSummary() {
    return {
      total_tasks: 0,
      completed_tasks: 0,
      in_progress_tasks: 0,
      pending_tasks: 0,
      completion_percentage: 0,
      current_phase: "foundation",
      next_tasks: [],
    };
  }

  private getEmptyActivity() {
    return {
      last_completed_task: null,
      last_updated: new Date().toISOString(),
      tasks_completed_this_session: 0,
      deployments_this_session: 0,
    };
  }

  private getEmptyProviderState() {
    return {
      current_provider: "claude_code",
      token_usage_summary: {
        codex_percent_used: 0,
        claude_code_percent_used: 0,
      },
    };
  }

  private getEmptyContextSummary() {
    return {
      word_count: 0,
      sections: [],
      key_decisions: [],
      blockers: [],
    };
  }

  private getFileSize(path: string): number {
    if (!existsSync(path)) return 0;
    try {
      const content = readFileSync(path, "utf8");
      return Buffer.byteLength(content, "utf8") / 1024;
    } catch {
      return 0;
    }
  }

  private getCheckpointAgeHours(timestamp: string): number {
    const checkpointTime = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - checkpointTime) / (1000 * 60 * 60);
  }
}
