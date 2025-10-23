import type { Task } from './state_machine.js';
import type { StateMachine } from './state_machine.js';
import type { FeatureGatesReader } from './feature_gates.js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

interface PriorityScore {
  score: number;
  reasons: string[];
  schedulerMode: 'legacy' | 'wsjf';
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

export function calculatePriority(
  task: Task,
  stateMachine: StateMachine,
  featureGates?: FeatureGatesReader,
): PriorityScore {
  let score = 0;
  const reasons: string[] = [];
  const metadata = (task.metadata ?? {}) as Record<string, unknown>;
  const schedulerMode = featureGates?.getSchedulerMode?.() ?? 'legacy';

  if (metadata.critical === true || metadata.critical_path === true) {
    score += 120;
    reasons.push('critical_path');
  }

  if (metadata.high_risk === true || metadata.requires_escalation === true) {
    score += 80;
    reasons.push('high_risk');
  }

  const businessValue = parseNumber(metadata.business_value ?? metadata.value);
  if (businessValue !== null) {
    score += businessValue * 10;
    reasons.push('business_value');
  }

  const effortEstimate = parseNumber(metadata.effort ?? metadata.estimated_hours);
  if (effortEstimate !== null) {
    score -= effortEstimate * 2;
    reasons.push('effort_penalty');
  }

  if (task.estimated_complexity) {
    score -= task.estimated_complexity * 3;
    reasons.push('complexity_penalty');
  }

  if (typeof task.epic_id === 'string' && task.epic_id.startsWith('E-PHASE0')) {
    score += 40;
    reasons.push('phase0_priority');
  }

  const domain = (metadata.domain ?? '').toString().toLowerCase();
  if (domain.includes('product')) {
    score += 30;
    reasons.push('product_domain');
  } else if (domain.includes('mcp')) {
    score += 15;
    reasons.push('mcp_domain');
  }

  const dependents = stateMachine.getDependents(task.id);
  if (dependents.length > 0) {
    score += dependents.length * 5;
    reasons.push('unblocks_dependents');
  }

  const deadline = parseDate(metadata.deadline ?? metadata.due_date);
  if (deadline) {
    const now = Date.now();
    const diffDays = (deadline.getTime() - now) / (1000 * 60 * 60 * 24);
    if (!Number.isNaN(diffDays)) {
      if (diffDays <= 0) {
        score += 80;
        reasons.push('deadline_overdue');
      } else if (diffDays <= 3) {
        score += 60;
        reasons.push('deadline_urgent');
      } else if (diffDays <= 7) {
        score += 30;
        reasons.push('deadline_soon');
      }
    }
  }

  if ((task.description ?? '').toLowerCase().includes('blocker')) {
    score += 20;
    reasons.push('blocker_resolution');
  }

  // WSJF mode: Weighted Shortest Job First with cost of delay
  if (schedulerMode === 'wsjf') {
    const wsjfScore = applyWsjfWeighting(score, task, stateMachine, metadata);
    return { score: wsjfScore, reasons, schedulerMode: 'wsjf' };
  }

  return { score, reasons, schedulerMode: 'legacy' };
}

/**
 * WSJF (Weighted Shortest Job First) scoring
 * Considers: business value, time criticality, risk reduction, effort
 */
function applyWsjfWeighting(
  baseScore: number,
  task: Task,
  stateMachine: StateMachine,
  metadata: Record<string, unknown>,
): number {
  // Business Value weight (30%)
  const businessValue = parseNumber(metadata.business_value ?? metadata.value) || 0;
  const businessValueScore = businessValue * 10;

  // Time Criticality weight (20%) - based on deadline
  let timeScore = 0;
  const deadline = parseDate(metadata.deadline ?? metadata.due_date);
  if (deadline) {
    const daysUntilDeadline = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (!Number.isNaN(daysUntilDeadline)) {
      if (daysUntilDeadline <= 0) {
        timeScore = 40;
      } else if (daysUntilDeadline <= 3) {
        timeScore = 30;
      } else if (daysUntilDeadline <= 7) {
        timeScore = 20;
      } else if (daysUntilDeadline <= 14) {
        timeScore = 10;
      }
    }
  }

  // Risk Reduction weight (20%) - based on dependencies and criticality
  let riskScore = 0;
  const dependents = stateMachine.getDependents(task.id);
  riskScore += Math.min(30, dependents.length * 5);
  if (metadata.high_risk === true) {
    riskScore += 20;
  }

  // Effort weight (30%) - jobs to be done / effort estimate
  const effortEstimate = Math.max(1, parseNumber(metadata.effort ?? metadata.estimated_hours) || 1);
  const jobsScore = Math.max(1, parseNumber(metadata.jobs_to_be_done) || 10);
  const jobsPerDay = jobsScore / Math.max(1, effortEstimate / 8);

  // WSJF = (Business Value + Time + Risk) / Effort
  const wsjfScore = Math.round((businessValueScore + timeScore + riskScore) / (effortEstimate / 8));

  // Apply effort-adjusted weighting (more weight to high-value, low-effort tasks)
  return Math.max(1, wsjfScore + jobsPerDay * 5);
}

/**
 * Get active commands from commands.json
 */
function getActiveCommands(workspaceRoot?: string): any[] {
  if (!workspaceRoot) {
    return [];
  }
  const commandsPath = path.join(workspaceRoot, 'state', 'commands.json');
  if (!existsSync(commandsPath)) {
    return [];
  }
  try {
    const commandData = JSON.parse(readFileSync(commandsPath, 'utf-8'));
    return commandData.commands?.filter((c: any) => c.status === 'pending') || [];
  } catch (error) {
    console.error('[COMMAND] Error reading commands.json:', error);
    return [];
  }
}

/**
 * Filter tasks based on active command instructions
 */
function filterTasksByCommands(tasks: Task[], commands: any[]): Task[] {
  if (commands.length === 0) {
    return tasks;
  }

  console.log('[COMMAND] Filtering tasks by commands:', commands);

  let filteredTasks = tasks;
  for (const command of commands) {
    if (command.task_filter) {
      filteredTasks = filteredTasks.filter(task =>
        task.id.includes(command.task_filter) ||
        (task.title || '').toLowerCase().includes(command.task_filter.toLowerCase())
      );
    }
  }

  console.log('[COMMAND] Filtered tasks:', {
    before: tasks.length,
    after: filteredTasks.length,
    matchedIds: filteredTasks.slice(0, 10).map(t => t.id)
  });

  return filteredTasks.length > 0 ? filteredTasks : tasks;
}

export function rankTasks(
  tasks: Task[],
  stateMachine: StateMachine,
  featureGates?: FeatureGatesReader,
  workspaceRoot?: string,
): Task[] {
  // CRITICAL: Check for commands FIRST - they have HIGHEST priority
  const activeCommands = getActiveCommands(workspaceRoot);
  console.log('[COMMAND] Active commands:', activeCommands);

  // Filter by commands before ranking
  const tasksToRank = filterTasksByCommands(tasks, activeCommands);

  return tasksToRank
    .map(task => {
      const { score, reasons } = calculatePriority(task, stateMachine, featureGates);
      return { task, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.task);
}
