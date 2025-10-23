export interface TaskExtensions {
  estimated_hours?: number;
  exit_criteria?: string[];
  dependencies?: string[];
}

// Re-export the Task type from state_machine.js with the extensions
import type { Task as BaseTask } from './state_machine.js';
export type Task = BaseTask & TaskExtensions;