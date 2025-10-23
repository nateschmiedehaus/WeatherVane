/**
 * Git Recovery - Automatic git error resolution
 *
 * Provides automatic recovery for common git errors:
 * - Locked index
 * - Detached HEAD
 * - Merge conflicts (auto-resolve)
 * - Dirty worktree (auto-commit)
 * - Missing upstream
 * - Diverged branches
 */

import { execSync } from "child_process";
import path from "path";

export interface GitStatus {
  branch: string;
  detached: boolean;
  clean: boolean;
  hasConflicts: boolean;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  lastCommit: string;
}

export interface GitRecoveryResult {
  success: boolean;
  actions: string[];
  errors: string[];
  finalStatus: GitStatus;
}

export class GitRecovery {
  private workspaceRoot: string;
  private recoveryScript: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.recoveryScript = path.join(
      workspaceRoot,
      "tools/wvo_mcp/scripts/git_error_recovery.sh"
    );
  }

  /**
   * Get current git status
   */
  async getStatus(): Promise<GitStatus> {
    try {
      // Get branch
      let branch = "";
      let detached = false;
      try {
        branch = execSync("git symbolic-ref --short HEAD", {
          cwd: this.workspaceRoot,
          encoding: "utf-8",
        }).trim();
      } catch {
        detached = true;
        branch = execSync("git rev-parse --short HEAD", {
          cwd: this.workspaceRoot,
          encoding: "utf-8",
        }).trim();
      }

      // Check if clean
      const statusOutput = execSync("git status --porcelain", {
        cwd: this.workspaceRoot,
        encoding: "utf-8",
      });
      const clean = statusOutput.trim().length === 0;

      // Check for conflicts
      const conflictsOutput = execSync(
        "git diff --name-only --diff-filter=U",
        {
          cwd: this.workspaceRoot,
          encoding: "utf-8",
        }
      );
      const hasConflicts = conflictsOutput.trim().length > 0;

      // Get upstream info
      let hasUpstream = false;
      let ahead = 0;
      let behind = 0;

      try {
        const upstream = execSync(
          "git rev-parse --abbrev-ref --symbolic-full-name @{u}",
          {
            cwd: this.workspaceRoot,
            encoding: "utf-8",
          }
        ).trim();

        if (upstream) {
          hasUpstream = true;

          // Count ahead/behind
          try {
            ahead = parseInt(
              execSync(`git rev-list --count HEAD ^${upstream}`, {
                cwd: this.workspaceRoot,
                encoding: "utf-8",
              }).trim(),
              10
            );
          } catch {
            ahead = 0;
          }

          try {
            behind = parseInt(
              execSync(`git rev-list --count ${upstream} ^HEAD`, {
                cwd: this.workspaceRoot,
                encoding: "utf-8",
              }).trim(),
              10
            );
          } catch {
            behind = 0;
          }
        }
      } catch {
        // No upstream
      }

      // Get last commit
      const lastCommit = execSync("git rev-parse --short HEAD", {
        cwd: this.workspaceRoot,
        encoding: "utf-8",
      }).trim();

      return {
        branch,
        detached,
        clean,
        hasConflicts,
        hasUpstream,
        ahead,
        behind,
        lastCommit,
      };
    } catch (error) {
      throw new Error(`Failed to get git status: ${error}`);
    }
  }

  /**
   * Run automatic recovery
   */
  async recover(): Promise<GitRecoveryResult> {
    const actions: string[] = [];
    const errors: string[] = [];

    try {
      // Run recovery script
      const output = execSync(`bash "${this.recoveryScript}"`, {
        cwd: this.workspaceRoot,
        encoding: "utf-8",
        timeout: 60000, // 1 minute max
      });

      // Parse output for actions taken
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.includes("✓") || line.includes("⚡")) {
          actions.push(line.replace(/\x1b\[[0-9;]*m/g, "")); // Strip ANSI codes
        }
      }

      // Get final status
      const finalStatus = await this.getStatus();

      return {
        success: true,
        actions,
        errors,
        finalStatus,
      };
    } catch (error) {
      errors.push(`Recovery script failed: ${error}`);

      // Try to get status anyway
      let finalStatus: GitStatus;
      try {
        finalStatus = await this.getStatus();
      } catch {
        // If we can't even get status, return a default
        finalStatus = {
          branch: "unknown",
          detached: true,
          clean: false,
          hasConflicts: false,
          hasUpstream: false,
          ahead: 0,
          behind: 0,
          lastCommit: "unknown",
        };
      }

      return {
        success: false,
        actions,
        errors,
        finalStatus,
      };
    }
  }

  /**
   * Check if repository needs recovery
   */
  async needsRecovery(): Promise<boolean> {
    try {
      const status = await this.getStatus();

      // Needs recovery if:
      // - Detached HEAD
      // - Has conflicts
      // - Behind remote
      return status.detached || status.hasConflicts || status.behind > 0;
    } catch {
      // If we can't get status, assume we need recovery
      return true;
    }
  }

  /**
   * Auto-commit all changes
   */
  async autoCommit(message?: string): Promise<boolean> {
    try {
      const gitHandlerScript = path.join(
        this.workspaceRoot,
        "tools/wvo_mcp/scripts/autopilot_git_handler.sh"
      );

      execSync(`bash "${gitHandlerScript}" auto`, {
        cwd: this.workspaceRoot,
        encoding: "utf-8",
        timeout: 30000,
      });

      return true;
    } catch (error) {
      console.error("Auto-commit failed:", error);
      return false;
    }
  }

  /**
   * Get human-readable status message
   */
  async getStatusMessage(): Promise<string> {
    const status = await this.getStatus();

    let msg = `Branch: ${status.branch}`;

    if (status.detached) {
      msg += " (DETACHED HEAD)";
    }

    if (!status.clean) {
      msg += " - has uncommitted changes";
    }

    if (status.hasConflicts) {
      msg += " - HAS CONFLICTS";
    }

    if (status.hasUpstream) {
      if (status.ahead > 0 && status.behind > 0) {
        msg += ` - diverged (${status.ahead} ahead, ${status.behind} behind)`;
      } else if (status.ahead > 0) {
        msg += ` - ahead by ${status.ahead}`;
      } else if (status.behind > 0) {
        msg += ` - behind by ${status.behind}`;
      } else {
        msg += " - up to date";
      }
    }

    return msg;
  }

  /**
   * Recover and log result
   */
  async recoverWithLogging(): Promise<boolean> {
    console.log("🔧 Running git error recovery...");

    const result = await this.recover();

    if (result.success) {
      console.log("✓ Git recovery successful");
      for (const action of result.actions) {
        console.log(`  ${action}`);
      }
    } else {
      console.error("✗ Git recovery had issues:");
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
    }

    const statusMsg = await this.getStatusMessage();
    console.log(`Status: ${statusMsg}`);

    return result.success;
  }
}
