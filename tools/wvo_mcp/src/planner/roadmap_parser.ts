import type {
  PlanTaskSummary,
  RoadmapDocument,
  RoadmapEpic,
  RoadmapMilestone,
  RoadmapTask,
} from "../utils/types.js";
import { normalizeClusterSpec } from "../utils/cluster.js";

export function flattenTasks(document: RoadmapDocument): PlanTaskSummary[] {
  const summaries: PlanTaskSummary[] = [];

  document.epics.forEach((epic: RoadmapEpic) => {
    epic.milestones.forEach((milestone: RoadmapMilestone) => {
      milestone.tasks.forEach((task: RoadmapTask) => {
        // Domain resolution: task → milestone → epic (most specific wins)
        const taskDomain = (task as unknown as { domain?: "product" | "mcp" }).domain;
        const milestoneDomain = (milestone as unknown as { domain?: "product" | "mcp" }).domain;
        const epicDomain = (epic as unknown as { domain?: "product" | "mcp" }).domain;
        const resolvedDomain = taskDomain ?? milestoneDomain ?? epicDomain;

        summaries.push({
          id: task.id,
          title: task.title,
          owner: task.owner,
          status: task.status,
          epic_id: epic.id,
          milestone_id: milestone.id,
          estimate_hours: task.estimate_hours,
          exit_criteria:
            task.exit_criteria?.map((criteria) => {
              if (typeof criteria === "string") return criteria;
              if (criteria && typeof criteria === "object") {
                if ("critic" in criteria) return `critic:${criteria.critic}`;
                if ("doc" in criteria) return `doc:${criteria.doc}`;
                if ("artifact" in criteria) return `artifact:${criteria.artifact}`;
                if ("note" in criteria) return `note:${criteria.note}`;
              }
              return "unknown";
            }) ?? [],
          domain: resolvedDomain,
          cluster: normalizeClusterSpec(task.cluster),
        });
      });
    });
  });

  return summaries;
}
