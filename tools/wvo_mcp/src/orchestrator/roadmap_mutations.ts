/**
 * Roadmap Mutation API - Safe Programmatic Roadmap Editing
 *
 * Enables work processes to propose and apply mutations to roadmap structure:
 * - Add/remove/reorder tasks
 * - Add/remove task sets
 * - Restructure epics
 *
 * Guardrails:
 * - Dependency validation (no cycles, no orphans)
 * - Rate limiting (max 100 mutations/day)
 * - Impact analysis
 * - Conflict detection
 * - Audit trail
 *
 * Task: AFP-HIERARCHICAL-WORK-PROCESSES-20251105
 * Pattern: hierarchical-work-process-with-meta-review
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  RoadmapMutation,
  MutationType,
  MutationValidationResult,
  MutationGuardrails,
  AddTaskMutation,
  RemoveTaskMutation,
  ReorderTasksMutation,
} from '../schemas/work_process_schema.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_GUARDRAILS: MutationGuardrails = {
  maxMutationsPerDay: 100,
  dependencyValidationRequired: true,
  impactAnalysisRequired: true,
  conflictDetectionEnabled: true,
};

// ============================================================================
// Core Mutation API
// ============================================================================

export interface RoadmapMutationConfig {
  guardrails?: Partial<MutationGuardrails>;
  roadmapPath?: string;
  mutationsLogPath?: string;
}

export class RoadmapMutationAPI {
  private guardrails: MutationGuardrails;
  private roadmapPath: string;
  private mutationsLogPath: string;

  constructor(config: RoadmapMutationConfig = {}) {
    this.guardrails = { ...DEFAULT_GUARDRAILS, ...(config.guardrails || {}) };

    // Default to workspace root paths, but allow override for testing
    const workspaceRoot = process.cwd().includes('/tools/wvo_mcp')
      ? path.join(process.cwd(), '../..')
      : process.cwd();

    this.roadmapPath = config.roadmapPath || path.join(workspaceRoot, 'state/roadmap.yaml');
    this.mutationsLogPath = config.mutationsLogPath || path.join(workspaceRoot, 'state/mutations.jsonl');
  }

  /**
   * Propose a mutation to the roadmap
   * Returns validation result without applying
   */
  async propose(mutation: RoadmapMutation): Promise<MutationValidationResult> {
    const roadmap = await this.loadRoadmap();

    // Validate mutation
    const validation = await this.validate(mutation, roadmap);

    if (!validation.valid) {
      return validation;
    }

    // Log proposal
    await this.logMutation({ ...mutation, status: 'pending' });

    return validation;
  }

  /**
   * Apply a validated mutation to the roadmap
   */
  async apply(mutation: RoadmapMutation): Promise<void> {
    const roadmap = await this.loadRoadmap();

    // Re-validate before applying
    const validation = await this.validate(mutation, roadmap);
    if (!validation.valid) {
      throw new Error(`Mutation validation failed: ${validation.errors.join(', ')}`);
    }

    // Apply mutation based on type
    switch (mutation.type) {
      case 'add_task':
        this.applyAddTask(roadmap, mutation as AddTaskMutation);
        break;
      case 'remove_task':
        this.applyRemoveTask(roadmap, mutation as RemoveTaskMutation);
        break;
      case 'reorder_tasks':
        this.applyReorderTasks(roadmap, mutation as ReorderTasksMutation);
        break;
      default:
        throw new Error(`Unsupported mutation type: ${mutation.type}`);
    }

    // Save roadmap
    await this.saveRoadmap(roadmap);

    // Log application
    await this.logMutation({ ...mutation, status: 'applied', appliedAt: Date.now() });
  }

  /**
   * Validate a mutation against guardrails
   */
  private async validate(mutation: RoadmapMutation, roadmap: any): Promise<MutationValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check rate limiting
    if (this.guardrails.maxMutationsPerDay) {
      const todayCount = await this.getMutationsToday();
      if (todayCount >= this.guardrails.maxMutationsPerDay) {
        errors.push(`Rate limit exceeded: ${todayCount}/${this.guardrails.maxMutationsPerDay} mutations today`);
      }
    }

    // Dependency validation
    let noCycles = true;
    let noOrphans = true;
    let dependenciesValid = true;

    if (this.guardrails.dependencyValidationRequired) {
      const depValidation = this.validateDependencies(mutation, roadmap);
      noCycles = depValidation.noCycles;
      noOrphans = depValidation.noOrphans;
      dependenciesValid = depValidation.valid;
      errors.push(...depValidation.errors);
    }

    // Impact analysis
    let impactAcceptable = true;
    if (this.guardrails.impactAnalysisRequired) {
      const impact = this.analyzeImpact(mutation, roadmap);
      if (impact.tasksAffected > 10) {
        warnings.push(`High impact: ${impact.tasksAffected} tasks affected`);
      }
      if (impact.complexityChange > 20) {
        warnings.push(`Significant complexity increase: +${impact.complexityChange}%`);
      }
    }

    // Conflict detection
    let noConflicts = true;
    if (this.guardrails.conflictDetectionEnabled) {
      const conflicts = await this.detectConflicts(mutation);
      if (conflicts.length > 0) {
        errors.push(`Conflicts detected: ${conflicts.join(', ')}`);
        noConflicts = false;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      checks: {
        noCycles,
        noOrphans,
        dependenciesValid,
        impactAcceptable,
        noConflicts,
      },
    };
  }

  // ============================================================================
  // Mutation Application Logic
  // ============================================================================

  private applyAddTask(roadmap: any, mutation: AddTaskMutation): void {
    const newTask = {
      id: this.generateTaskId(roadmap),
      title: mutation.operation.title,
      description: mutation.operation.description,
      status: 'pending',
      dependencies: mutation.operation.dependencies,
      exit_criteria: mutation.operation.exitCriteria,
    };

    // Find insertion point
    const tasks = roadmap.tasks || [];
    if (mutation.operation.insertAfter) {
      const index = tasks.findIndex((t: any) => t.id === mutation.operation.insertAfter);
      if (index >= 0) {
        tasks.splice(index + 1, 0, newTask);
      } else {
        tasks.push(newTask);
      }
    } else {
      tasks.push(newTask);
    }

    roadmap.tasks = tasks;
  }

  private applyRemoveTask(roadmap: any, mutation: RemoveTaskMutation): void {
    const tasks = roadmap.tasks || [];
    const index = tasks.findIndex((t: any) => t.id === mutation.operation.taskId);

    if (index < 0) {
      throw new Error(`Task not found: ${mutation.operation.taskId}`);
    }

    tasks.splice(index, 1);
    roadmap.tasks = tasks;
  }

  private applyReorderTasks(roadmap: any, mutation: ReorderTasksMutation): void {
    const tasks = roadmap.tasks || [];
    const newOrdering = mutation.operation.newOrdering;

    // Reorder tasks
    const reordered = newOrdering.map((id) => tasks.find((t: any) => t.id === id)).filter(Boolean);

    roadmap.tasks = reordered;
  }

  // ============================================================================
  // Validation Helpers
  // ============================================================================

  private validateDependencies(mutation: RoadmapMutation, roadmap: any): {
    valid: boolean;
    noCycles: boolean;
    noOrphans: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const tasks = roadmap.tasks || [];

    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    tasks.forEach((task: any) => {
      graph.set(task.id, new Set(task.dependencies || []));
    });

    // Add mutation's dependencies if it's an add_task
    let newTaskId: string | undefined;
    if (mutation.type === 'add_task') {
      const addMutation = mutation as AddTaskMutation;
      newTaskId = mutation.target;
      const dependencies = new Set(addMutation.operation.dependencies || []);

      // Check for self-dependency
      if (dependencies.has(newTaskId)) {
        errors.push(`Self-dependency detected: task ${newTaskId} depends on itself`);
      }

      graph.set(newTaskId, dependencies);
    }

    // Check for cycles
    const noCycles = !this.hasCycles(graph);
    if (!noCycles) {
      errors.push('Dependency cycle detected');
    }

    // Check for orphans (dependencies that don't exist)
    const allTaskIds = new Set(graph.keys());
    let noOrphans = true;

    graph.forEach((deps, taskId) => {
      deps.forEach((depId) => {
        if (!allTaskIds.has(depId)) {
          errors.push(`Orphan dependency: ${depId} referenced by ${taskId}`);
          noOrphans = false;
        }
      });
    });

    return {
      valid: errors.length === 0,
      noCycles,
      noOrphans,
      errors,
    };
  }

  private hasCycles(graph: Map<string, Set<string>>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          return true;
        }
      }
    }

    return false;
  }

  private analyzeImpact(mutation: RoadmapMutation, roadmap: any): {
    tasksAffected: number;
    dependenciesAffected: number;
    complexityChange: number;
  } {
    const tasks = roadmap.tasks || [];

    let tasksAffected = 0;
    let dependenciesAffected = 0;
    let complexityChange = 0;

    switch (mutation.type) {
      case 'add_task':
        tasksAffected = 1;
        dependenciesAffected = (mutation as AddTaskMutation).operation.dependencies.length;
        complexityChange = 5; // Adding a task increases complexity by ~5%
        break;
      case 'remove_task':
        tasksAffected = 1;
        // Count tasks that depend on this one
        const removedId = (mutation as RemoveTaskMutation).operation.taskId;
        tasks.forEach((task: any) => {
          if (task.dependencies?.includes(removedId)) {
            dependenciesAffected++;
          }
        });
        complexityChange = -5; // Removing a task decreases complexity by ~5%
        break;
      case 'reorder_tasks':
        tasksAffected = (mutation as ReorderTasksMutation).operation.newOrdering.length;
        complexityChange = 0; // Reordering doesn't change complexity
        break;
    }

    return { tasksAffected, dependenciesAffected, complexityChange };
  }

  private async detectConflicts(mutation: RoadmapMutation): Promise<string[]> {
    // Check for pending mutations that conflict with this one
    const pendingMutations = await this.getPendingMutations();
    const conflicts: string[] = [];

    pendingMutations.forEach((pending) => {
      if (this.mutationsConflict(mutation, pending)) {
        conflicts.push(pending.id);
      }
    });

    return conflicts;
  }

  private mutationsConflict(m1: RoadmapMutation, m2: RoadmapMutation): boolean {
    // Same target means conflict
    if (m1.target === m2.target) {
      return true;
    }

    // Add and remove of same task
    if (m1.type === 'add_task' && m2.type === 'remove_task') {
      const add = m1 as AddTaskMutation;
      const remove = m2 as RemoveTaskMutation;
      if (add.operation.title === remove.target) {
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // I/O Helpers
  // ============================================================================

  private async loadRoadmap(): Promise<any> {
    const content = await fs.readFile(this.roadmapPath, 'utf-8');
    return yaml.load(content);
  }

  private async saveRoadmap(roadmap: any): Promise<void> {
    const content = yaml.dump(roadmap, { lineWidth: 120 });
    await fs.writeFile(this.roadmapPath, content, 'utf-8');
  }

  private async logMutation(mutation: RoadmapMutation): Promise<void> {
    const log = JSON.stringify(mutation) + '\n';
    await fs.appendFile(this.mutationsLogPath, log, 'utf-8');
  }

  private async getMutationsToday(): Promise<number> {
    try {
      const content = await fs.readFile(this.mutationsLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const today = new Date().setHours(0, 0, 0, 0);

      return lines.filter((line) => {
        const mutation = JSON.parse(line);
        const mutationDate = new Date(mutation.timestamp).setHours(0, 0, 0, 0);
        return mutationDate === today;
      }).length;
    } catch (error) {
      return 0;
    }
  }

  private async getPendingMutations(): Promise<RoadmapMutation[]> {
    try {
      const content = await fs.readFile(this.mutationsLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      return lines
        .map((line) => JSON.parse(line))
        .filter((m) => m.status === 'pending');
    } catch (error) {
      return [];
    }
  }

  private generateTaskId(roadmap: any): string {
    const tasks = roadmap.tasks || [];
    const maxId = tasks.reduce((max: number, task: any) => {
      const match = task.id.match(/T(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);

    return `T${maxId + 1}`;
  }
}
