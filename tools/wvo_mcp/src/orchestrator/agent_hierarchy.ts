/**
 * AgentHierarchy - Sophisticated multi-agent management system
 *
 * Implements hierarchical agent organization inspired by the previous autopilot system:
 * - Atlas: Orchestrator/captain who drives strategic decisions
 * - Director Dana: Automation upkeep and infrastructure coordination
 * - Workers: Execute tasks with local autonomy within bounds
 * - Critics: Quality reviewers with backoff windows
 *
 * Key Features:
 * - Policy-based decision making (product vs infrastructure prioritization)
 * - Task classification by domain and complexity
 * - Critic backoff windows to prevent over-testing
 * - Local autonomy for workers with escalation to orchestrator
 * - Model capability-aware task routing
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Task } from './state_machine.js';

export type AgentRole = 'atlas' | 'director_dana' | 'worker' | 'critic';
export type TaskDomain = 'product' | 'mcp' | 'infrastructure';
export type CriticGroup = 'design' | 'allocator' | 'quality' | 'security' | 'infrastructure' | 'creative' | 'general';

export interface AgentProfile {
  role: AgentRole;
  provider: 'codex' | 'claude';
  model: string;
  capabilities: string[];
  autonomyLevel: 'strategic' | 'tactical' | 'operational';
  maxComplexity: number; // 1-10
}

export interface TaskClassification {
  domain: TaskDomain;
  criticGroup: CriticGroup;
  complexity: number; // 1-10
  requiresStrategicDecision: boolean;
  requiresInfrastructure: boolean;
}

export interface CriticBackoff {
  criticName: string;
  lastRun: number;
  backoffWindow: number; // seconds
  consecutiveFailures: number;
}

export interface PolicyDecision {
  domain: TaskDomain;
  action: 'execute' | 'defer' | 'escalate';
  assignedRole: AgentRole;
  reasoning: string;
  directives: string[];
}

export class AgentHierarchy {
  private readonly workspaceRoot: string;
  private readonly criticBackoffPath: string;
  private readonly policyStatePath: string;

  // Agent profiles
  private readonly agentProfiles: Map<AgentRole, AgentProfile> = new Map();

  // Critic backoff tracking
  private criticBackoffs: Map<string, CriticBackoff> = new Map();

  // Policy state
  private forceProduct: boolean = true;
  private allowMCP: boolean = false;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.criticBackoffPath = path.join(workspaceRoot, 'state', 'autopilot_critics_backoff.json');
    this.policyStatePath = path.join(workspaceRoot, 'state', 'policy', 'autopilot_policy.json');

    this.initializeAgentProfiles();
    this.loadCriticBackoffs();
    this.loadPolicyState();
  }

  /**
   * Initialize agent profiles with capabilities and autonomy levels
   */
  private initializeAgentProfiles(): void {
    // Atlas: Strategic orchestrator
    this.agentProfiles.set('atlas', {
      role: 'atlas',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      capabilities: [
        'strategic_planning',
        'complex_architecture',
        'multi-step_reasoning',
        'design_validation',
        'quality_oversight'
      ],
      autonomyLevel: 'strategic',
      maxComplexity: 10
    });

    // Director Dana: Infrastructure and automation coordination
    this.agentProfiles.set('director_dana', {
      role: 'director_dana',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      capabilities: [
        'infrastructure_management',
        'automation_coordination',
        'critic_scheduling',
        'system_health'
      ],
      autonomyLevel: 'tactical',
      maxComplexity: 8
    });

    // Worker: Tactical execution
    this.agentProfiles.set('worker', {
      role: 'worker',
      provider: 'codex',
      model: 'gpt-4',
      capabilities: [
        'code_implementation',
        'testing',
        'documentation',
        'api_development'
      ],
      autonomyLevel: 'operational',
      maxComplexity: 6
    });

    // Critic: Quality review
    this.agentProfiles.set('critic', {
      role: 'critic',
      provider: 'claude',
      model: 'claude-3-haiku-20240307',
      capabilities: [
        'quality_review',
        'test_validation',
        'design_critique',
        'security_scan'
      ],
      autonomyLevel: 'operational',
      maxComplexity: 4
    });
  }

  /**
   * Load critic backoff state from disk
   */
  private loadCriticBackoffs(): void {
    if (!fs.existsSync(this.criticBackoffPath)) {
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.criticBackoffPath, 'utf-8'));
      for (const [name, backoff] of Object.entries(data)) {
        this.criticBackoffs.set(name, backoff as CriticBackoff);
      }
    } catch {
      // Ignore errors, use empty state
    }
  }

  /**
   * Save critic backoff state to disk
   */
  private saveCriticBackoffs(): void {
    const data: Record<string, CriticBackoff> = {};
    for (const [name, backoff] of this.criticBackoffs.entries()) {
      data[name] = backoff;
    }

    const stateDir = path.dirname(this.criticBackoffPath);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    fs.writeFileSync(this.criticBackoffPath, JSON.stringify(data, null, 2));
  }

  /**
   * Load policy state (force product, allow MCP flags)
   */
  private loadPolicyState(): void {
    // Check environment variables (take precedence)
    const forceProductEnv = process.env.WVO_AUTOPILOT_FORCE_PRODUCT;
    const allowMCPEnv = process.env.WVO_AUTOPILOT_ALLOW_MCP;

    if (forceProductEnv !== undefined) {
      this.forceProduct = forceProductEnv !== '0';
    }

    if (allowMCPEnv !== undefined) {
      this.allowMCP = allowMCPEnv === '1';
    }

    // Load from policy state file if it exists
    if (!fs.existsSync(this.policyStatePath)) {
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.policyStatePath, 'utf-8'));

      if (forceProductEnv === undefined && data.forceProduct !== undefined) {
        this.forceProduct = data.forceProduct;
      }

      if (allowMCPEnv === undefined && data.allowMCP !== undefined) {
        this.allowMCP = data.allowMCP;
      }
    } catch {
      // Ignore errors, use defaults
    }
  }

  /**
   * Classify a task by domain, critic group, and complexity
   */
  classifyTask(task: Task): TaskClassification {
    const title = task.title?.toLowerCase() || '';
    const description = task.description?.toLowerCase() || '';
    const taskText = `${title} ${description}`;

    // Determine domain
    let domain: TaskDomain = 'product';
    if (taskText.includes('mcp') || taskText.includes('orchestrat') || taskText.includes('autopilot')) {
      domain = 'mcp';
    }
    if (taskText.includes('infrastructure') || taskText.includes('deploy') || taskText.includes('ci/cd')) {
      domain = 'infrastructure';
    }

    // Determine critic group
    let criticGroup: CriticGroup = 'general';
    if (taskText.match(/design|ui|ux|component|style|visual/)) {
      criticGroup = 'design';
    } else if (taskText.match(/allocat|budget|spend|optimization/)) {
      criticGroup = 'allocator';
    } else if (taskText.match(/test|quality|validation|coverage/)) {
      criticGroup = 'quality';
    } else if (taskText.match(/security|auth|credential|encrypt/)) {
      criticGroup = 'security';
    } else if (taskText.match(/infrastructure|deploy|ci|cd|automation/)) {
      criticGroup = 'infrastructure';
    } else if (taskText.match(/creative|brand|narrative|story/)) {
      criticGroup = 'creative';
    }

    // Determine complexity (1-10)
    let complexity = 5; // default moderate

    // Simple tasks (1-3)
    if (task.id.startsWith('CRIT-') || taskText.match(/simple|quick|fix|update/)) {
      complexity = 2;
    }

    // Complex tasks (8-10)
    if (taskText.match(/phase.?0|phase.?1|strategic|architecture|redesign|refactor/)) {
      complexity = 9;
    }

    // Moderate tasks (4-7)
    if (taskText.match(/implement|build|create|add feature/)) {
      complexity = 6;
    }

    // Strategic decision required?
    const requiresStrategicDecision = complexity >= 8 ||
                                      domain === 'infrastructure' ||
                                      criticGroup === 'security';

    // Infrastructure coordination required?
    const requiresInfrastructure = domain === 'infrastructure' ||
                                   taskText.includes('deploy') ||
                                   taskText.includes('automation');

    return {
      domain,
      criticGroup,
      complexity,
      requiresStrategicDecision,
      requiresInfrastructure
    };
  }

  /**
   * Make a policy decision about how to handle a task
   */
  makePolicyDecision(task: Task, classification: TaskClassification): PolicyDecision {
    // Force product policy: defer MCP/infrastructure work
    if (this.forceProduct && classification.domain !== 'product') {
      return {
        domain: classification.domain,
        action: 'defer',
        assignedRole: 'director_dana',
        reasoning: 'FORCE_PRODUCT policy active - deferring infrastructure work to Director Dana',
        directives: [
          'Continue executing PRODUCT backlog',
          'Log infrastructure follow-up for Director Dana',
          'Focus on Phase 0 and Phase 1 deliverables'
        ]
      };
    }

    // Disallow MCP policy: escalate MCP tasks
    if (!this.allowMCP && classification.domain === 'mcp') {
      return {
        domain: classification.domain,
        action: 'defer',
        assignedRole: 'director_dana',
        reasoning: 'MCP work not allowed - archive MCP tasks',
        directives: [
          'Archive MCP infrastructure tasks',
          'Focus ONLY on WeatherVane product features',
          'Do not work on autopilot or orchestration improvements'
        ]
      };
    }

    // Strategic decisions go to Atlas
    if (classification.requiresStrategicDecision) {
      return {
        domain: classification.domain,
        action: 'execute',
        assignedRole: 'atlas',
        reasoning: `High complexity (${classification.complexity}/10) requires strategic oversight`,
        directives: [
          'Apply world-class architecture and design standards',
          'Consider long-term maintainability and scalability',
          'Validate against Phase 0/1 execution plan',
          'Use Playwright for design validation if UI/UX work'
        ]
      };
    }

    // Infrastructure coordination goes to Director Dana
    if (classification.requiresInfrastructure) {
      return {
        domain: classification.domain,
        action: 'execute',
        assignedRole: 'director_dana',
        reasoning: 'Infrastructure coordination required',
        directives: [
          'Coordinate automation upkeep',
          'Schedule critic runs with backoff windows',
          'Monitor system health and capacity'
        ]
      };
    }

    // Moderate complexity goes to workers
    if (classification.complexity <= 6) {
      return {
        domain: classification.domain,
        action: 'execute',
        assignedRole: 'worker',
        reasoning: `Moderate complexity (${classification.complexity}/10) suitable for worker autonomy`,
        directives: [
          'Implement with clean, maintainable code',
          'Write tests to prove functionality',
          'Follow existing architecture patterns',
          'Escalate to Atlas if blockers arise'
        ]
      };
    }

    // Default: escalate to Atlas
    return {
      domain: classification.domain,
      action: 'execute',
      assignedRole: 'atlas',
      reasoning: 'Default to strategic oversight',
      directives: [
        'Apply best judgment and world-class standards',
        'Break down into smaller tasks if needed',
        'Coordinate with appropriate specialists'
      ]
    };
  }

  /**
   * Check if a critic is in backoff window
   */
  isCriticInBackoff(criticName: string, backoffWindowSeconds: number = 900): boolean {
    const backoff = this.criticBackoffs.get(criticName);
    if (!backoff) {
      return false;
    }

    const now = Date.now();
    const windowMs = (backoff.backoffWindow || backoffWindowSeconds) * 1000;
    return (now - backoff.lastRun) < windowMs;
  }

  /**
   * Record a critic run
   */
  recordCriticRun(criticName: string, passed: boolean, backoffWindowSeconds: number = 900): void {
    const existing = this.criticBackoffs.get(criticName);

    const backoff: CriticBackoff = {
      criticName,
      lastRun: Date.now(),
      backoffWindow: backoffWindowSeconds,
      consecutiveFailures: passed ? 0 : (existing?.consecutiveFailures || 0) + 1
    };

    this.criticBackoffs.set(criticName, backoff);
    this.saveCriticBackoffs();
  }

  /**
   * Get agent profile for a role
   */
  getAgentProfile(role: AgentRole): AgentProfile | undefined {
    return this.agentProfiles.get(role);
  }

  /**
   * Select best agent for a task based on classification and policy
   */
  selectAgentForTask(task: Task): {
    role: AgentRole;
    profile: AgentProfile;
    decision: PolicyDecision;
    classification: TaskClassification;
  } {
    const classification = this.classifyTask(task);
    const decision = this.makePolicyDecision(task, classification);

    const profile = this.agentProfiles.get(decision.assignedRole);
    if (!profile) {
      // Fallback to Atlas
      return {
        role: 'atlas',
        profile: this.agentProfiles.get('atlas')!,
        decision,
        classification
      };
    }

    return {
      role: decision.assignedRole,
      profile,
      decision,
      classification
    };
  }

  /**
   * Get formatted policy directives for agent prompt
   */
  getPolicyDirectives(decision: PolicyDecision): string {
    let prompt = `## Policy Decision\n\n`;
    prompt += `**Domain**: ${decision.domain}\n`;
    prompt += `**Action**: ${decision.action}\n`;
    prompt += `**Assigned Role**: ${decision.assignedRole}\n`;
    prompt += `**Reasoning**: ${decision.reasoning}\n\n`;

    prompt += `## Directives\n\n`;
    for (const directive of decision.directives) {
      prompt += `- ${directive}\n`;
    }

    return prompt;
  }
}
