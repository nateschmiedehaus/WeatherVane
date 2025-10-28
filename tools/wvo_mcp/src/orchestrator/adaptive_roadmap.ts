/**
 * AdaptiveRoadmap - Self-extending roadmap based on progress
 *
 * Monitors task completion and automatically generates new tasks when
 * the roadmap is running low (<25% tasks remaining). Uses context from
 * completed tasks to generate relevant next steps.
 */

import { StateMachine, Task } from './state_machine.js';
import { ContextAssembler } from './context_assembler.js';
import { MCPClient, MCPPlanTask } from './mcp_client.js';
import { logInfo, logWarning, logDebug } from '../telemetry/logger.js';

export interface RoadmapMetrics {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  blockedTasks: number;
  completionRate: number;
  estimatedDaysRemaining: number;
}

export interface TaskSuggestion {
  title: string;
  description: string;
  type: 'feature' | 'bug' | 'improvement' | 'test' | 'docs';
  complexity: number;
  rationale: string;
  dependencies?: string[];
}

export class AdaptiveRoadmap {
  private readonly EXTENSION_THRESHOLD = 0.25; // Extend when <25% tasks remaining
  private readonly MIN_TASKS_BUFFER = 20; // Always keep at least 20 pending tasks
  private readonly MAX_COMPLEXITY = 10;
  private lastExtensionTime = 0;
  private readonly EXTENSION_COOLDOWN = 60 * 60 * 1000; // 1 hour between extensions
  private readonly mcpClient?: MCPClient;
  private useMCPFallback = false; // Track if we should use fallback

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly contextAssembler: ContextAssembler,
    mcpClient?: MCPClient  // Optional for backward compatibility
  ) {
    this.mcpClient = mcpClient;
    if (mcpClient) {
      logInfo('AdaptiveRoadmap: MCP integration enabled');
    } else {
      logInfo('AdaptiveRoadmap: Running in local mode (no MCP)');
    }
  }

  /**
   * Check if roadmap needs extension and extend if necessary
   */
  async checkAndExtend(): Promise<boolean> {
    const metrics = this.calculateMetrics();

    logDebug('AdaptiveRoadmap: Checking roadmap health', {
      pendingTasks: metrics.pendingTasks,
      completionRate: metrics.completionRate,
      estimatedDaysRemaining: metrics.estimatedDaysRemaining
    });

    if (this.shouldExtend(metrics)) {
      return await this.extendRoadmap(metrics);
    }

    return false;
  }

  /**
   * Calculate current roadmap metrics
   */
  private calculateMetrics(): RoadmapMetrics {
    const allTasks = this.stateMachine.getTasks({});
    const pending = this.stateMachine.getTasks({ status: ['pending'] });
    const completed = this.stateMachine.getTasks({ status: ['done'] });
    const blocked = this.stateMachine.getTasks({ status: ['blocked'] });

    const completionRate = allTasks.length > 0
      ? completed.length / allTasks.length
      : 0;

    // Estimate days remaining based on recent velocity
    const recentCompletions = this.getRecentCompletions(7); // Last 7 days
    const dailyVelocity = recentCompletions.length / 7;
    const estimatedDaysRemaining = dailyVelocity > 0
      ? pending.length / dailyVelocity
      : 999;

    return {
      totalTasks: allTasks.length,
      pendingTasks: pending.length,
      completedTasks: completed.length,
      blockedTasks: blocked.length,
      completionRate,
      estimatedDaysRemaining
    };
  }

  /**
   * Determine if roadmap should be extended
   */
  private shouldExtend(metrics: RoadmapMetrics): boolean {
    // Check cooldown
    const now = Date.now();
    if (now - this.lastExtensionTime < this.EXTENSION_COOLDOWN) {
      return false;
    }

    // Extend if running low on tasks
    if (metrics.pendingTasks < this.MIN_TASKS_BUFFER) {
      logInfo('AdaptiveRoadmap: Low task buffer triggered extension', {
        pendingTasks: metrics.pendingTasks,
        threshold: this.MIN_TASKS_BUFFER
      });
      return true;
    }

    // Extend if completion rate is high and few tasks remain
    if (metrics.completionRate > (1 - this.EXTENSION_THRESHOLD) &&
        metrics.estimatedDaysRemaining < 5) {
      logInfo('AdaptiveRoadmap: High completion rate triggered extension', {
        completionRate: metrics.completionRate,
        daysRemaining: metrics.estimatedDaysRemaining
      });
      return true;
    }

    return false;
  }

  /**
   * Generate and add new tasks to roadmap
   */
  private async extendRoadmap(metrics: RoadmapMetrics): Promise<boolean> {
    try {
      logInfo('AdaptiveRoadmap: Extending roadmap', {
        currentTasks: metrics.totalTasks,
        pendingTasks: metrics.pendingTasks
      });

      // Generate task suggestions based on context
      const suggestions = await this.generateTaskSuggestions();

      if (suggestions.length === 0) {
        logWarning('AdaptiveRoadmap: No task suggestions generated');
        return false;
      }

      // Add tasks to state machine
      let addedCount = 0;
      for (const suggestion of suggestions) {
        try {
          const taskId = this.generateTaskId(suggestion.type);
          await this.stateMachine.createTask({
            id: taskId,
            title: suggestion.title,
            description: suggestion.description,
            status: 'pending',
            type: 'task',
            estimated_complexity: suggestion.complexity,
            metadata: {
              generated_by: 'adaptive_roadmap',
              generation_rationale: suggestion.rationale,
              generated_at: new Date().toISOString()
            }
          });

          // Add dependencies if specified
          if (suggestion.dependencies) {
            for (const depId of suggestion.dependencies) {
              await this.stateMachine.addDependency(taskId, depId);
            }
          }

          addedCount++;
          logDebug('AdaptiveRoadmap: Added task', {
            id: taskId,
            title: suggestion.title
          });
        } catch (error) {
          logWarning('AdaptiveRoadmap: Failed to add task', {
            title: suggestion.title,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      this.lastExtensionTime = Date.now();

      logInfo('AdaptiveRoadmap: Roadmap extended successfully', {
        tasksAdded: addedCount,
        newTotal: metrics.totalTasks + addedCount
      });

      return addedCount > 0;
    } catch (error) {
      logWarning('AdaptiveRoadmap: Extension failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Generate task suggestions based on recent context
   */
  private async generateTaskSuggestions(): Promise<TaskSuggestion[]> {
    let suggestions: TaskSuggestion[] = [];

    // Try MCP first if available and not in fallback mode
    if (this.mcpClient && !this.useMCPFallback) {
      try {
        const mcpTasks = await this.fetchMCPTasks();
        if (mcpTasks && mcpTasks.length > 0) {
          suggestions = mcpTasks;
          logInfo('AdaptiveRoadmap: Using MCP tasks', {
            count: suggestions.length
          });
          return suggestions;
        }
      } catch (error) {
        logWarning('AdaptiveRoadmap: MCP fetch failed, using fallback', {
          error: error instanceof Error ? error.message : String(error)
        });
        this.useMCPFallback = true; // Switch to fallback for this session
      }
    }

    // Fallback to local generation
    logDebug('AdaptiveRoadmap: Generating tasks locally');

    // Analyze recent completions to understand patterns
    const recentTasks = this.getRecentCompletions(14); // Last 2 weeks
    const taskTypes = this.analyzeTaskTypes(recentTasks);

    // Get current context
    const context = await this.contextAssembler.assembleForTask('roadmap_extension', {
      includeCodeContext: false,
      maxDecisions: 10,
      hoursBack: 168 // Last week
    });

    // Generate balanced mix of task types
    if (taskTypes.feature < 0.3) {
      // Need more features
      suggestions.push(...this.generateFeatureTasks(context));
    }

    if (taskTypes.test < 0.2) {
      // Need more tests
      suggestions.push(...this.generateTestTasks(context));
    }

    if (taskTypes.docs < 0.1) {
      // Need documentation
      suggestions.push(...this.generateDocTasks(context));
    }

    // Always add some improvements
    suggestions.push(...this.generateImprovementTasks(context));

    // Limit to reasonable number
    return suggestions.slice(0, 10);
  }

  /**
   * Fetch tasks from MCP server
   */
  private async fetchMCPTasks(): Promise<TaskSuggestion[]> {
    if (!this.mcpClient) {
      return [];
    }

    const response = await this.mcpClient.planNext(10, false);
    if (!response || response.tasks.length === 0) {
      return [];
    }

    // Convert MCP tasks to TaskSuggestions
    return response.tasks
      .filter(task => task.status === 'pending')
      .map(task => this.convertMCPTaskToSuggestion(task));
  }

  /**
   * Convert MCP task format to TaskSuggestion
   */
  private convertMCPTaskToSuggestion(mcpTask: MCPPlanTask): TaskSuggestion {
    // Infer type from title/description
    const type = this.inferTaskType({
      id: mcpTask.id,
      title: mcpTask.title,
      description: mcpTask.description,
      status: 'pending',
      type: 'task',
      created_at: Date.now(),
      updated_at: Date.now()
    } as Task);

    // Estimate complexity based on description length and keywords
    const complexity = this.estimateComplexity(mcpTask.title, mcpTask.description || '');

    return {
      title: mcpTask.title,
      description: mcpTask.description || '',
      type: type as 'feature' | 'bug' | 'improvement' | 'test' | 'docs',
      complexity,
      rationale: `Imported from MCP roadmap (${mcpTask.domain} domain)`,
      dependencies: mcpTask.dependencies
    };
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(title: string, description: string): number {
    const text = (title + ' ' + description).toLowerCase();
    let complexity = 3; // Default medium

    // Keywords that suggest higher complexity
    if (text.includes('integrate') || text.includes('refactor')) complexity += 2;
    if (text.includes('architecture') || text.includes('redesign')) complexity += 3;
    if (text.includes('performance') || text.includes('optimize')) complexity += 1;
    if (text.includes('security') || text.includes('authentication')) complexity += 2;

    // Keywords that suggest lower complexity
    if (text.includes('update') || text.includes('fix')) complexity -= 1;
    if (text.includes('document') || text.includes('readme')) complexity -= 1;
    if (text.includes('test') || text.includes('unit')) complexity -= 1;

    return Math.max(1, Math.min(complexity, this.MAX_COMPLEXITY));
  }

  /**
   * Generate feature task suggestions
   */
  private generateFeatureTasks(context: any): TaskSuggestion[] {
    const suggestions: TaskSuggestion[] = [];

    // Look for gaps in current implementation
    if (!context.decisions?.find((d: any) => d.includes('monitoring'))) {
      suggestions.push({
        title: 'Add real-time monitoring dashboard',
        description: 'Create web-based dashboard showing orchestrator metrics, task progress, and system health',
        type: 'feature',
        complexity: 7,
        rationale: 'No monitoring solution exists yet, critical for production operations'
      });
    }

    if (!context.decisions?.find((d: any) => d.includes('notification'))) {
      suggestions.push({
        title: 'Implement notification system',
        description: 'Add Slack/email notifications for critical events, failures, and completions',
        type: 'feature',
        complexity: 5,
        rationale: 'Enable async awareness of system state changes'
      });
    }

    return suggestions;
  }

  /**
   * Generate test task suggestions
   */
  private generateTestTasks(context: any): TaskSuggestion[] {
    const suggestions: TaskSuggestion[] = [];

    // Identify untested components
    suggestions.push({
      title: 'Add integration tests for orchestrator flow',
      description: 'Create end-to-end tests covering task lifecycle from creation to completion',
      type: 'test',
      complexity: 4,
      rationale: 'Critical path lacks integration test coverage'
    });

    suggestions.push({
      title: 'Add stress tests for agent pool',
      description: 'Test agent pool behavior under high load and concurrent requests',
      type: 'test',
      complexity: 3,
      rationale: 'Concurrent execution paths need stress testing'
    });

    return suggestions;
  }

  /**
   * Generate documentation task suggestions
   */
  private generateDocTasks(context: any): TaskSuggestion[] {
    return [{
      title: 'Create orchestrator architecture guide',
      description: 'Document system architecture, component interactions, and data flow',
      type: 'docs',
      complexity: 2,
      rationale: 'Architecture documentation needed for maintainability'
    }];
  }

  /**
   * Generate improvement task suggestions
   */
  private generateImprovementTasks(context: any): TaskSuggestion[] {
    const suggestions: TaskSuggestion[] = [];

    // Look for quality issues in recent tasks
    const qualityIssues = context.quality_issues || [];

    if (qualityIssues.some((q: any) => q.dimension === 'performance')) {
      suggestions.push({
        title: 'Optimize database queries',
        description: 'Add indexes and optimize slow queries identified in performance metrics',
        type: 'improvement',
        complexity: 4,
        rationale: 'Performance degradation detected in recent executions'
      });
    }

    suggestions.push({
      title: 'Refactor error handling',
      description: 'Improve error messages and recovery strategies across orchestrator',
      type: 'improvement',
      complexity: 3,
      rationale: 'Enhance system resilience and debuggability'
    });

    return suggestions;
  }

  /**
   * Get recent task completions
   */
  private getRecentCompletions(days: number): Task[] {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const completed = this.stateMachine.getTasks({ status: ['done'] });

    return completed.filter(task => {
      const completedAt = task.completed_at ? new Date(task.completed_at).getTime() : 0;
      return completedAt > cutoff;
    });
  }

  /**
   * Analyze task type distribution
   */
  private analyzeTaskTypes(tasks: Task[]): Record<string, number> {
    const types = { feature: 0, bug: 0, test: 0, docs: 0, improvement: 0 };

    for (const task of tasks) {
      const type = this.inferTaskType(task);
      if (type in types) {
        types[type as keyof typeof types]++;
      }
    }

    const total = tasks.length || 1;
    return {
      feature: types.feature / total,
      bug: types.bug / total,
      test: types.test / total,
      docs: types.docs / total,
      improvement: types.improvement / total
    };
  }

  /**
   * Infer task type from title/description
   */
  private inferTaskType(task: Task): string {
    const title = task.title.toLowerCase();
    const desc = (task.description || '').toLowerCase();
    const combined = title + ' ' + desc;

    if (combined.includes('test') || combined.includes('spec')) return 'test';
    if (combined.includes('doc') || combined.includes('readme')) return 'docs';
    if (combined.includes('fix') || combined.includes('bug')) return 'bug';
    if (combined.includes('optimize') || combined.includes('refactor')) return 'improvement';
    return 'feature';
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(type: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `AR_${type.toUpperCase()}_${timestamp}_${random}`;
  }
}