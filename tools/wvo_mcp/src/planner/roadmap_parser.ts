import type {
  PlanTaskSummary,
  RoadmapDocument,
  RoadmapEpic,
  RoadmapMilestone,
  RoadmapTask,
} from "../utils/types.js";

export function flattenTasks(document: RoadmapDocument): PlanTaskSummary[] {
  const summaries: PlanTaskSummary[] = [];

  document.epics.forEach((epic: RoadmapEpic) => {
    epic.milestones.forEach((milestone: RoadmapMilestone) => {
      milestone.tasks.forEach((task: RoadmapTask) => {
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
              if ("critic" in criteria) return `critic:${criteria.critic}`;
              if ("doc" in criteria) return `doc:${criteria.doc}`;
              if ("artifact" in criteria) return `artifact:${criteria.artifact}`;
              if ("note" in criteria) return `note:${criteria.note}`;
              return "unknown";
            }) ?? [],
        });
      });
    });
  });

  return summaries;
}
