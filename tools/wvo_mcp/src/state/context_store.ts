import fs from "node:fs/promises";
import path from "node:path";

export class ContextStore {
  constructor(private readonly workspaceRoot: string) {}

  private get filePath(): string {
    return path.join(this.workspaceRoot, "state", "context.md");
  }

  async write(section: string, content: string, append = false): Promise<void> {
    if (append) {
      await fs.appendFile(this.filePath, `\n${content}`, "utf8");
      return;
    }

    const header = `## ${section}\n`;
    let existing = "";
    try {
      existing = await fs.readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const trimmed = existing.trimEnd();
    const separator = trimmed.length ? `\n\n` : "";
    const nextContent = `${trimmed}${separator}${header}${content}\n`;
    await fs.writeFile(this.filePath, nextContent, "utf8");
  }
}
