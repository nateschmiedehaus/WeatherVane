import fs from "node:fs/promises";
import path from "node:path";

function assertInWorkspace(workspaceRoot: string, targetPath: string): string {
  const resolved = path.resolve(workspaceRoot, targetPath);
  if (!resolved.startsWith(path.resolve(workspaceRoot))) {
    throw new Error(`Path ${targetPath} resolves outside workspace root`);
  }
  return resolved;
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
): Promise<void> {
  const resolved = assertInWorkspace(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf8");
}
