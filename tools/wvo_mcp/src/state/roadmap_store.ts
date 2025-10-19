import fs from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

import type { RoadmapDocument, RoadmapEpic, TaskStatus } from "../utils/types.js";

export class RoadmapStore {
  constructor(private readonly stateRoot: string) {}

  private get filePath(): string {
    return path.join(this.stateRoot, "roadmap.yaml");
  }

  async read(): Promise<RoadmapDocument> {
    try {
      const content = await fs.readFile(this.filePath, "utf8");
      if (!content.trim()) {
        return { epics: [] };
      }
      const doc = YAML.parse(content);
      return doc as RoadmapDocument;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { epics: [] };
      }
      throw error;
    }
  }

  async write(document: RoadmapDocument): Promise<void> {
    const serialized = YAML.stringify(document);
    await fs.writeFile(this.filePath, serialized, "utf8");
  }

  async upsertTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const roadmap = await this.read();
    let mutated = false;

    roadmap.epics = roadmap.epics.map((epic: RoadmapEpic) => {
      const milestones = epic.milestones.map((milestone) => {
        const tasks = milestone.tasks.map((task) => {
          if (task.id === taskId) {
            mutated = true;
            return { ...task, status };
          }
          return task;
        });
        return { ...milestone, tasks };
      });
      return { ...epic, milestones };
    });

    if (!mutated) {
      throw new Error(`Task ${taskId} not found in roadmap`);
    }

    await this.write(roadmap);
  }
}
