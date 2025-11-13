#!/usr/bin/env node

/**
 * Commit Enforcement Monitor
 *
 * Programmatically enforces frequent commits by:
 * 1. Monitoring uncommitted changes
 * 2. Tracking time since last commit
 * 3. Detecting phase boundaries
 * 4. Auto-committing when thresholds exceeded
 *
 * Usage:
 *   node enforce_commits.mjs --check     # Check status
 *   node enforce_commits.mjs --enforce   # Enforce and auto-commit if needed
 *   node enforce_commits.mjs --watch     # Continuous monitoring
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = process.cwd();
const STATE_DIR = join(REPO_ROOT, 'state');
const COMMIT_STATE_FILE = join(STATE_DIR, '.commit_enforcement_state.json');

// Configuration
const CONFIG = {
  MAX_UNCOMMITTED_MINUTES: 30,          // Force commit after 30 min
  MAX_UNCOMMITTED_FILES: 5,             // Max files before warning
  MAX_UNCOMMITTED_LINES: 150,           // Max LOC before warning
  CRITICAL_UNCOMMITTED_FILES: 10,       // Block work if this many files
  CRITICAL_UNCOMMITTED_LINES: 300,      // Block work if this many lines
  PHASE_BOUNDARY_COMMIT: true,          // Auto-commit at phase boundaries
  CHECK_INTERVAL_SECONDS: 60,           // Check every minute in watch mode
};

/**
 * Get current git status
 */
function getGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    const lines = status.trim().split('\n').filter(Boolean);

    const staged = lines.filter(l => l.match(/^[MADRC]/)).map(l => l.substring(3));
    const unstaged = lines.filter(l => l.match(/^.[MD]/)).map(l => l.substring(3));
    const untracked = lines.filter(l => l.startsWith('??')).map(l => l.substring(3));

    return {
      total: lines.length,
      staged,
      unstaged,
      untracked,
      allFiles: [...new Set([...staged, ...unstaged, ...untracked])]
    };
  } catch (error) {
    return { total: 0, staged: [], unstaged: [], untracked: [], allFiles: [] };
  }
}

/**
 * Get total lines changed (added + modified)
 */
