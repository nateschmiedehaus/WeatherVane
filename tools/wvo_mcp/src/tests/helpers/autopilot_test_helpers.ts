/**
 * Helper utilities for testing Autopilot integrations
 */

export interface MockTask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  scope: string;
}

export interface MockedAutopilot {
  escalateTasks(tasks: MockTask[]): void;
  getEscalatedTasks(): MockTask[];
  mockModelingRealityFailure(message: string, details?: unknown): void;
}

export function mockAutopilot(): MockedAutopilot {
  const escalatedTasks: MockTask[] = [];

  const DEFAULT_ESCALATION = {
    MODELING_REALITY: {
      research: {
        title: '[Modeling] Debug ML validation failures',
        description: 'Investigate model quality failures, identify root causes, and provide remediation guidance for the engineering team.',
        assignee: 'Research Orchestrator',
        scope: 'systemic',
      },
      director: {
        title: '[Director Dana] Review ML quality standards',
        description: 'Review failing validations, approve remediation approach, and update thresholds if needed based on new learnings.',
        assignee: 'Director Dana',
        scope: 'ml',
      },
    },
  };

  return {
    escalateTasks(tasks: MockTask[]): void {
      escalatedTasks.push(...tasks);
    },
    getEscalatedTasks(): MockTask[] {
      return [...escalatedTasks];
    },
    mockModelingRealityFailure(message: string, details?: unknown): void {
      const escalation = DEFAULT_ESCALATION.MODELING_REALITY;
      const tasks: MockTask[] = [
        {
          id: 'mock-research-task',
          ...escalation.research,
          description: `${escalation.research.description}\n\nFailure: ${message}${details ? `\nDetails: ${JSON.stringify(details)}` : ''}`,
        },
        {
          id: 'mock-director-task',
          ...escalation.director,
          description: `${escalation.director.description}\n\nFailure: ${message}${details ? `\nDetails: ${JSON.stringify(details)}` : ''}`,
        },
      ];
      this.escalateTasks(tasks);
    },
  };
}