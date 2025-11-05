import path from "node:path";
import { promises as fs } from "node:fs";

import { logInfo, logWarning } from "../telemetry/logger.js";

export interface VerificationEntry {
  name: string;
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms?: number;
  passed: boolean;
}

export class EvidenceBundleGenerator {
  static async createFromVerification(
    taskId: string,
    title: string,
    verificationResults: VerificationEntry[],
    artifacts: string[],
    metrics: Record<string, unknown>,
    workspaceRoot: string,
  ): Promise<string> {
    const evidenceDir = path.join(workspaceRoot, "state", "evidence", taskId);
    try {
      await fs.mkdir(evidenceDir, { recursive: true });
      const payload = {
        taskId,
        title,
        generatedAt: new Date().toISOString(),
        verificationResults,
        artifacts,
        metrics,
      };
      const bundlePath = path.join(evidenceDir, "verification_bundle.json");
      await fs.writeFile(bundlePath, JSON.stringify(payload, null, 2), "utf8");
      logInfo("Evidence bundle generated", { taskId, bundlePath });
      return path.relative(workspaceRoot, bundlePath).replace(/\\/g, "/");
    } catch (error) {
      logWarning("Failed to create evidence bundle", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return "";
    }
  }
}
