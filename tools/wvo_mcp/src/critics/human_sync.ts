import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";


import { Critic, CriticResult } from "./base.js";

export class HumanSyncCritic extends Critic {
  async run(profile: string): Promise<CriticResult> {
    const statusPath = path.join(this.workspaceRoot, "docs", "STATUS.md");
    const contextPath = path.join(this.stateRoot, "context.md");
    const roadmapPath = path.join(this.stateRoot, "roadmap.yaml");
    const lines: string[] = [];

    lines.push(`# WeatherVane Status Digest`);
    lines.push(`_Generated: ${new Date().toISOString()} (profile: ${profile})_`);
    lines.push("");

    if (existsSync(contextPath)) {
      const contextContent = readFileSync(contextPath, "utf-8").trim();
      lines.push("## Recent Context Highlights");
      lines.push(contextContent ? contextContent : "_No context updates found._");
      lines.push("");
    } else {
      lines.push("## Recent Context Highlights");
      lines.push("_state/context.md not found._");
      lines.push("");
    }

    if (existsSync(roadmapPath)) {
      const roadmapContent = readFileSync(roadmapPath, "utf-8")
        .split("\n")
        .slice(0, 200)
        .join("\n");
      lines.push("## Roadmap Snapshot (truncated)");
      lines.push("```yaml");
      lines.push(roadmapContent);
      lines.push("```");
    } else {
      lines.push("## Roadmap Snapshot");
      lines.push("_state/roadmap.yaml not found._");
    }

    const output = `${lines.join("\n")}\n`;
    mkdirSync(path.dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, output, "utf-8");

    const result: CriticResult = {
      critic: "human_sync",
      code: 0,
      stdout: `Updated ${path.relative(this.workspaceRoot, statusPath)}`,
      stderr: "",
      passed: true,
    };

    return this.finalizeResult(result);
  }

  // eslint-disable-next-line class-methods-use-this
  protected command(): string | null {
    return null;
  }
}
