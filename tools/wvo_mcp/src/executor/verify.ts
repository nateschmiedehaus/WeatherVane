import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { appendScasTrailerIfPresent, closeLogStream, createVerifyLog, ensureMinimumLogSize } from "./verify_log.js";
import { collectCoverageArtifacts } from "./verify_coverage.js";
import {
  filterChangedFiles,
  isTestFile,
  normalizeCoverage,
  readCoverageReport,
} from "./verify_coverage_utils.js";
import type { CoverageAllowlist, NormalizedCoverage } from "./verify_types.js";

export { filterChangedFiles, isTestFile, normalizeCoverage, readCoverageReport };
export type { CoverageAllowlist };

const __filename = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = path.resolve(path.dirname(__filename), "..", "..");

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, data: unknown): void {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(filePath, payload, "utf8");
}

function parseArgs(argv: string[]): { taskId: string } {
  let taskId: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--task" && i + 1 < argv.length) {
      taskId = argv[i + 1];
      i += 1;
    }
  }

  if (!taskId) {
    throw new Error("Missing --task <TASK-ID>. Aborting verify run.");
  }

  return { taskId };
}

async function main(): Promise<void> {
  let logStream: fs.WriteStream | null = null;
  try {
    const { taskId } = parseArgs(process.argv.slice(2));
    const stateRoot =
      process.env.WVO_STATE_ROOT ?? path.join(WORKSPACE_ROOT, "..", "..", "state");
    const resolvedStateRoot = path.resolve(stateRoot);

    const verifyDir = path.join(resolvedStateRoot, "logs", taskId, "verify");
    const coverageDir = path.join(resolvedStateRoot, "logs", taskId, "coverage");
    const coverageArtifactsDir = path.join(verifyDir, "coverage_artifacts");

    ensureDir(verifyDir);
    ensureDir(coverageDir);
    ensureDir(coverageArtifactsDir);

    const logPath = path.join(verifyDir, "verify.log");
    const coveragePath = path.join(coverageDir, "coverage.json");
    const coverageSummaryPath = path.join(coverageArtifactsDir, "coverage-summary.json");
    const coverageFinalPath = path.join(coverageArtifactsDir, "coverage-final.json");

    const startTicks = performance.now();
    const startedAt = new Date();
    logStream = createVerifyLog(logPath, taskId, resolvedStateRoot, startedAt);

    const coverage = await collectCoverageArtifacts(
      taskId,
      coverageArtifactsDir,
      resolvedStateRoot,
      WORKSPACE_ROOT,
      ensureDir,
      logStream,
    );
    writeJson(coveragePath, coverage);
    writeJson(coverageSummaryPath, coverage.summary);
    writeJson(coverageFinalPath, coverage.files);

    const changedPathsPath = path.join(verifyDir, "changed_files.json");
    writeJson(changedPathsPath, {
      tracked: Object.keys(coverage.files),
      generated_at: new Date().toISOString(),
    });

    if (logStream) {
      logCoverageSummary(logStream, coverage, coverageArtifactsDir, changedPathsPath);
      await closeLogStream(logStream);
      logStream = null;
    }

    appendScasTrailerIfPresent(logPath, resolvedStateRoot, taskId);
    ensureMinimumLogSize(logPath);

    const durationMs = Math.round(performance.now() - startTicks);
    console.log(
      `VERIFY COMPLETE for ${taskId} in ${durationMs}ms – artifacts in ${path.relative(
        WORKSPACE_ROOT,
        verifyDir,
      )}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    if (logStream) {
      try {
        await closeLogStream(logStream);
      } catch {
        // avoid masking verify status
      }
    }
  }
}

function logCoverageSummary(
  stream: fs.WriteStream,
  coverage: NormalizedCoverage,
  coverageArtifactsDir: string,
  changedPathsPath: string,
): void {
  const coverageCount = Object.keys(coverage.files).length;
  const statements = Number(coverage.summary.statements ?? 0);
  const hits = Number(coverage.summary.hits ?? 0);
  stream.write(
    [
      `COVERAGE FILES: ${coverageCount}`,
      `COVERAGE SUMMARY: statements=${statements} hits=${hits}`,
      `ARTIFACTS_DIR: ${path.relative(WORKSPACE_ROOT, coverageArtifactsDir)}`,
      `CHANGED_FILES_LOG: ${path.relative(WORKSPACE_ROOT, changedPathsPath)}`,
    ].join("\n") + "\n",
  );
}

await main();
