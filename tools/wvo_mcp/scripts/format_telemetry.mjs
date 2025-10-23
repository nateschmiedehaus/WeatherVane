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

    // Extract stage/progress (make it prominent)
    let stage = '—';
    if (typeof agent.currentTaskProgress === 'string' && agent.currentTaskProgress.length > 0) {
      // Comprehensive stage mapping (100+ stages for maximum visibility)
      const progressText = agent.currentTaskProgress;

      // CONTEXT & PLANNING STAGES
      if (progressText.includes('Assembling context')) stage = 'Context Assembly';
      else if (progressText.includes('Building prompt')) stage = 'Prompt Build';
      else if (progressText.includes('Classifying task')) stage = 'Task Analysis';
      else if (progressText.includes('Analyzing dependencies')) stage = 'Dependency Check';
      else if (progressText.includes('Planning approach')) stage = 'Strategy Plan';
      else if (progressText.includes('Selecting strategy')) stage = 'Strategy Select';
      else if (progressText.includes('Loading roadmap')) stage = 'Roadmap Load';
      else if (progressText.includes('Parsing requirements')) stage = 'Req Parse';
      else if (progressText.includes('Gathering context')) stage = 'Context Gather';
      else if (progressText.includes('Building context')) stage = 'Context Build';

      // AI EXECUTION STAGES
      else if (progressText.includes('Executing task with AI')) stage = 'AI Execute';
      else if (progressText.includes('Running AI model')) stage = 'AI Running';
      else if (progressText.includes('Waiting for AI')) stage = 'AI Waiting';
      else if (progressText.includes('AI processing')) stage = 'AI Process';
      else if (progressText.includes('Model inference')) stage = 'AI Inference';
      else if (progressText.includes('Streaming response')) stage = 'AI Stream';
      else if (progressText.includes('AI generation')) stage = 'AI Generate';

      // QUALITY GATE STAGES
      else if (progressText.includes('Running pre-task quality')) stage = 'Pre-QA Gate';
      else if (progressText.includes('Running post-task quality')) stage = 'Post-QA Gate';
      else if (progressText.includes('Quality review')) stage = 'QA Review';
      else if (progressText.includes('Adversarial check')) stage = 'Adversarial QA';
      else if (progressText.includes('Orchestrator review')) stage = 'Orchestrator QA';
      else if (progressText.includes('Peer review')) stage = 'Peer Review';
      else if (progressText.includes('Consensus check')) stage = 'Consensus QA';
      else if (progressText.includes('Decision logging')) stage = 'QA Decision Log';

      // PRE-FLIGHT STAGES
      else if (progressText.includes('Running pre-flight')) stage = 'Pre-flight';
      else if (progressText.includes('Pre-flight checks')) stage = 'Pre-flight Run';
      else if (progressText.includes('Checking blockers')) stage = 'Blocker Check';
      else if (progressText.includes('Verifying preconditions')) stage = 'Precond Verify';
      else if (progressText.includes('Validating inputs')) stage = 'Input Valid';

      // BUILDING STAGES
      else if (progressText.includes('Running build')) stage = 'Build';
      else if (progressText.includes('Compiling TypeScript')) stage = 'TS Compile';
      else if (progressText.includes('Compiling code')) stage = 'Code Compile';
      else if (progressText.includes('Building project')) stage = 'Project Build';
      else if (progressText.includes('Bundling')) stage = 'Bundle';
      else if (progressText.includes('Transpiling')) stage = 'Transpile';
      else if (progressText.includes('Type checking')) stage = 'Type Check';

      // TESTING STAGES
      else if (progressText.includes('Running tests')) stage = 'Test Run';
      else if (progressText.includes('Running unit tests')) stage = 'Unit Test';
      else if (progressText.includes('Running integration tests')) stage = 'Integration Test';
      else if (progressText.includes('Running e2e tests')) stage = 'E2E Test';
      else if (progressText.includes('Test discovery')) stage = 'Test Discover';
      else if (progressText.includes('Test setup')) stage = 'Test Setup';
      else if (progressText.includes('Test teardown')) stage = 'Test Cleanup';
      else if (progressText.includes('Coverage analysis')) stage = 'Coverage Check';
      else if (progressText.includes('Test validation')) stage = 'Test Validate';

      // AUDIT STAGES
      else if (progressText.includes('Running audit')) stage = 'Audit';
      else if (progressText.includes('npm audit')) stage = 'NPM Audit';
      else if (progressText.includes('Security audit')) stage = 'Security Audit';
      else if (progressText.includes('Dependency audit')) stage = 'Dep Audit';
      else if (progressText.includes('Vulnerability scan')) stage = 'Vuln Scan';
      else if (progressText.includes('License check')) stage = 'License Check';

      // ERROR & FIX STAGES
      else if (progressText.includes('Detecting errors')) stage = 'Error Detect';
      else if (progressText.includes('Analyzing errors')) stage = 'Error Analyze';
      else if (progressText.includes('Fixing errors')) stage = 'Error Fix';
      else if (progressText.includes('Applying fix')) stage = 'Fix Apply';
      else if (progressText.includes('Validating fix')) stage = 'Fix Validate';
      else if (progressText.includes('Retrying')) stage = 'Retry';
      else if (progressText.includes('Error recovery')) stage = 'Error Recovery';
      else if (progressText.includes('Debugging')) stage = 'Debug';

      // ITERATION STAGES
      else if (progressText.includes('Iteration')) stage = 'Iterate';
      else if (progressText.includes('Refining')) stage = 'Refine';
      else if (progressText.includes('Improving')) stage = 'Improve';
      else if (progressText.includes('Optimizing')) stage = 'Optimize';
      else if (progressText.includes('Adjusting')) stage = 'Adjust';

      // FILE OPERATION STAGES
      else if (progressText.includes('Reading file')) stage = 'File Read';
      else if (progressText.includes('Writing file')) stage = 'File Write';
      else if (progressText.includes('Editing file')) stage = 'File Edit';
      else if (progressText.includes('Creating file')) stage = 'File Create';
      else if (progressText.includes('Deleting file')) stage = 'File Delete';
      else if (progressText.includes('Moving file')) stage = 'File Move';
      else if (progressText.includes('Copying file')) stage = 'File Copy';
      else if (progressText.includes('Searching files')) stage = 'File Search';

      // GIT OPERATION STAGES
      else if (progressText.includes('Git commit')) stage = 'Git Commit';
      else if (progressText.includes('Git push')) stage = 'Git Push';
      else if (progressText.includes('Git pull')) stage = 'Git Pull';
      else if (progressText.includes('Git status')) stage = 'Git Status';
      else if (progressText.includes('Git diff')) stage = 'Git Diff';
      else if (progressText.includes('Git checkout')) stage = 'Git Checkout';
      else if (progressText.includes('Git branch')) stage = 'Git Branch';
      else if (progressText.includes('Git merge')) stage = 'Git Merge';
      else if (progressText.includes('Git rebase')) stage = 'Git Rebase';
      else if (progressText.includes('Git stash')) stage = 'Git Stash';

      // PROCESSING STAGES
      else if (progressText.includes('Processing results')) stage = 'Result Process';
      else if (progressText.includes('Parsing output')) stage = 'Output Parse';
      else if (progressText.includes('Analyzing output')) stage = 'Output Analyze';
      else if (progressText.includes('Validating results')) stage = 'Result Validate';
      else if (progressText.includes('Formatting output')) stage = 'Output Format';
      else if (progressText.includes('Extracting data')) stage = 'Data Extract';
      else if (progressText.includes('Transforming data')) stage = 'Data Transform';

      // DOCUMENTATION STAGES
      else if (progressText.includes('Writing docs')) stage = 'Doc Write';
      else if (progressText.includes('Updating docs')) stage = 'Doc Update';
      else if (progressText.includes('Generating docs')) stage = 'Doc Generate';
      else if (progressText.includes('Validating docs')) stage = 'Doc Validate';
      else if (progressText.includes('Doc review')) stage = 'Doc Review';

      // CRITIC STAGES
      else if (progressText.includes('Running critic')) stage = 'Critic Run';
      else if (progressText.includes('TestsCritic')) stage = 'Tests Critic';
      else if (progressText.includes('BuildCritic')) stage = 'Build Critic';
      else if (progressText.includes('DocsCritic')) stage = 'Docs Critic';
      else if (progressText.includes('SecurityCritic')) stage = 'Security Critic';
      else if (progressText.includes('PerformanceCritic')) stage = 'Perf Critic';
      else if (progressText.includes('Critic analysis')) stage = 'Critic Analyze';

      // DEPLOYMENT STAGES
      else if (progressText.includes('Deploying')) stage = 'Deploy';
      else if (progressText.includes('Publishing')) stage = 'Publish';
      else if (progressText.includes('Releasing')) stage = 'Release';
      else if (progressText.includes('Packaging')) stage = 'Package';
      else if (progressText.includes('Uploading')) stage = 'Upload';

      // DATABASE STAGES
      else if (progressText.includes('Database query')) stage = 'DB Query';
      else if (progressText.includes('Database update')) stage = 'DB Update';
      else if (progressText.includes('Database migration')) stage = 'DB Migrate';
      else if (progressText.includes('Database backup')) stage = 'DB Backup';
      else if (progressText.includes('Database restore')) stage = 'DB Restore';

      // MONITORING STAGES
      else if (progressText.includes('Health check')) stage = 'Health Check';
      else if (progressText.includes('Monitoring')) stage = 'Monitor';
      else if (progressText.includes('Collecting metrics')) stage = 'Metrics Collect';
      else if (progressText.includes('Logging')) stage = 'Log';
      else if (progressText.includes('Tracing')) stage = 'Trace';

      // CLEANUP STAGES
      else if (progressText.includes('Cleaning up')) stage = 'Cleanup';
      else if (progressText.includes('Garbage collection')) stage = 'GC';
      else if (progressText.includes('Pruning')) stage = 'Prune';
      else if (progressText.includes('Removing temp')) stage = 'Temp Cleanup';

      // WAITING STAGES
      else if (progressText.includes('Waiting for')) stage = 'Waiting';
      else if (progressText.includes('Queued')) stage = 'Queued';
      else if (progressText.includes('Blocked')) stage = 'Blocked';
      else if (progressText.includes('Paused')) stage = 'Paused';

      // COMPLETION STAGES
      else if (progressText.includes('Finalizing')) stage = 'Finalize';
      else if (progressText.includes('Completing')) stage = 'Complete';
      else if (progressText.includes('Wrapping up')) stage = 'Wrap Up';
      else if (progressText.includes('Saving state')) stage = 'State Save';

      // DEFAULT: Show abbreviated version
      else stage = progressText.substring(0, 16);
    }

    // Build task display: Show full title/description from agent or tracked state
    let currentTask = '—';
    if (typeof agent.currentTask === 'string' && agent.currentTask.length > 0) {
      const taskId = agent.currentTask;
      const parts = [taskId];

      // Add task type badge if available
      if (typeof agent.currentTaskType === 'string' && agent.currentTaskType.length > 0) {
        parts.push(`[${agent.currentTaskType}]`);
      }

      // Prefer agent.currentTaskTitle if available (set during reserve)
      if (typeof agent.currentTaskTitle === 'string' && agent.currentTaskTitle.length > 0 && agent.currentTaskTitle !== taskId) {
        // Agent has full title - show it!
        parts.push(truncate(agent.currentTaskTitle, 45));
      } else {
        // Fall back to looking up in tracked tasks
        const trackedTask = state.currentTasks.get(taskId);
        if (trackedTask?.title) {
          parts.push(truncate(trackedTask.title, 45));
        }
      }

      // Add description if available and different from title (shortened since we have stage column)
      if (typeof agent.currentTaskDescription === 'string' && agent.currentTaskDescription.length > 0 && agent.currentTaskDescription !== agent.currentTaskTitle) {
        parts.push(`· ${truncate(agent.currentTaskDescription, 30)}`);
      }

      currentTask = parts.join(' ');
    } else if (typeof agent.lastTaskTitle === 'string' && agent.lastTaskTitle.length > 0) {
      // Show last task title (description) for idle agents
      currentTask = `last: ${truncate(agent.lastTaskTitle, 40)}`;
    } else if (typeof agent.lastTask === 'string' && agent.lastTask.length > 0) {
      // Fallback to last task ID if no title available
      currentTask = `last: ${truncate(agent.lastTask, 40)}`;
    }

    const model = typeof agent.model === 'string' && agent.model.length > 0 ? agent.model : 'model?';
    const role = typeof agent.role === 'string' && agent.role.length > 0 ? agent.role : '';

    let statusColor = colors.yellow;
    if (statusRaw === 'busy' || statusRaw === 'working') statusColor = colors.green;
    else if (statusRaw === 'idle') statusColor = colors.gray;
    else if (statusRaw === 'failed' || statusRaw === 'error') statusColor = colors.red;

    // Color code the stage (detailed color mapping)
    let stageColor = colors.cyan; // Default cyan

    // RED: Errors, failures, critical issues
    if (stage.includes('Error') || stage.includes('Fail') || stage.includes('Debug') ||
        stage.includes('Blocked') || stage.includes('Recovery')) {
      stageColor = colors.red;
    }
    // YELLOW: Warnings, fixes, audits, reviews
    else if (stage.includes('Fix') || stage.includes('Audit') || stage.includes('QA') ||
             stage.includes('Review') || stage.includes('Critic') || stage.includes('Warn') ||
             stage.includes('Check') || stage.includes('Validate') || stage.includes('Verify')) {
      stageColor = colors.yellow;
    }
    // GREEN: Active execution, building, testing success
    else if (stage.includes('AI Execute') || stage.includes('Build') || stage.includes('Test Run') ||
             stage.includes('Deploy') || stage.includes('Complete') || stage.includes('Success') ||
             stage.includes('Compile') || stage.includes('Git Commit') || stage.includes('Publish')) {
      stageColor = colors.green;
    }
    // MAGENTA: Planning, analysis, preparation
    else if (stage.includes('Plan') || stage.includes('Analyz') || stage.includes('Strategy') ||
             stage.includes('Context') || stage.includes('Classify') || stage.includes('Parse')) {
      stageColor = colors.magenta;
    }
    // GRAY: Waiting, queued, idle operations
    else if (stage.includes('Wait') || stage.includes('Queue') || stage.includes('Pause') ||
             stage.includes('Idle')) {
      stageColor = colors.gray;
    }
    // CYAN: Everything else (file ops, processing, etc.)
    else {
      stageColor = colors.cyan;
    }

    const idDisplay = rawId.padEnd(14, ' ');
    const roleDisplay = role ? `${role.padEnd(18, ' ')}` : ''.padEnd(18, ' ');
    const stageDisplay = stage.padEnd(16, ' ');

    console.log(
      `${colors.gray}   ${idDisplay}${colors.reset} ${roleDisplay}${statusColor}${statusRaw.toUpperCase().padEnd(9, ' ')}${colors.reset} ${stageColor}${stageDisplay}${colors.reset} ${colors.dim}${model}${colors.reset} ${colors.dim}${currentTask}${colors.reset}`,
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
      } else if (message === 'Alert logged, no action taken') {
        // Extract and show actual alert details instead of generic message
        const alertType = log.alertType || log.type || 'unknown';
        const alertMessage = log.alertMessage || log.alert || log.reason || 'no details';
        const taskId = log.taskId ? ` (task: ${log.taskId})` : '';
        console.log(`${colors.yellow}🚨 Alert [${alertType}]${colors.reset}${taskId}: ${truncate(alertMessage, 100)}`);
      } else if (message === 'Agent progress update') {
        // Show real-time progress updates during task execution
        const agentId = log.agentId || log.agent || 'unknown';
        const taskId = log.taskId || log.task || '';
        const progress = log.progress || '';
        const taskLabel = taskId ? ` [${taskId}]` : '';
        console.log(`${colors.cyan}⚙️  ${agentId}${taskLabel}${colors.reset}: ${colors.dim}${truncate(progress, 100)}${colors.reset}`);

        // Update tracked task progress if we have it
        if (taskId && state.currentTasks.has(taskId)) {
          const tracked = state.currentTasks.get(taskId);
          if (tracked) {
            tracked.progress = progress;
          }
        }
      } else if (message === 'Agent progress note' || log.agentNote || log.note) {
        // Show agent notes/progress during task execution
        const agentId = log.agentId || log.agent || 'unknown';
        const taskId = log.taskId || log.task || '';
        const note = log.agentNote || log.note || log.progress || message;
        const taskLabel = taskId ? ` [${taskId}]` : '';
        console.log(`${colors.cyan}📝 ${agentId}${taskLabel}${colors.reset}: ${truncate(note, 120)}`);
      } else if (message === 'Blocker escalated') {
        // Show blocker details
        const blockerId = log.blockerId || log.id || 'unknown';
        const blockerReason = log.reason || log.message || 'no reason provided';
        const taskId = log.taskId ? ` (task: ${log.taskId})` : '';
        console.log(`${colors.red}🚧 Blocker [${blockerId}]${colors.reset}${taskId}: ${truncate(blockerReason, 100)}`);
      } else if (message === 'Task failure recorded' || message === 'Execution failed') {
        // Show failure details
        const taskId = log.taskId || 'unknown';
        const reason = log.error || log.reason || log.message || 'unknown error';
        console.log(`${colors.red}💥 Failure [${taskId}]${colors.reset}: ${truncate(reason, 100)}`);
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
