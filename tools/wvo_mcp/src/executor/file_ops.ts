import fs from "node:fs/promises";
import path from "node:path";

import { withSpan } from "../telemetry/tracing.js";
import { assertDryRunWriteAllowed } from "../utils/dry_run.js";

function assertInWorkspace(workspaceRoot: string, targetPath: string): string {
  const resolved = path.resolve(workspaceRoot, targetPath);
  if (!resolved.startsWith(path.resolve(workspaceRoot))) {
    throw new Error(`Path ${targetPath} resolves outside workspace root`);
  }
  return resolved;
}

/**
 * Protected file patterns that require explicit human approval before modification.
 * These are critical infrastructure files that could break the autopilot if modified incorrectly.
 */
const PROTECTED_PATTERNS = [
  // MCP infrastructure - the autopilot's own code
  /^tools\/wvo_mcp\/scripts\/autopilot\.sh$/,
  /^tools\/wvo_mcp\/scripts\/account_manager\.py$/,

  // Critical configuration
  /^state\/accounts\.yaml$/,
  /^tools\/wvo_mcp\/package\.json$/,
  /^tools\/wvo_mcp\/tsconfig\.json$/,

  // Core orchestrator files
  /^tools\/wvo_mcp\/src\/orchestrator\/.*\.ts$/,
  /^tools\/wvo_mcp\/src\/index.*\.ts$/,
];

/**
 * Check if a file path matches any protected patterns.
 */
function isProtectedFile(relativePath: string): boolean {
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = relativePath.split(path.sep).join('/');
  return PROTECTED_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

function protectedWritesAllowed(options?: { allowProtected?: boolean }): boolean {
  if (options?.allowProtected) {
    return true;
  }
  return process.env.WVO_ALLOW_PROTECTED_WRITES === '1';
}

export async function readFile(
  workspaceRoot: string,
  relativePath: string,
  options: { encoding?: BufferEncoding } = { encoding: "utf8" },
): Promise<string> {
  return withSpan("file.read", async (span) => {
    const resolved = assertInWorkspace(workspaceRoot, relativePath);
    span?.setAttribute("file.path", relativePath);
    span?.setAttribute("file.encoding", options.encoding ?? "utf8");

    try {
      const content = await fs.readFile(resolved, options.encoding ?? "utf8");
      span?.setAttribute("file.bytesRead", content.length);
      return content;
    } catch (error: unknown) {
      span?.recordException(error);
      throw error;
    }
  }, {
    attributes: {
      "file.operation": "read",
    },
  });
}

export async function writeFile(
  workspaceRoot: string,
  relativePath: string,
  content: string,
  options?: { allowProtected?: boolean },
): Promise<void> {
  return withSpan("file.write", async (span) => {
    assertDryRunWriteAllowed(`fs.write(${relativePath})`);
    const resolved = assertInWorkspace(workspaceRoot, relativePath);

    span?.setAttribute("file.path", relativePath);
    span?.setAttribute("file.bytesWritten", content.length);
    span?.setAttribute("file.protected", isProtectedFile(relativePath));

    try {
      // Check if this is a protected file
      if (isProtectedFile(relativePath)) {
        if (!protectedWritesAllowed(options)) {
          throw new Error(
            `SELF-PRESERVATION: Cannot modify protected infrastructure file: ${relativePath}\n\n` +
            `This file is part of the autopilot's critical infrastructure and requires human review.\n\n` +
            `To allow this write set WVO_ALLOW_PROTECTED_WRITES=1 (or pass {allowProtected:true}) after verifying:\n` +
            `1. The change is intentional and reviewed.\n` +
            `2. Builds/tests succeed (npm run build --prefix tools/wvo_mcp).\n` +
            `3. You understand the risk of modifying automation scripts.\n`
          );
        } else {
          console.warn(
            `[self-preservation] Overriding protection for ${relativePath}. ` +
            `This should only happen for reviewed, intentional changes.`
          );
        }
      }

      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
    } catch (error: unknown) {
      span?.recordException(error);
      throw error;
    }
  }, {
    attributes: {
      "file.operation": "write",
    },
  });
}
