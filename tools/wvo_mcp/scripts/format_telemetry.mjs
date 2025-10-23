#!/usr/bin/env node
/**
 * Real-time telemetry formatter for autopilot runs
 * Converts JSON logs to human-readable terminal output
 */

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// Track state for progress reporting
const state = {
  tasksStarted: 0,
  tasksCompleted: 0,
  tasksFailed: 0,
  tasksBlocked: 0,
  currentTasks: new Map(), // taskId -> { title, description, agent, startTime }
  lastProgressUpdate: Date.now(),
};
const decompositionSeen = new Set();
let lastAgentSnapshotHash = '';

function formatTimestamp(isoTimestamp) {
  const date = new Date(isoTimestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function truncate(text, maxLength = 60) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

function printProgressBar() {
  const total = state.tasksCompleted + state.tasksFailed + state.tasksBlocked + state.currentTasks.size;
  if (total === 0) return;

  const completed = state.tasksCompleted;
  const progress = total > 0 ? (completed / total * 100) : 0;
  const barWidth = 30;
  const filledWidth = Math.round(barWidth * progress / 100);
  const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);

  console.log(`\n${colors.cyan}${colors.bright}Progress:${colors.reset} [${bar}] ${progress.toFixed(0)}% (${completed}/${total} tasks)${colors.reset}`);
  console.log(`${colors.gray}  ✓ ${state.tasksCompleted} completed | ✗ ${state.tasksFailed} failed | ⏸ ${state.tasksBlocked} blocked${colors.reset}\n`);
}

function handleTaskExecuting(log) {
  const { taskId, agent, model, complexity, timestamp } = log;

  state.tasksStarted++;
  state.currentTasks.set(taskId, {
    agent,
    model,
    complexity,
    startTime: timestamp,
    title: null,
    description: null,
  });

  // We'll get title/description from the context update
  const time = formatTimestamp(timestamp);
  console.log(`\n${colors.bright}${colors.blue}[${time}] ▶ STARTED${colors.reset} ${colors.cyan}${taskId}${colors.reset}`);
  console.log(`${colors.gray}  Agent: ${agent} | Model: ${model} | Complexity: ${complexity}${colors.reset}`);
}

function handleContextUpdate(log) {
  const { taskId, status } = log;
  const taskInfo = state.currentTasks.get(taskId);

  if (!taskInfo) return; // Task not tracked yet

  // Try to extract task title/description from context if available
  // This would come from the orchestrator when it builds the prompt
  if (log.taskTitle) {
    taskInfo.title = log.taskTitle;
  }
  if (log.taskDescription) {
    taskInfo.description = log.taskDescription;
  }

  // If we have title/description, print them now
  if (status === 'in_progress' && (taskInfo.title || taskInfo.description)) {
    if (taskInfo.title) {
      console.log(`${colors.bright}  📋 ${taskInfo.title}${colors.reset}`);
    }
    if (taskInfo.description) {
      console.log(`${colors.dim}     ${truncate(taskInfo.description, 80)}${colors.reset}`);
    }
  }
}

function handleTaskComplete(log) {
  const { taskId, success, duration, timestamp, agent, model } = log;
  const taskInfo = state.currentTasks.get(taskId);

  if (success) {
    state.tasksCompleted++;
  } else {
    state.tasksFailed++;
  }

  state.currentTasks.delete(taskId);

  const time = formatTimestamp(timestamp);
  const statusIcon = success ? '✓' : '✗';
  const statusColor = success ? colors.green : colors.red;
  const statusText = success ? 'COMPLETED' : 'FAILED';
  const durationText = duration ? formatDuration(duration) : 'N/A';

  console.log(`${colors.bright}${statusColor}[${time}] ${statusIcon} ${statusText}${colors.reset} ${colors.cyan}${taskId}${colors.reset} ${colors.gray}(${durationText})${colors.reset}`);

  if (taskInfo?.title) {
    console.log(`${colors.dim}     ${taskInfo.title}${colors.reset}`);
  }

  // Print output summary if available
  if (log.output && log.output.length > 0) {
    const preview = truncate(log.output, 100);
    console.log(`${colors.gray}     Output: ${preview}${colors.reset}`);
  }

  // Update progress every task completion
  const now = Date.now();
  if (now - state.lastProgressUpdate > 5000) { // Every 5 seconds
    printProgressBar();
    state.lastProgressUpdate = now;
  }
}

function handleTaskBlocked(log) {
  const { taskId, timestamp } = log;
  const taskInfo = state.currentTasks.get(taskId);

  state.tasksBlocked++;
  state.currentTasks.delete(taskId);

  const time = formatTimestamp(timestamp);
  console.log(`${colors.bright}${colors.yellow}[${time}] ⏸ BLOCKED${colors.reset} ${colors.cyan}${taskId}${colors.reset}`);

  if (taskInfo?.title) {
    console.log(`${colors.dim}     ${taskInfo.title}${colors.reset}`);
  }
}

function handleDecomposition(log) {
  const taskId = log.taskId;
  if (!taskId || decompositionSeen.has(taskId)) {
    return;
  }
  decompositionSeen.add(taskId);
  if (decompositionSeen.size > 500) {
    decompositionSeen.clear();
    decompositionSeen.add(taskId);
  }

  const time = log.timestamp ? formatTimestamp(log.timestamp) : '??:??:??';
  const subtaskCount =
    typeof log.subtaskCount === 'number' ? `${log.subtaskCount}` : String(log.subtaskCount ?? 'unknown');
  const parallelizable =
    typeof log.parallelizable === 'number' ? ` · ${log.parallelizable} parallel-ready` : '';

  console.log(
    `\n${colors.magenta}${colors.bright}[${time}] 🔀 Decomposed${colors.reset} ${colors.cyan}${taskId}${colors.reset} → ${subtaskCount} subtasks${parallelizable}`,
  );
}

function handleAgentSnapshot(log) {
  const agents = Array.isArray(log.agents) ? log.agents : [];
  const eventLabel = log.event ? String(log.event) : 'update';
  const time = log.timestamp ? formatTimestamp(log.timestamp) : '??:??:??';

  const signature = JSON.stringify({
    eventLabel,
    queueSize: log.queueSize,
    busyAgents: log.busyAgents,
    availableAgents: log.availableAgents,
    agentId: log.agentId,
    taskId: log.taskId,
    agents: agents.map(agent => ({
      id: agent?.id,
      status: agent?.status,
      currentTask: agent?.currentTask,
      lastTask: agent?.lastTask,
      model: agent?.model,
    })),
  });

  if (signature === lastAgentSnapshotHash) {
    return;
  }
  lastAgentSnapshotHash = signature;

  const queueBits = [];
  if (typeof log.queueSize === 'number') queueBits.push(`queue ${log.queueSize}`);
  if (typeof log.busyAgents === 'number') queueBits.push(`busy ${log.busyAgents}`);
  if (typeof log.availableAgents === 'number') queueBits.push(`idle ${log.availableAgents}`);
  if (typeof log.pendingTasks === 'number') queueBits.push(`pending ${log.pendingTasks}`);
  if (typeof log.activeTasks === 'number') queueBits.push(`in_progress ${log.activeTasks}`);

  const contextBits = [];
  if (log.agentId) contextBits.push(String(log.agentId));
  if (log.taskId) contextBits.push(String(log.taskId));
  if (log.note) contextBits.push(String(log.note));

  console.log(
    `\n${colors.magenta}${colors.bright}[${time}] 🧭 Agent Pool${colors.reset} ${colors.gray}(${eventLabel}${
      contextBits.length ? ` · ${contextBits.join(' · ')}` : ''
    })${colors.reset}`,
  );
  if (queueBits.length) {
    console.log(`${colors.gray}  ${queueBits.join(' | ')}${colors.reset}`);
  }

  if (!agents.length) {
    console.log(`${colors.gray}  (no agents discovered)${colors.reset}`);
    return;
  }

  const sortedAgents = agents
    .map(agent => (agent && typeof agent === 'object' ? agent : {}))
    .sort((a, b) => {
      const left = typeof a.id === 'string' ? a.id : '';
      const right = typeof b.id === 'string' ? b.id : '';
      return left.localeCompare(right);
    });

  sortedAgents.forEach(agent => {
    const rawId = typeof agent.id === 'string' ? agent.id : String(agent.id ?? '?');
    const statusRaw = typeof agent.status === 'string' ? agent.status.toLowerCase() : 'unknown';
    const currentTask =
      typeof agent.currentTask === 'string' && agent.currentTask.length > 0
        ? truncate(agent.currentTask, 60)
        : typeof agent.lastTask === 'string' && agent.lastTask.length > 0
        ? `last: ${truncate(agent.lastTask, 40)}`
        : '—';
    const model = typeof agent.model === 'string' && agent.model.length > 0 ? agent.model : 'model?';
    const role = typeof agent.role === 'string' && agent.role.length > 0 ? agent.role : '';

    let statusColor = colors.yellow;
    if (statusRaw === 'busy' || statusRaw === 'working') statusColor = colors.green;
    else if (statusRaw === 'idle') statusColor = colors.gray;
    else if (statusRaw === 'failed' || statusRaw === 'error') statusColor = colors.red;

    const idDisplay = rawId.padEnd(14, ' ');
    const roleDisplay = role ? `${role.padEnd(18, ' ')}` : ''.padEnd(18, ' ');

    console.log(
      `${colors.gray}   ${idDisplay}${colors.reset} ${roleDisplay}${statusColor}${statusRaw.toUpperCase().padEnd(9, ' ')}${colors.reset} ${model} ${colors.dim}${currentTask}${colors.reset}`,
    );
  });
}

function handleAgentStatus(log) {
  // Only show on significant state changes
  if (log.message?.includes('Agent reserved') || log.message?.includes('Agent released')) {
    const { agentId, taskId } = log;
    const action = log.message.includes('reserved') ? 'assigned to' : 'released from';
    const symbol = log.message.includes('reserved') ? '→' : '←';

    if (taskId && taskId !== 'undefined') {
      console.log(`${colors.gray}  ${symbol} ${agentId} ${action} ${taskId}${colors.reset}`);
    }
  }
}

function handlePrefetch(log) {
  const { count = 0, queueSize, pendingReady, tasks = [] } = log;
  if (!count) return;

  const time = log.timestamp ? formatTimestamp(log.timestamp) : null;
  const queueBits = [];
  if (typeof queueSize === 'number') queueBits.push(`queue ${queueSize}`);
  if (typeof pendingReady === 'number') queueBits.push(`pending ${pendingReady}`);
  const queueText = queueBits.length ? ` (${queueBits.join(' | ')})` : '';

  console.log(
    `${colors.dim}${time ? `[${time}] ` : ''}📦 Prefetched ${count} task${count === 1 ? '' : 's'}${queueText}${colors.reset}`,
  );

  if (Array.isArray(tasks) && tasks.length > 0) {
    const preview = tasks
      .slice(0, 3)
      .map(task => {
        if (!task || typeof task !== 'object') {
          return String(task);
        }
        const id = typeof task.id === 'string' ? task.id : String(task.id ?? 'unknown');
        const title = typeof task.title === 'string' && task.title.trim().length > 0 ? truncate(task.title, 40) : '';
        const domain = typeof task.domain === 'string' && task.domain ? ` [${task.domain}]` : '';
        return `${id}${domain}${title ? ` – ${title}` : ''}`;
      })
      .join(', ');
    const extra = tasks.length > 3 ? `, +${tasks.length - 3} more` : '';
    console.log(`${colors.gray}    ${preview}${extra}${colors.reset}`);
  }
}

function handleLogLine(line) {
  if (!line.trim()) return;

  try {
    const log = JSON.parse(line);
    const { level, message } = log;

    // Skip very verbose debug logs
    if (level === 'debug') {
      // Only show important debug messages
      if (message === 'Prefetched tasks') {
        handlePrefetch(log);
      } else if (message === 'Agent reserved' || message === 'Agent released') {
        handleAgentStatus(log);
      } else if (message === 'Context updated with progress') {
        handleContextUpdate(log);
      }
      return;
    }

    // Handle info level logs
    if (level === 'info') {
      if (message === 'Executing task') {
        handleTaskExecuting(log);
      } else if (message === 'Task execution complete') {
        handleTaskComplete(log);
      } else if (message === 'StateMachine updated') {
        const { taskId, status } = log;
        if (status === 'blocked') {
          handleTaskBlocked(log);
        }
      } else if (message === 'Task decomposed for parallel execution') {
        handleDecomposition(log);
        return;
      } else if (
        message === 'Decomposing task into subtasks' ||
        message === 'Task decomposed successfully' ||
        message === 'Subtasks registered in state machine' ||
        message === 'Attempting task decomposition'
      ) {
        return;
      } else if (message === 'Agent status snapshot') {
        handleAgentSnapshot(log);
        return;
      } else {
        // Print other info messages as-is
        console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
      }
    }

    // Handle warnings
    if (level === 'warn') {
      console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
      if (log.error) {
        console.log(`${colors.gray}  ${log.error}${colors.reset}`);
      }
    }

    // Handle errors
    if (level === 'error') {
      console.log(`${colors.red}✗ ERROR: ${message}${colors.reset}`);
      if (log.error) {
        console.log(`${colors.red}  ${log.error}${colors.reset}`);
      }
    }

  } catch (err) {
    // Not JSON, print as-is
    console.log(line);
  }
}

// Main: Read stdin line by line
import { createInterface } from 'readline';

console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}║          WeatherVane Autopilot - Live Progress Monitor        ║${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', handleLogLine);

rl.on('close', () => {
  // Final summary
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}                    Autopilot Run Complete                         ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  printProgressBar();

  console.log(`${colors.bright}Final Stats:${colors.reset}`);
  console.log(`  ${colors.green}✓ Completed: ${state.tasksCompleted}${colors.reset}`);
  console.log(`  ${colors.red}✗ Failed: ${state.tasksFailed}${colors.reset}`);
  console.log(`  ${colors.yellow}⏸ Blocked: ${state.tasksBlocked}${colors.reset}`);
  console.log();
});

process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}⚠  Interrupted by user${colors.reset}\n`);
  process.exit(0);
});
