import { promises as fs } from "node:fs";
import path from "node:path";

import { resolveStateRoot } from "../utils/config.js";

const ensuredDirectories = new Set<string>();

export interface AppendJsonlOptions {
  workspaceRoot?: string;
  relativePath: string;
}

export async function appendJsonlRecord(
  record: unknown,
  options: AppendJsonlOptions,
): Promise<void> {
  const line = JSON.stringify(record);
  await appendJsonlLine(line, options);
}

export async function appendJsonlLine(
  line: string,
  options: AppendJsonlOptions,
): Promise<void> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const stateRoot = resolveStateRoot(workspaceRoot);
  const relativePath = options.relativePath;
  const targetPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(stateRoot, relativePath);

  await ensureDirectory(targetPath);
  await fs.appendFile(targetPath, `${line}\n`, "utf8");
}

async function ensureDirectory(filePath: string): Promise<void> {
  const directory = path.dirname(filePath);
  if (ensuredDirectories.has(directory)) {
    return;
  }
  await fs.mkdir(directory, { recursive: true });
  ensuredDirectories.add(directory);
}

