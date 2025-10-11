/**
 * Agent Pool - Intelligent routing between Claude Code and Codex workers
 *
 * Architecture:
 * - Claude Code = Staff Engineer/Architect (1 instance, strategic)
 * - Codex Workers = Engineering Team (3-5 instances, parallel execution)
 *
 * Routing Strategy:
 * - Claude Code: Complex reasoning, architecture, reviews, coordination
 * - Codex Workers: Well-defined implementation, tests, docs, fixes
 */

import { EventEmitter } from 'node:events';
import { execa } from 'execa';
import type { Task } from './state_machine.js';
import type { AssembledContext } from './context_assembler.js';
import type { ReasoningLevel } from './model_selector.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

// ============================================================================
// Types
// ============================================================================

export type AgentType = 'claude_code' | 'codex';
export type AgentRole = 'architect' | 'engineer' | 'qa' | 'reviewer';

export interface Agent {
  id: string;
  type: AgentType;
  role: AgentRole;
  baseRole: AgentRole;
  status: 'idle' | 'busy' | 'failed';
  currentTask?: string;
  completedTasks: number;
  failedTasks: number;
  avgDurationSeconds: number;
  lastUsed?: number;
  cooldownUntil?: number;
  promotedAt?: number;
}

export interface AgentCapabilities {
  strengths: string[];
  costPerToken: number;  // Relative cost
  avgSpeedTokensPerSecond: number;
  maxParallelTasks: number;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  assignedAt: number;
  estimatedDuration: number;
  codexModel?: string;
  codexReasoning?: string;
  codexPreset?: string;
}

export interface AssignmentOptions {
  forceAgentType?: AgentType;
  preferAgentType?: AgentType;
  avoidAgentTypes?: AgentType[];
  rationale?: string;
}

export interface AgentPoolMetrics {
  totalAgents: number;
  busyAgents: number;
  idleAgents: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  avgTaskDuration: number;
  claudeUsagePercent: number;
  codexUsagePercent: number;
}

export type ExecutionFailureType = 'rate_limit' | 'context_limit' | 'other';

export interface ExecutionOutcome {
  success: boolean;
  output: string;
  durationSeconds: number;
  failureType?: ExecutionFailureType;
  retryAfterSeconds?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUSD?: number;
}

// ============================================================================
// Agent Pool
// ============================================================================

