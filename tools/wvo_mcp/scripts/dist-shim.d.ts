declare module '../dist/src/automation/follow_up_classifier.js' {
  export interface FollowUpItem {
    id: string;
    summary: string;
    status: string;
  }

  export function classifyFollowUps(
    workspaceRoot: string,
    followUps: FollowUpItem[]
  ): Promise<FollowUpItem[]>;
}
