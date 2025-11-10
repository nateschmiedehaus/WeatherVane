import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { attachOutputStreams } from "./verify_log.js";
import { fallbackCoverage, normalizeCoverage, readCoverageReport } from "./verify_coverage_utils.js";
import type { NormalizedCoverage, V8CoverageEntry } from "./verify_types.js";

export async function collectCoverageArtifacts(
  taskId: string,
  coverageArtifactsDir: string,
  stateRoot: string,
  workspaceRoot: string,
  ensureDir: (dir: string) => void,
  logStream?: fs.WriteStream,
): Promise<NormalizedCoverage> {
  fs.rmSync(coverageArtifactsDir, { recursive: true, force: true });
  ensureDir(coverageArtifactsDir);

  const testProcess = execa("npm", ["run", "test", "--", "--config", "vitest.verify.config.ts"], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      VITEST_COVERAGE_DIR: coverageArtifactsDir,
      WVO_STATE_ROOT: stateRoot,
    },
  });
  attachOutputStreams(testProcess, logStream);
  await testProcess;

  const coverageReport = readCoverageReport([
    path.join(coverageArtifactsDir, "coverage-final.json"),
    path.join(coverageArtifactsDir, "coverage-summary.json"),
  ]);

  if (coverageReport && typeof coverageReport === "object") {
    const normalized = normalizeCoverage(
      coverageReport as Record<string, V8CoverageEntry>,
      workspaceRoot,
    );
    if (Object.keys(normalized.files).length > 0) {
      return normalized;
    }
  }

  return fallbackCoverage(taskId);
}
