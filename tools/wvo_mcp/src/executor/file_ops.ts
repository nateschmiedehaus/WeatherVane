import fs from "node:fs/promises";
import path from "node:path";

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
  /^tools\/wvo_mcp\/src\/.*\.ts$/,
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

export async function readFile(
  workspaceRoot: string,
  relativePath: string,
  options: { encoding?: BufferEncoding } = { encoding: "utf8" },
): Promise<string> {
  const resolved = assertInWorkspace(workspaceRoot, relativePath);
  return fs.readFile(resolved, options.encoding ?? "utf8");
}

export async function writeFile(
  workspaceRoot: string,
  relativePath: string,
  content: string,
  options?: { allowProtected?: boolean },
): Promise<void> {
  const resolved = assertInWorkspace(workspaceRoot, relativePath);

  // Check if this is a protected file
  if (isProtectedFile(relativePath)) {
    // Allow writes only if explicitly permitted (for human-initiated changes)
    if (!options?.allowProtected) {
      throw new Error(
        `SELF-PRESERVATION: Cannot modify protected infrastructure file: ${relativePath}\n\n` +
        `This file is part of the autopilot's critical infrastructure and requires human review.\n` +
        `Protected files include:\n` +
        `- MCP source code (tools/wvo_mcp/src/**/*.ts)\n` +
        `- Orchestration scripts (autopilot.sh, account_manager.py)\n` +
        `- Critical configuration (accounts.yaml, package.json, tsconfig.json)\n\n` +
        `To modify this file:\n` +
        `1. Review the changes carefully\n` +
        `2. Test that the build succeeds: npm run build --prefix tools/wvo_mcp\n` +
        `3. Make changes manually or request human assistance\n\n` +
        `This protection prevents the autopilot from breaking itself during self-improvement attempts.`
      );
    }
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf8");
}
