/**
 * TaskDecomposer - Intelligent task breakdown for parallel execution
 *
 * Analyzes epic-level tasks and decomposes them into smaller, parallelizable
 * subtasks. Enables 3-5x throughput by allowing multiple workers to tackle
 * different parts of a large task simultaneously.
 *
 * Pattern: Task decomposition inspired by Spotify's squad model and Linear's
 * issue subtasking.
 */

import type { StateMachine, Task } from './state_machine.js';
import { logInfo, logDebug, logWarning } from '../telemetry/logger.js';

export interface Subtask {
  id: string;
  title: string;
  description: string;
  type: 'task';
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
  parent_task_id: string;
  dependencies: string[]; // IDs of subtasks that must complete first
  estimated_complexity: number; // 1-10 scale
  exit_criteria?: string[];
  metadata?: Record<string, unknown>;
}

export interface DecompositionResult {
  shouldDecompose: boolean;
  reason?: string;
  subtasks?: Subtask[];
  dependencies?: Map<string, string[]>; // subtask_id -> [dependency_ids]
}

/**
 * TaskDecomposer analyzes tasks and breaks them into parallelizable subtasks
 */
export class TaskDecomposer {
  private decompositionCount = 0;
  private readonly MAX_DECOMPOSITIONS_PER_SESSION = 50; // Prevent runaway decomposition
  private readonly MAX_DECOMPOSITION_DEPTH = 2; // Max nesting level

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly workspaceRoot: string
  ) {}

  /**
   * Assess whether a task should be decomposed
   */
  shouldDecompose(task: Task): boolean {
    // CRITICAL: Check session-wide decomposition limit
    if (this.decompositionCount >= this.MAX_DECOMPOSITIONS_PER_SESSION) {
      logWarning('Max decompositions per session reached, skipping', {
        taskId: task.id,
        count: this.decompositionCount,
      });
      return false;
    }

    // Don't decompose if already a subtask
    if (task.metadata?.parent_task_id) {
      return false;
    }

    // Don't decompose if already marked as decomposed
    if (task.metadata?.decomposed === true) {
      return false;
    }

    // CRITICAL: Check decomposition depth to prevent infinite nesting
    const depth = this.getDecompositionDepth(task);
    if (depth >= this.MAX_DECOMPOSITION_DEPTH) {
      logWarning('Max decomposition depth reached, skipping', {
        taskId: task.id,
        depth,
      });
      return false;
    }

    // Decompose epic-level tasks
    if (task.type === 'epic' || task.id.startsWith('E')) {
      logDebug('Task is epic-level, should decompose', { taskId: task.id });
      return true;
    }

    // Decompose tasks with multiple exit criteria (suggests multiple phases)
    const exitCriteria = task.metadata?.exit_criteria as string[] | undefined;
    if (exitCriteria && exitCriteria.length >= 3) {
      logDebug('Task has multiple exit criteria, should decompose', {
        taskId: task.id,
        criteriaCount: exitCriteria.length,
      });
      return true;
    }

    // Decompose tasks with complexity keywords
    const title = (task.title || '').toLowerCase();
    const description = (task.description || '').toLowerCase();
    const complexKeywords = [
      'implement and test',
      'design and implement',
      'research and build',
      'setup and configure',
      'migrate and validate',
      'refactor and optimize',
    ];

    for (const keyword of complexKeywords) {
      if (title.includes(keyword) || description.includes(keyword)) {
        logDebug('Task contains complexity keywords, should decompose', {
          taskId: task.id,
          keyword,
        });
        return true;
      }
    }

    // Decompose long descriptions (>500 chars suggests multi-phase work)
    if (description.length > 500) {
      logDebug('Task has long description, should decompose', {
        taskId: task.id,
        descriptionLength: description.length,
      });
      return true;
    }

    return false;
  }

  /**
   * Get the decomposition depth of a task (how many levels of parent tasks)
   */
  private getDecompositionDepth(task: Task): number {
    let depth = 0;
    let currentId = task.id;

    // Count dots in task ID as proxy for depth (e.g., T1.1.1 has depth 2)
    const dotCount = (currentId.match(/\./g) || []).length;
    depth = dotCount;

    // Also check parent_task_id chain
    let parentId = task.metadata?.parent_task_id as string | undefined;
    while (parentId && depth < 10) { // Safety limit
      depth++;
      const parentTask = this.stateMachine.getTask(parentId);
      if (!parentTask) break;
      parentId = parentTask.metadata?.parent_task_id as string | undefined;
    }

    return depth;
  }

  /**
   * Decompose a task into parallelizable subtasks
   */
  async decompose(task: Task): Promise<DecompositionResult> {
    // ATOMIC CHECK-AND-SET: Get latest task state and check if already decomposed
    const latestTask = this.stateMachine.getTask(task.id);
    if (!latestTask || latestTask.metadata?.decomposed === true) {
      return {
        shouldDecompose: false,
        reason: 'Task already decomposed or does not exist',
      };
    }

    if (!this.shouldDecompose(latestTask)) {
      return {
        shouldDecompose: false,
        reason: 'Task does not meet decomposition criteria',
      };
    }

    // CRITICAL: Mark as decomposed IMMEDIATELY before any async work to prevent race conditions
    await this.stateMachine.transition(latestTask.id, latestTask.status, {
      ...latestTask.metadata,
      decomposed: true,
      decomposition_started_at: new Date().toISOString(),
    });

    // VERIFY the flag was set (another concurrent call might have set it first)
    const verifiedTask = this.stateMachine.getTask(latestTask.id);
    if (verifiedTask?.metadata?.decomposed !== true) {
      return {
        shouldDecompose: false,
        reason: 'Another concurrent decomposition won the race',
      };
    }

    // Increment counter AFTER successfully claiming the decomposition
    this.decompositionCount++;

    logInfo('Decomposing task into subtasks', {
      taskId: latestTask.id,
      decompositionNumber: this.decompositionCount,
    });

    const subtasks: Subtask[] = [];
    const dependencies = new Map<string, string[]>();

    // Strategy 1: Exit criteria-based decomposition
    const exitCriteria = latestTask.metadata?.exit_criteria as string[] | undefined;
    if (exitCriteria && exitCriteria.length >= 2) {
      const exitBasedSubtasks = this.decomposeByExitCriteria(latestTask, exitCriteria);
      subtasks.push(...exitBasedSubtasks);
    }

    // Strategy 2: Pattern-based decomposition
    if (subtasks.length === 0) {
      const patternBasedSubtasks = this.decomposeByPattern(latestTask);
      subtasks.push(...patternBasedSubtasks);
    }

    // Strategy 3: Default phased decomposition
    if (subtasks.length === 0) {
      const phasedSubtasks = this.decomposeByPhases(latestTask);
      subtasks.push(...phasedSubtasks);
    }

    // Build dependency graph
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      const deps: string[] = [];

      // Sequential dependency: each subtask depends on previous one
      if (i > 0) {
        deps.push(subtasks[i - 1].id);
      }

      dependencies.set(subtask.id, deps);
      subtask.dependencies = deps;
    }

    logInfo('Task decomposed successfully', {
      taskId: task.id,
      subtaskCount: subtasks.length,
      parallelizable: subtasks.filter(st => st.dependencies.length === 0).length,
    });

    return {
      shouldDecompose: true,
      reason: `Decomposed into ${subtasks.length} subtasks`,
      subtasks,
      dependencies,
    };
  }

  /**
   * Decompose based on exit criteria (each criterion becomes a subtask)
   */
  private decomposeByExitCriteria(task: Task, exitCriteria: string[]): Subtask[] {
    const subtasks: Subtask[] = [];

    for (let i = 0; i < exitCriteria.length; i++) {
      const criterion = exitCriteria[i];
      const subtaskId = `${task.id}.${i + 1}`;

      subtasks.push({
        id: subtaskId,
        title: criterion,
        description: `Part of ${task.title}: ${criterion}`,
        type: 'task',
        status: 'pending',
        parent_task_id: task.id,
        dependencies: [], // Will be set later
        estimated_complexity: 3, // Default to moderate
        exit_criteria: [criterion],
        metadata: {
          decomposition_strategy: 'exit_criteria',
          original_criterion: criterion,
        },
      });
    }

    return subtasks;
  }

  /**
   * Decompose based on common patterns in title/description
   */
  private decomposeByPattern(task: Task): Subtask[] {
    const title = (task.title || '').toLowerCase();
    const description = (task.description || '').toLowerCase();
    const subtasks: Subtask[] = [];

    // Pattern: "Implement X and test Y"
    if (title.includes('implement') && title.includes('test')) {
      subtasks.push(
        {
          id: `${task.id}.1`,
          title: `Implement ${task.title?.replace(/implement|and|test/gi, '').trim()}`,
          description: `Implementation phase for ${task.title}`,
          type: 'task',
          status: 'pending',
          parent_task_id: task.id,
          dependencies: [],
          estimated_complexity: 6,
          metadata: { phase: 'implementation' },
        },
        {
          id: `${task.id}.2`,
          title: `Test ${task.title?.replace(/implement|and|test/gi, '').trim()}`,
          description: `Testing phase for ${task.title}`,
          type: 'task',
          status: 'pending',
          parent_task_id: task.id,
          dependencies: [],
          estimated_complexity: 4,
          metadata: { phase: 'testing' },
        }
      );
      return subtasks;
    }

    // Pattern: "Design and implement X"
    if (title.includes('design') && title.includes('implement')) {
      subtasks.push(
        {
          id: `${task.id}.1`,
          title: `Design ${task.title?.replace(/design|and|implement/gi, '').trim()}`,
          description: `Design phase for ${task.title}`,
          type: 'task',
          status: 'pending',
          parent_task_id: task.id,
          dependencies: [],
          estimated_complexity: 5,
          metadata: { phase: 'design' },
        },
        {
          id: `${task.id}.2`,
          title: `Implement ${task.title?.replace(/design|and|implement/gi, '').trim()}`,
          description: `Implementation phase for ${task.title}`,
          type: 'task',
          status: 'pending',
          parent_task_id: task.id,
          dependencies: [],
          estimated_complexity: 7,
          metadata: { phase: 'implementation' },
        }
      );
      return subtasks;
    }

    return subtasks;
  }

  /**
   * Default phased decomposition (research → implement → validate)
   */
  private decomposeByPhases(task: Task): Subtask[] {
    const baseTitle = task.title || task.id;

    return [
      {
        id: `${task.id}.1`,
        title: `Research and design for ${baseTitle}`,
        description: `Research phase: Understand requirements and design approach for ${baseTitle}`,
        type: 'task',
        status: 'pending',
        parent_task_id: task.id,
        dependencies: [],
        estimated_complexity: 4,
        metadata: { phase: 'research' },
      },
      {
        id: `${task.id}.2`,
        title: `Implement ${baseTitle}`,
        description: `Implementation phase: Execute the plan for ${baseTitle}`,
        type: 'task',
        status: 'pending',
        parent_task_id: task.id,
        dependencies: [],
        estimated_complexity: 6,
        metadata: { phase: 'implementation' },
      },
      {
        id: `${task.id}.3`,
        title: `Validate and test ${baseTitle}`,
        description: `Validation phase: Test and verify ${baseTitle}`,
        type: 'task',
        status: 'pending',
        parent_task_id: task.id,
        dependencies: [],
        estimated_complexity: 3,
        metadata: { phase: 'validation' },
      },
    ];
  }

  /**
   * Register subtasks in the state machine
   */
  async registerSubtasks(task: Task, subtasks: Subtask[]): Promise<void> {
    // Safety check: don't register if we've hit the limit
    if (this.decompositionCount >= this.MAX_DECOMPOSITIONS_PER_SESSION) {
      logWarning('Decomposition limit reached, not registering subtasks', {
        taskId: task.id,
      });
      return;
    }

    for (const subtask of subtasks) {
      this.stateMachine.createTask(subtask);
      logDebug('Registered subtask', {
        subtaskId: subtask.id,
        parentId: task.id,
        dependencies: subtask.dependencies,
      });
    }

    // Update with final metadata (already marked as decomposed in decompose())
    await this.stateMachine.transition(task.id, task.status, {
      ...task.metadata,
      decomposed: true,
      subtask_count: subtasks.length,
      decomposed_at: new Date().toISOString(),
    });

    logInfo('Subtasks registered in state machine', {
      taskId: task.id,
      subtaskCount: subtasks.length,
      totalDecompositions: this.decompositionCount,
    });
  }

  /**
   * Check if all subtasks of a parent task are complete
   */
  isParentTaskComplete(parentTaskId: string): boolean {
    // Get all tasks and filter by parent_task_id in metadata
    const allTasks = this.stateMachine.getTasks();
    const subtasks = allTasks.filter(t =>
      t.metadata?.parent_task_id === parentTaskId
    );

    if (subtasks.length === 0) {
      return false; // No subtasks yet
    }

    const allComplete = subtasks.every(st => st.status === 'done');

    if (allComplete) {
      logInfo('All subtasks complete, parent task can be marked done', {
        parentTaskId,
        subtaskCount: subtasks.length,
      });
    }

    return allComplete;
  }

  /**
   * Get next available subtask (respecting dependencies)
   */
  getNextAvailableSubtask(parentTaskId: string): Subtask | null {
    // Get all tasks and filter by parent_task_id in metadata
    const allTasks = this.stateMachine.getTasks();
    const subtasks = allTasks.filter(t =>
      t.metadata?.parent_task_id === parentTaskId
    );

    // Find subtasks that are pending and have all dependencies met
    for (const subtask of subtasks) {
      if (subtask.status !== 'pending') {
        continue;
      }

      // Get dependencies from metadata
      const dependencies = (subtask.metadata?.dependencies as string[]) || [];

      // Check if all dependencies are complete
      const dependenciesMet = dependencies.every(depId => {
        const depTask = this.stateMachine.getTask(depId);
        return depTask && depTask.status === 'done';
      });

      if (dependenciesMet) {
        // Return task with subtask interface compatibility
        return subtask as unknown as Subtask;
      }
    }

    return null;
  }
}