export class AgentPool extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private assignments: Map<string, TaskAssignment> = new Map();
  private coordinatorType: AgentType = 'claude_code';
  private readonly coordinatorCandidates: string[] = [];

  private readonly capabilities: Record<AgentType, AgentCapabilities> = {
    claude_code: {
      strengths: [
        'architectural_decisions',
        'complex_refactoring',
        'code_review',
        'system_design',
        'quality_assessment',
        'strategic_planning'
      ],
      costPerToken: 1.0,  // Baseline
      avgSpeedTokensPerSecond: 150,
      maxParallelTasks: 1  // Single coordinator
    },
    codex: {
      strengths: [
        'feature_implementation',
        'test_writing',
        'bug_fixes',
        'documentation',
        'refactoring',
        'migrations'
      ],
      costPerToken: 0.6,  // Cheaper than Claude
      avgSpeedTokensPerSecond: 200,
      maxParallelTasks: 5  // Multiple parallel workers
    }
  };

  constructor(
    private workspaceRoot: string,
    private codexWorkers: number = 3  // Default: 3 Codex workers
  ) {
    super();
    this.initializeAgents();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private initializeAgents(): void {
    // Initialize Claude Code coordinator
    this.agents.set('claude_code', {
      id: 'claude_code',
      type: 'claude_code',
      role: 'architect',
      baseRole: 'architect',
      status: 'idle',
      completedTasks: 0,
      failedTasks: 0,
      avgDurationSeconds: 0
    });

    // Initialize Codex workers
    for (let i = 1; i <= this.codexWorkers; i++) {
      const baseRole: AgentRole = i === 1 ? 'engineer' : i === 2 ? 'qa' : 'engineer';
      const agent: Agent = {
        id: `codex_worker_${i}`,
        type: 'codex',
        role: baseRole,
        baseRole,
        status: 'idle',
        completedTasks: 0,
        failedTasks: 0,
        avgDurationSeconds: 0
      };
      this.agents.set(agent.id, agent);
      if (i === 1) {
        this.coordinatorCandidates.push(agent.id);
      }
    }
  }

  private getCoordinatorCandidate(): Agent | undefined {
    const candidateId = this.coordinatorCandidates[0];
    return candidateId ? this.agents.get(candidateId) ?? undefined : undefined;
  }

  promoteCoordinatorRole(reason: string): void {
    const claudeAgent = this.agents.get('claude_code');
    if (!claudeAgent) return;

    const claudeOnCooldown = this.isOnCooldown(claudeAgent) || claudeAgent.status !== 'idle';
    if (!claudeOnCooldown) {
      return;
    }

    const candidate = this.getCoordinatorCandidate();
    if (!candidate) {
      logWarning('No Codex coordinator candidate available for promotion', { reason });
      return;
    }

    if (this.coordinatorType === 'codex') {
      return;
    }

    candidate.role = 'architect';
    candidate.promotedAt = Date.now();
    this.coordinatorType = 'codex';

    logWarning('Promoted Codex to coordinator role', {
      codexId: candidate.id,
      reason,
      claudeStatus: claudeAgent.status,
      claudeCooldownMs: claudeAgent.cooldownUntil ? Math.max(claudeAgent.cooldownUntil - Date.now(), 0) : 0,
    });

    this.emit('coordinator:promoted', {
      from: 'claude_code',
      to: candidate.id,
      reason,
    });
  }

  demoteCoordinatorRole(): void {
    if (this.coordinatorType !== 'codex') {
      return;
    }

    const claudeAgent = this.agents.get('claude_code');
    const candidate = this.getCoordinatorCandidate();
    if (!claudeAgent || !candidate) {
      return;
    }

    const claudeAvailable = claudeAgent.status === 'idle' && !this.isOnCooldown(claudeAgent);
    if (!claudeAvailable) {
      return;
    }

    candidate.role = candidate.baseRole;
    candidate.promotedAt = undefined;
    this.coordinatorType = 'claude_code';

    logInfo('Demoted Codex coordinator; Claude available again', {
      codexId: candidate.id,
    });

    this.emit('coordinator:demoted', {
      from: candidate.id,
      to: 'claude_code',
    });
  }

  getCoordinatorType(): AgentType {
    return this.coordinatorType;
  }

  isCoordinatorAvailable(): boolean {
    if (this.coordinatorType === 'claude_code') {
      const claudeAgent = this.agents.get('claude_code');
      if (!claudeAgent) return false;
      return claudeAgent.status === 'idle' && !this.isOnCooldown(claudeAgent);
    }

    const candidate = this.getCoordinatorCandidate();
    if (!candidate) return false;
    return candidate.status === 'idle' && !this.isOnCooldown(candidate);
  }

  // ==========================================================================
  // Task Assignment (Smart Routing)
  // ==========================================================================

  /**
   * Assign task to the best available agent
   */
  async assignTask(
    task: Task,
    context: AssembledContext,
    modelHint?: { codexModel?: string; codexReasoning?: ReasoningLevel; codexPreset?: string },
    options: AssignmentOptions = {}
  ): Promise<Agent> {
    // 1. Determine optimal agent type
    const avoidTypes = new Set(options.avoidAgentTypes ?? []);
    const recommendedType =
      options.forceAgentType ?? options.preferAgentType ?? this.recommendAgentType(task, context);

    const searchOrder: AgentType[] = [];
    if (!avoidTypes.has(recommendedType)) {
      searchOrder.push(recommendedType);
    }
    const alternateType: AgentType = recommendedType === 'claude_code' ? 'codex' : 'claude_code';
    if (!avoidTypes.has(alternateType)) {
      searchOrder.push(alternateType);
    }

    for (const candidateType of searchOrder) {
      const agent = this.findAvailableAgent(candidateType);
      if (agent) {
        if (candidateType !== recommendedType) {
          this.emit('agent:fallback', {
            task: task.id,
            from: recommendedType,
            to: candidateType,
            reason: options.rationale,
          });
        }
        return this.recordAssignment(task, agent, context, modelHint);
      }
    }

    throw new Error(`No agents available (all ${this.agents.size} agents busy)`);
  }

  /**
   * Recommend agent type based on task characteristics
   */
  private recommendAgentType(task: Task, context: AssembledContext): AgentType {
    if (this.coordinatorType === 'codex') {
      if (task.status === 'needs_review') {
        return 'codex';
      }

      const complexity = task.estimated_complexity ?? 5;
      if (complexity >= 8) {
        return 'codex';
      }

      const hasArchitecturalDecisions = context.relevantDecisions.length > 3;
      const hasQualityIssues = context.qualityIssuesInArea.length > 0;
      if (hasArchitecturalDecisions || hasQualityIssues) {
        return 'codex';
      }

      return 'codex';
    }

    if (task.status === 'needs_review') {
      return 'claude_code';
    }

    if (task.status === 'needs_improvement') {
      return 'codex';
    }

    // High complexity → Claude Code (better reasoning)
    if ((task.estimated_complexity || 5) >= 8) {
      return 'claude_code';
    }

    // Epic-level tasks → Claude Code (strategic)
    if (task.type === 'epic') {
      return 'claude_code';
    }

    // Code review tasks → Claude Code (quality assessment)
    if (task.title.toLowerCase().includes('review')) {
      return 'claude_code';
    }

    // Architecture/design tasks → Claude Code
    const architectureKeywords = ['design', 'architecture', 'methodology', 'approach', 'strategy'];
    const titleLower = task.title.toLowerCase();
    if (architectureKeywords.some(kw => titleLower.includes(kw))) {
      return 'claude_code';
    }

    // Has many decisions/constraints in context → Claude Code (needs understanding)
    if (context.relevantDecisions.length > 3 || context.relevantConstraints.length > 2) {
      return 'claude_code';
    }

    // Quality issues in area → Claude Code (careful work needed)
    if (context.qualityIssuesInArea.length > 3) {
      return 'claude_code';
    }

    // Everything else → Codex (implementation work)
    return 'codex';
  }

  private findAvailableAgent(type: AgentType): Agent | null {
    const available = Array.from(this.agents.values())
      .filter(a => a.type === type && a.status === 'idle' && !this.isOnCooldown(a));

    if (available.length === 0) return null;

    // Prefer agents with lower utilization (load balancing)
    available.sort((a, b) => a.completedTasks - b.completedTasks);
    return available[0];
  }

  private recordAssignment(
    task: Task,
    agent: Agent,
    context: AssembledContext,
    modelInfo?: { codexModel?: string; codexReasoning?: string; codexPreset?: string }
  ): Agent {
    // Estimate duration based on agent's historical performance
    const estimatedDuration = this.estimateDuration(task, agent);

    agent.status = 'busy';
    agent.currentTask = task.id;
    agent.lastUsed = Date.now();

    this.assignments.set(task.id, {
      taskId: task.id,
      agentId: agent.id,
      assignedAt: Date.now(),
      estimatedDuration,
      codexModel: modelInfo?.codexModel,
      codexReasoning: modelInfo?.codexReasoning,
      codexPreset: modelInfo?.codexPreset,
    });

    this.emit('task:assigned', {
      task,
      agent,
      estimatedDuration,
      reasoning: this.getAssignmentReasoning(task, agent, context)
    });

    return agent;
  }

  /**
   * Get human-readable reasoning for assignment decision
   */
  private getAssignmentReasoning(task: Task, agent: Agent, context: AssembledContext): string {
    const reasons: string[] = [];

    if (agent.type === 'claude_code') {
      if ((task.estimated_complexity || 5) >= 8) {
        reasons.push('high complexity requires deep reasoning');
      }
      if (task.type === 'epic') {
        reasons.push('epic-level task needs strategic thinking');
      }
      if (context.relevantDecisions.length > 3) {
        reasons.push('many architectural decisions in context');
      }
      if (context.qualityIssuesInArea.length > 3) {
        reasons.push('quality issues require careful work');
      }
    } else {
      reasons.push('well-defined implementation work');
      if ((task.estimated_complexity || 5) < 8) {
        reasons.push('moderate complexity suitable for autonomous execution');
      }
    }

    return reasons.join('; ');
  }

  // ==========================================================================
  // Task Completion
  // ==========================================================================

  completeTask(
    taskId: string,
    success: boolean,
    durationSeconds: number,
    metadata?: { failureType?: ExecutionFailureType; retryAfterSeconds?: number }
  ): void {
    const assignment = this.assignments.get(taskId);
    if (!assignment) {
      throw new Error(`No assignment found for task ${taskId}`);
    }

    const agent = this.agents.get(assignment.agentId);
    if (!agent) {
      throw new Error(`Agent ${assignment.agentId} not found`);
    }

    // Update agent stats
    agent.status = 'idle';
    agent.currentTask = undefined;

    if (success) {
      const previousCompletions = agent.completedTasks;
      const newCompletions = previousCompletions + 1;

      agent.completedTasks = newCompletions;

      const totalDuration = agent.avgDurationSeconds * previousCompletions;
      agent.avgDurationSeconds = (totalDuration + durationSeconds) / newCompletions;
    } else {
      agent.failedTasks++;
      if (metadata?.failureType === 'rate_limit') {
        this.setAgentCooldown(agent, metadata.retryAfterSeconds ?? 300, 'usage_limit');
      } else {
        agent.status = 'failed';  // Temporarily mark as failed

        // Reset after 30 seconds
        setTimeout(() => {
          if (agent.status === 'failed') {
            agent.status = 'idle';
          }
        }, 30000);
      }
    }

    this.assignments.delete(taskId);

    this.emit('task:completed', {
      taskId,
      agentId: agent.id,
      success,
      durationSeconds,
      agent
    });
  }

  // ==========================================================================
  // Duration Estimation
  // ==========================================================================

  private estimateDuration(task: Task, agent: Agent): number {
    // Base estimate from task complexity (1-10 scale → 5-50 minutes)
    const complexity = task.estimated_complexity || 5;
    let baseMinutes = complexity * 5;

    // Adjust based on agent's historical performance
    if (agent.avgDurationSeconds > 0) {
      // Use agent's average as signal
      baseMinutes = (baseMinutes + agent.avgDurationSeconds / 60) / 2;
    }

    // Adjust based on agent type
    if (agent.type === 'claude_code') {
      // Claude Code is slower but more thoughtful
      baseMinutes *= 1.3;
    } else {
      // Codex is faster
      baseMinutes *= 0.8;
    }

    return Math.round(baseMinutes * 60);  // Convert to seconds
  }

  // ==========================================================================
  // Agent Management
  // ==========================================================================

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAvailableAgents(): Agent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.status === 'idle' && !this.isOnCooldown(agent));
  }

  getBusyAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'busy');
  }

  /**
   * Get Codex-to-Claude ratio (should be ~5:1 for optimal efficiency)
   */
  getUsageRatio(): { codex: number; claude: number; ratio: number } {
    const codexTasks = Array.from(this.agents.values())
      .filter(a => a.type === 'codex')
      .reduce((sum, a) => sum + a.completedTasks, 0);

    const claudeTasks = Array.from(this.agents.values())
      .filter(a => a.type === 'claude_code')
      .reduce((sum, a) => sum + a.completedTasks, 0);

    const ratio = claudeTasks > 0 ? codexTasks / claudeTasks : 0;

    return { codex: codexTasks, claude: claudeTasks, ratio };
  }

  getMetrics(): AgentPoolMetrics {
    const all = this.getAllAgents();
    const busy = this.getBusyAgents();
    const idle = this.getAvailableAgents();

    const totalCompleted = all.reduce((sum, a) => sum + a.completedTasks, 0);
    const totalFailed = all.reduce((sum, a) => sum + a.failedTasks, 0);
    const avgDuration = all.reduce((sum, a) => sum + a.avgDurationSeconds, 0) / all.length;

    const usage = this.getUsageRatio();
    const totalTasks = usage.codex + usage.claude;

    return {
      totalAgents: all.length,
      busyAgents: busy.length,
      idleAgents: idle.length,
      totalTasksCompleted: totalCompleted,
      totalTasksFailed: totalFailed,
      avgTaskDuration: avgDuration,
      claudeUsagePercent: totalTasks > 0 ? (usage.claude / totalTasks) * 100 : 0,
      codexUsagePercent: totalTasks > 0 ? (usage.codex / totalTasks) * 100 : 0
    };
  }

  hasAvailableAgent(type: AgentType): boolean {
    return this.getAvailableAgents().some(agent => agent.type === type);
  }

  // ==========================================================================
  // Agent Execution (Interface with actual CLI tools)
  // ==========================================================================

  private extractUsageMetrics(stdout?: string, stderr?: string): { tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }; costUSD?: number } | undefined {
    const combined = [stdout, stderr].filter((segment) => typeof segment === 'string' && segment.trim().length > 0).join('\n');
    if (!combined) {
      return undefined;
    }

    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let totalTokens: number | undefined;

    const tokenRegex = /(prompt|completion|total|input|output)[ _-]?tokens?(?:\s*(?:[:=]|is|used|were)\s*|\s+)(\d+)/gi;
    for (const match of combined.matchAll(tokenRegex)) {
      const key = match[1]?.toLowerCase();
      const rawValue = Number.parseInt(match[2] ?? '', 10);
      if (!Number.isNaN(rawValue)) {
        if (key === 'prompt' || key === 'input') {
          promptTokens = rawValue;
        } else if (key === 'completion' || key === 'output') {
          completionTokens = rawValue;
        } else if (key === 'total') {
          totalTokens = rawValue;
        }
      }
    }

    // Calculate total if we have prompt and completion but not total
    if (typeof totalTokens !== 'number' && typeof promptTokens === 'number' && typeof completionTokens === 'number') {
      totalTokens = promptTokens + completionTokens;
    }

    let costUSD: number | undefined;
    const costRegexes = [
      /cost(?:\s*usd)?[^0-9]*(\d+\.\d+|\d+)/gi,
      /\$(\d+\.\d+)/g,
    ];

    for (const regex of costRegexes) {
      for (const match of combined.matchAll(regex)) {
        const rawCost = Number.parseFloat(match[1] ?? '');
        if (!Number.isNaN(rawCost)) {
          costUSD = rawCost;
        }
      }
      if (typeof costUSD === 'number') {
        break;
      }
    }

    const hasUsage = typeof promptTokens === 'number'
      || typeof completionTokens === 'number'
      || typeof totalTokens === 'number';

    if (!hasUsage && typeof costUSD !== 'number') {
      return undefined;
    }

    // Ensure all fields are defined with defaults of 0 when returning tokenUsage
    if (hasUsage) {
      return {
        tokenUsage: {
          promptTokens: promptTokens ?? 0,
          completionTokens: completionTokens ?? 0,
          totalTokens: totalTokens ?? 0,
        },
        costUSD,
      };
    }

    return { costUSD };
  }

  /**
   * Execute task with Claude Code
   */
  async executeWithClaudeCode(
    taskId: string,
    prompt: string,
    options: { timeout?: number; workdir?: string } = {}
  ): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const result = await execa('claude', ['chat', '--message', prompt], {
        cwd: options.workdir || this.workspaceRoot,
        timeout: options.timeout || 30 * 60 * 1000,  // 30 min default
        encoding: 'utf8'
      });

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const usageMetrics = this.extractUsageMetrics(result.stdout, result.stderr);

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        durationSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD
      };
    } catch (error: any) {
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const message = this.normalizeErrorOutput(error);
      const failure = this.detectFailure(message);
      const usageMetrics = this.extractUsageMetrics(error?.stdout, error?.stderr);

      this.emit('agent:error', {
        agentType: 'claude_code',
        taskId,
        error: message,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds
      });

      return {
        success: false,
        output: message,
        durationSeconds,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD
      };
    }
  }

  /**
   * Execute task with Codex
   */
  async executeWithCodex(
    taskId: string,
    prompt: string,
    options: { timeout?: number; workdir?: string; model?: string; reasoning?: 'minimal' | 'low' | 'medium' | 'high' } = {}
  ): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const args = [
        'exec',
        '--full-auto',
        '--sandbox', 'danger-full-access'
      ];

      if (options.model) {
        args.push('--model', options.model);
      }
      if (options.reasoning) {
        args.push('--reasoning', options.reasoning);
      }

      args.push(prompt);

      const result = await execa('codex', args, {
        cwd: options.workdir || this.workspaceRoot,
        timeout: options.timeout || 30 * 60 * 1000,  // 30 min default
        encoding: 'utf8'
      });

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const usageMetrics = this.extractUsageMetrics(result.stdout, result.stderr);

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        durationSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD
      };
    } catch (error: any) {
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const message = this.normalizeErrorOutput(error);
      const failure = this.detectFailure(message);
      const usageMetrics = this.extractUsageMetrics(error?.stdout, error?.stderr);

      this.emit('agent:error', {
        agentType: 'codex',
        taskId,
        error: message,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds
      });

      return {
        success: false,
        output: message,
        durationSeconds,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD
      };
    }
  }

  imposeCooldown(agentId: string, seconds: number, reason: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.setAgentCooldown(agent, seconds, reason);
  }

  private setAgentCooldown(agent: Agent, seconds: number, reason: string): void {
    const cooldownMs = Math.max(5, seconds) * 1000;
    agent.status = 'failed';
    agent.cooldownUntil = Date.now() + cooldownMs;
    this.emit('agent:cooldown', {
      agentId: agent.id,
      agentType: agent.type,
      seconds: Math.round(cooldownMs / 1000),
      reason
    });

    setTimeout(() => {
      if (agent.cooldownUntil && agent.cooldownUntil <= Date.now()) {
        agent.cooldownUntil = undefined;
        agent.status = 'idle';
        this.emit('agent:cooldown_cleared', { agentId: agent.id, agentType: agent.type });
      }
    }, cooldownMs + 100);
  }

  handleRateLimit(taskId: string, retryAfterSeconds: number): void {
    const assignment = this.assignments.get(taskId);
    if (!assignment) return;
    const agent = this.agents.get(assignment.agentId);
    if (!agent) return;

    agent.currentTask = undefined;
    agent.failedTasks++;
    this.setAgentCooldown(agent, retryAfterSeconds, 'usage_limit');
    this.assignments.delete(taskId);
  }

  clearCooldown(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.cooldownUntil = undefined;
    if (agent.status === 'failed') {
      agent.status = 'idle';
    }
    this.emit('agent:cooldown_cleared', { agentId: agent.id, agentType: agent.type });
  }

  private isOnCooldown(agent: Agent): boolean {
    if (!agent.cooldownUntil) return false;
    if (agent.cooldownUntil <= Date.now()) {
      agent.cooldownUntil = undefined;
      if (agent.status === 'failed') {
        agent.status = 'idle';
      }
      return false;
    }
    return true;
  }

  private normalizeErrorOutput(error: any): string {
    if (!error) return 'Unknown failure';
    if (typeof error === 'string') return error;
    if (error.stderr) return String(error.stderr);
    if (error.shortMessage) return String(error.shortMessage);
    if (error.message) return String(error.message);
    return JSON.stringify(error);
  }

  private detectFailure(output: string | undefined): { failureType: ExecutionFailureType; retryAfterSeconds?: number } | undefined {
    if (!output) return undefined;
    const text = output.toLowerCase();

    if (text.includes('rate limit') || text.includes('usage limit') || text.includes('too many requests')) {
      const retryAfterSeconds = this.extractRetryAfter(output);
      return { failureType: 'rate_limit', retryAfterSeconds };
    }

    if (text.includes('maximum context') || text.includes('context length') || text.includes('too long') || text.includes('input is too long')) {
      return { failureType: 'context_limit' };
    }

    return undefined;
  }

  private extractRetryAfter(output: string): number | undefined {
    const regex = /try again in (?:(\d+)\s*hour[s]?)?(?:\s*(\d+)\s*minute[s]?)?/i;
    const match = output.match(regex);
    if (match) {
      const hours = parseInt(match[1] ?? '0', 10);
      const minutes = parseInt(match[2] ?? '0', 10);
      const seconds = hours * 3600 + minutes * 60;
      if (seconds > 0) return seconds;
    }

    const retryMatch = output.match(/retry after\s*(\d+)\s*second[s]?/i);
    if (retryMatch) {
      const seconds = parseInt(retryMatch[1], 10);
      if (!Number.isNaN(seconds)) return seconds;
    }

    return undefined;
  }
}
