import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

import { Critic, type CriticResult } from "./base.js";
import { logInfo } from "../telemetry/logger.js";

export interface DocumentReviewerConfig {
  artifact: "spec" | "plan";
  fileName: string;
  logFile: string;
  requiredSections: string[];
  optionalSections?: string[];
  summaryTitle: string;
}

interface DocumentReviewAnalysis {
  approved: boolean;
  summary: string;
  missingSections: string[];
}

export class DocumentReviewerCritic extends Critic {
  constructor(workspaceRoot: string, private readonly config: DocumentReviewerConfig) {
    super(workspaceRoot);
  }

  protected command(): string | null {
    return null;
  }

  async run(profile: string): Promise<CriticResult> {
    const taskId = process.env.TASK_ID;
    if (!taskId) {
      return this.fail("TASK_ID environment variable is required to run this critic.");
    }
    return this.reviewDocument(taskId);
  }

  async reviewDocument(taskId: string): Promise<CriticResult> {
    const evidencePath = path.join(
      this.workspaceRoot,
      "state",
      "evidence",
      taskId,
      this.config.fileName,
    );

    if (!fs.existsSync(evidencePath)) {
      const message = `${this.config.fileName} not found for ${taskId}`;
      await this.logReview(taskId, {
        approved: false,
        summary: message,
        missingSections: [this.config.fileName],
      });
      return this.fail(message);
    }

    const content = await fsp.readFile(evidencePath, "utf8");
    const missingSections = this.config.requiredSections.filter((section) => !content.includes(section));

    const analysis: DocumentReviewAnalysis = {
      approved: missingSections.length === 0,
      summary: this.composeSummary(taskId, missingSections),
      missingSections,
    };

    await this.logReview(taskId, analysis);

    if (!analysis.approved) {
      const details = [
        `${this.config.summaryTitle} review failed. Missing sections:`,
        ...analysis.missingSections.map((section) => `- ${section}`),
      ].join("\n");
      return this.fail(details);
    }

    const message = `${this.config.summaryTitle} review passed: all required sections present.`;
    return this.pass(message);
  }

  private composeSummary(taskId: string, missingSections: string[]): string {
    if (missingSections.length === 0) {
      return `${this.config.summaryTitle} ready for task ${taskId}.`;
    }
    return `${this.config.summaryTitle} incomplete for task ${taskId}: missing ${missingSections.join(", ")}.`;
  }

  private async logReview(taskId: string, analysis: DocumentReviewAnalysis): Promise<void> {
    const logPath = path.join(this.stateRoot, "analytics", this.config.logFile);
    const entry = {
      timestamp: new Date().toISOString(),
      task_id: taskId,
      approved: analysis.approved,
      missing_sections: analysis.missingSections,
      summary: analysis.summary,
    };

    await fsp.mkdir(path.dirname(logPath), { recursive: true });
    await fsp.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");

    logInfo(`${this.config.summaryTitle} review logged`, {
      taskId,
      approved: analysis.approved,
      missingSections: analysis.missingSections.length,
    });
  }
}
