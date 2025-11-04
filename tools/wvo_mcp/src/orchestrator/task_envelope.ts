export interface TaskEnvelope {
  id: string;
  title: string;
  description?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
  priorityTags?: string[];
}

export interface TaskCheckpointSnapshot {
  state: string;
  attempt: number;
  timestamp: string;
  payload: Record<string, unknown>;
}