function getLinesChanged() {
  try {
    const diff = execSync('git diff --stat', { encoding: 'utf-8' });
    const match = diff.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/);
    if (match) {
      const insertions = parseInt(match[1] || 0);
      const deletions = parseInt(match[2] || 0);
      return insertions + deletions;
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Get time since last commit (in minutes)
 */
function getTimeSinceLastCommit() {
  try {
    const timestamp = execSync('git log -1 --format=%ct', { encoding: 'utf-8' }).trim();
    const lastCommitTime = parseInt(timestamp) * 1000;
    const now = Date.now();
    return Math.floor((now - lastCommitTime) / 1000 / 60);
  } catch (error) {
    return 0;
  }
}

/**
 * Get current branch
 */
function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Detect current AFP phase based on recently modified evidence files
 */
function detectCurrentPhase() {
  const phaseFiles = [
    'strategize.md',
    'spec.md',
    'plan.md',
    'think.md',
    'design.md',
    'implement.md',
    'verify.md',
    'review.md',
    'pr.md',
    'monitor.md'
  ];

  try {
    const status = getGitStatus();
    for (const file of status.allFiles) {
      for (const phase of phaseFiles) {
        if (file.endsWith(phase)) {
          return phase.replace('.md', '').toUpperCase();
        }
      }
    }
  } catch (error) {
    // Ignore
  }

  return null;
}

/**
 * Load commit enforcement state
 */
function loadState() {
  if (existsSync(COMMIT_STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(COMMIT_STATE_FILE, 'utf-8'));
    } catch (error) {
      // Invalid state file
    }
  }

  return {
    lastCheckTime: Date.now(),
    lastPhase: null,
    lastCommitTime: Date.now(),
    warningCount: 0,
    criticalWarningCount: 0,
  };
}

/**
 * Save commit enforcement state
 */
function saveState(state) {
  writeFileSync(COMMIT_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Create auto-commit with context
 */
function autoCommit(reason, files) {
  const branch = getCurrentBranch();
  const phase = detectCurrentPhase();

  let message = `chore: auto-commit ${reason}\n\n`;
  message += `Branch: ${branch}\n`;
  if (phase) {
    message += `Phase: ${phase}\n`;
  }
  message += `Files: ${files.length}\n`;
  message += `\nAuto-committed by commit enforcement\n`;

  try {
    // Stage files
    if (files.length > 0) {
      for (const file of files) {
        execSync(`git add "${file}"`, { stdio: 'ignore' });
      }
    } else {
      execSync('git add -A', { stdio: 'ignore' });
    }

    // Commit with --no-verify to bypass pre-commit hooks (enforcement itself)
    execSync(`git commit --no-verify -m "${message}"`, { stdio: 'pipe' });

    console.log(`✅ Auto-committed: ${reason}`);
    console.log(`   Files: ${files.length}`);
    console.log(`   Branch: ${branch}`);

    return true;
  } catch (error) {
    console.error(`❌ Auto-commit failed: ${error.message}`);
    return false;
  }
}

/**
 * Check and enforce commit requirements
 */
function checkAndEnforce(options = {}) {
  const { enforce = false, verbose = true } = options;

  const state = loadState();
  const status = getGitStatus();
  const linesChanged = getLinesChanged();
  const minutesSinceCommit = getTimeSinceLastCommit();
  const currentPhase = detectCurrentPhase();
  const branch = getCurrentBranch();

  let violations = [];
  let criticalViolations = [];
  let shouldCommit = false;
  let commitReason = '';

  // Check 1: Time since last commit
  if (minutesSinceCommit > CONFIG.MAX_UNCOMMITTED_MINUTES) {
    violations.push(`⏰ ${minutesSinceCommit} minutes since last commit (max: ${CONFIG.MAX_UNCOMMITTED_MINUTES})`);
    if (minutesSinceCommit > CONFIG.MAX_UNCOMMITTED_MINUTES * 2) {
      criticalViolations.push('CRITICAL: More than 1 hour without commit');
      shouldCommit = true;
      commitReason = `after ${minutesSinceCommit} minutes`;
    }
  }

  // Check 2: Number of files
  if (status.total > CONFIG.MAX_UNCOMMITTED_FILES) {
    violations.push(`📁 ${status.total} uncommitted files (max: ${CONFIG.MAX_UNCOMMITTED_FILES})`);
    if (status.total >= CONFIG.CRITICAL_UNCOMMITTED_FILES) {
      criticalViolations.push(`CRITICAL: ${status.total} uncommitted files`);
      shouldCommit = true;
      commitReason = `with ${status.total} files`;
    }
  }

  // Check 3: Lines changed
  if (linesChanged > CONFIG.MAX_UNCOMMITTED_LINES) {
    violations.push(`📝 ${linesChanged} lines changed (max: ${CONFIG.MAX_UNCOMMITTED_LINES})`);
    if (linesChanged >= CONFIG.CRITICAL_UNCOMMITTED_LINES) {
      criticalViolations.push(`CRITICAL: ${linesChanged} lines changed`);
      shouldCommit = true;
      commitReason = `with ${linesChanged} lines`;
    }
  }

  // Check 4: Phase boundary crossing
  if (CONFIG.PHASE_BOUNDARY_COMMIT && currentPhase && state.lastPhase !== currentPhase) {
    violations.push(`🔄 Phase boundary: ${state.lastPhase || 'none'} → ${currentPhase}`);
    if (status.total > 0) {
      shouldCommit = true;
      commitReason = `at phase boundary (${currentPhase})`;
    }
  }

  // Output results
  if (verbose) {
    console.log('\n📊 Commit Enforcement Status\n');
    console.log(`Branch: ${branch}`);
    console.log(`Phase: ${currentPhase || 'none detected'}`);
    console.log(`Time since last commit: ${minutesSinceCommit} minutes`);
    console.log(`Uncommitted files: ${status.total}`);
    console.log(`Lines changed: ${linesChanged}`);
    console.log();

    if (violations.length > 0) {
      console.log('⚠️  VIOLATIONS:');
      violations.forEach(v => console.log(`   ${v}`));
      console.log();
    }

    if (criticalViolations.length > 0) {
      console.log('🚨 CRITICAL VIOLATIONS:');
      criticalViolations.forEach(v => console.log(`   ${v}`));
      console.log();
    }
  }

  // Enforce if requested
  if (enforce && shouldCommit && status.total > 0) {
    console.log(`🔨 ENFORCING: Creating auto-commit ${commitReason}`);
    const success = autoCommit(commitReason, status.allFiles);

    if (success) {
      state.lastPhase = currentPhase;
      state.lastCommitTime = Date.now();
      state.warningCount = 0;
      state.criticalWarningCount = 0;
      saveState(state);

      return { enforced: true, violations, criticalViolations };
    }
  } else if (shouldCommit) {
    console.log(`💡 RECOMMENDATION: Commit your work ${commitReason}`);
    console.log(`   Run with --enforce to auto-commit`);
  }

  // Update state
  state.lastCheckTime = Date.now();
  if (violations.length > 0) {
    state.warningCount++;
  }
  if (criticalViolations.length > 0) {
    state.criticalWarningCount++;
  }
  saveState(state);

  return {
    enforced: false,
    violations,
    criticalViolations,
    shouldCommit,
    status
  };
}

/**
 * Watch mode - continuous monitoring
 */
async function watchMode() {
  console.log('👀 Starting commit enforcement watch mode');
  console.log(`   Checking every ${CONFIG.CHECK_INTERVAL_SECONDS} seconds`);
  console.log(`   Press Ctrl+C to stop\n`);

  while (true) {
    checkAndEnforce({ enforce: true, verbose: false });

    await new Promise(resolve => setTimeout(resolve, CONFIG.CHECK_INTERVAL_SECONDS * 1000));
  }
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Commit Enforcement Monitor

Usage:
  enforce_commits.mjs --check     # Check status (no enforcement)
  enforce_commits.mjs --enforce   # Check and auto-commit if needed
  enforce_commits.mjs --watch     # Continuous monitoring with auto-commit
  enforce_commits.mjs --config    # Show configuration

Configuration:
  MAX_UNCOMMITTED_MINUTES: ${CONFIG.MAX_UNCOMMITTED_MINUTES}
  MAX_UNCOMMITTED_FILES: ${CONFIG.MAX_UNCOMMITTED_FILES}
  MAX_UNCOMMITTED_LINES: ${CONFIG.MAX_UNCOMMITTED_LINES}
  CRITICAL_UNCOMMITTED_FILES: ${CONFIG.CRITICAL_UNCOMMITTED_FILES}
  CRITICAL_UNCOMMITTED_LINES: ${CONFIG.CRITICAL_UNCOMMITTED_LINES}
  PHASE_BOUNDARY_COMMIT: ${CONFIG.PHASE_BOUNDARY_COMMIT}
`);
    return;
  }

  if (args.includes('--config')) {
    console.log('Current Configuration:');
    console.log(JSON.stringify(CONFIG, null, 2));
    return;
  }

  if (args.includes('--watch')) {
    await watchMode();
    return;
  }

  const enforce = args.includes('--enforce');
  const result = checkAndEnforce({ enforce, verbose: true });

  // Exit code
  if (result.criticalViolations.length > 0) {
    process.exit(1);
  } else if (result.violations.length > 0) {
    process.exit(2);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
