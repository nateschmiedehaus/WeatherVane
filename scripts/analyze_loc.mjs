#!/usr/bin/env node
/**
 * Smart LOC Analysis CLI
 *
 * Analyzes staged git changes with context-aware LOC enforcement.
 * Called by pre-commit hook to validate commit size.
 *
 * Usage:
 *   node scripts/analyze_loc.mjs --staged
 *   node scripts/analyze_loc.mjs --files src/foo.ts src/bar.ts
 *   node scripts/analyze_loc.mjs --staged --verbose
 *   node scripts/analyze_loc.mjs --staged --dry-run
 *
 * Exit codes:
 *   0 - Pass (all files within limits)
 *   1 - Blocked (one or more files exceeded limits)
 *   2 - Warning only (informational, not blocking)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WORKSPACE_ROOT = join(__dirname, '..');

// Dynamically import TypeScript modules
const {
  analyzeCommitLOC,
  formatAnalysis,
  logLOCAnalysis,
  createLogEntry
} = await import('../tools/wvo_mcp/dist/enforcement/index.js');

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  staged: args.includes('--staged'),
  verbose: args.includes('--verbose'),
  dryRun: args.includes('--dry-run'),
  files: args.filter(arg => !arg.startsWith('--')),
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
};

/**
 * Get changed files from git
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --numstat', {
      encoding: 'utf-8',
      cwd: WORKSPACE_ROOT,
    });

    if (!output.trim()) {
      return [];
    }

    const files = [];
    for (const line of output.trim().split('\n')) {
      const parts = line.split('\t');
      if (parts.length !== 3) continue;

      const [added, deleted, path] = parts;

      // Skip binary files (marked with -)
      if (added === '-' || deleted === '-') continue;

      // Skip deleted files
      const fullPath = join(WORKSPACE_ROOT, path);
      if (!existsSync(fullPath)) continue;

      files.push({
        path,
        addedLines: parseInt(added, 10),
        deletedLines: parseInt(deleted, 10),
        content: readFileSync(fullPath, 'utf-8'),
      });
    }

    return files;
  } catch (error) {
    console.error(`${colors.red}Error getting staged files:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Get specific files from command line
 */
function getSpecificFiles(paths) {
  const files = [];

  for (const path of paths) {
    const fullPath = join(WORKSPACE_ROOT, path);

    if (!existsSync(fullPath)) {
      console.error(`${colors.red}Error: File not found:${colors.reset} ${path}`);
      process.exit(1);
    }

    const content = readFileSync(fullPath, 'utf-8');
    const lineCount = content.split('\n').length;

    files.push({
      path,
      addedLines: lineCount,
      deletedLines: 0,
      content,
    });
  }

  return files;
}

/**
 * Check for override in commit message
 */
function checkForOverride() {
  try {
    // Get the commit message being prepared (if any)
    const gitDir = join(WORKSPACE_ROOT, '.git');
    const commitMsgFile = join(gitDir, 'COMMIT_EDITMSG');

    if (!existsSync(commitMsgFile)) {
      return null;
    }

    const commitMsg = readFileSync(commitMsgFile, 'utf-8');
    const match = commitMsg.match(/LOC_OVERRIDE:\s*(.+)/i);

    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Main analysis
 */
async function main() {
  // Get files to analyze
  const files = flags.staged
    ? getStagedFiles()
    : flags.files.length > 0
    ? getSpecificFiles(flags.files)
    : [];

  if (files.length === 0) {
    if (flags.verbose) {
      console.log(`${colors.yellow}No files to analyze${colors.reset}`);
    }
    process.exit(0);
  }

  // Run analysis
  const analysis = analyzeCommitLOC(files);

  // Check for override
  const overrideReason = checkForOverride();

  // Log to analytics
  try {
    const logEntry = createLogEntry(analysis, overrideReason);
    logLOCAnalysis(logEntry);
  } catch (error) {
    if (flags.verbose) {
      console.warn('Warning: Failed to log analytics:', error.message);
    }
  }

  // Format and print results
  const formatted = formatAnalysis(analysis);
  console.log(formatted);

  // Determine exit code
  if (flags.dryRun) {
    console.log(`\n${colors.yellow}(Dry run - not enforcing)${colors.reset}`);
    process.exit(0);
  }

  if (overrideReason) {
    console.log(`\n${colors.yellow}✓ Override applied: ${overrideReason}${colors.reset}`);
    process.exit(0);
  }

  if (!analysis.overallAllowed) {
    console.log(`\n${colors.red}❌ Commit blocked by LOC enforcement${colors.reset}`);
    console.log(`\n${colors.yellow}To override (if justified):${colors.reset}`);
    console.log('  1. Add to commit message: LOC_OVERRIDE: <reason>');
    console.log('  2. Or bypass: git commit --no-verify (not recommended)');
    process.exit(1);
  }

  if (analysis.overallSeverity === 'warning' || analysis.overallSeverity === 'strong-warning') {
    console.log(`\n${colors.yellow}⚠️  Warnings present (not blocking)${colors.reset}`);
    process.exit(2); // Warning exit code
  }

  console.log(`\n${colors.green}✅ All files within LOC limits${colors.reset}`);
  process.exit(0);
}

main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
