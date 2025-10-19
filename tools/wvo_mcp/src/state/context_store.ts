import fs from "node:fs/promises";
import path from "node:path";

const SECTION_PREFIX = "## ";

export class ContextStore {
  constructor(private readonly stateRoot: string) {}

  private get filePath(): string {
    return path.join(this.stateRoot, "context.md");
  }

  async write(section: string, content: string, append = false): Promise<void> {
    const target = this.filePath;
    const trimmedContent = content.replace(/\s+$/u, "");

    if (append) {
      if (!trimmedContent) {
        return;
      }

      let existing = "";
      try {
        existing = await fs.readFile(target, "utf8");
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      const alreadyLogged = existing
        .split(/\r?\n/)
        .map((line) => line.trim())
        .some((line) => line === trimmedContent);
      if (alreadyLogged) {
        return;
      }

      const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
      const prefix = needsLeadingNewline ? "\n" : "";
      const suffix = content.endsWith("\n") ? "" : "\n";
      await fs.appendFile(target, `${prefix}${content}${suffix}`, "utf8");
      return;
    }

    const headerLine = `${SECTION_PREFIX}${section}`;
    const normalizedBody = trimmedContent.replace(/\r\n?/g, "\n");
    const replacementBlock = `${headerLine}\n${normalizedBody}\n`;

    let baseContent = "";
    try {
      baseContent = await fs.readFile(target, "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const sectionRegex = buildSectionRegex(section);
    const match = sectionRegex.exec(baseContent);
    if (match) {
      const existingBody = (match[2] ?? "").trim();
      if (existingBody === normalizedBody.trim()) {
        return;
      }

      const leading = match[1] ?? "";
      const trailingGap = match[3] ?? "";
      const substitute = `${leading}${replacementBlock}${trailingGap ?? ""}`;
      const replaced = baseContent.replace(sectionRegex, substitute);
      await fs.writeFile(target, `${normalizeSpacing(replaced)}\n`, "utf8");
      return;
    }

    const trimmedExisting = baseContent.trimEnd();
    const separator = trimmedExisting.length ? "\n\n" : "";
    const nextContent = `${trimmedExisting}${separator}${replacementBlock}`.trimEnd();
    await fs.writeFile(target, `${normalizeSpacing(nextContent)}\n`, "utf8");
  }
}

function buildSectionRegex(section: string): RegExp {
  const escaped = escapeRegExp(section);
  return new RegExp(
    `(^|\\n)${SECTION_PREFIX}${escaped}\\n([\\s\\S]*?)(?:(\\n{2,})|(?=\\n${SECTION_PREFIX})|$)`,
    "m",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpacing(content: string): string {
  return content.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/u, "");
}
