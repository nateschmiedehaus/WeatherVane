#!/usr/bin/env node

/**
 * Gaming Strategy Detector
 *
 * Programmatically detects all 31 gaming strategies across implementation,
 * tests, evidence, and documentation.
 *
 * Can be run by:
 * - Pre-commit hooks (blocking commits)
 * - Wave 0 autopilot (phase validation)
 * - Claude Code sub-agents (manual review)
 * - CI (validation on PR)
 *
 * Usage:
 *   node detect_gaming.mjs --task AUTO-GOL-T1              # Check specific task
 *   node detect_gaming.mjs --files src/foo.ts src/bar.ts   # Check specific files
 *   node detect_gaming.mjs --all                           # Check all tasks
 *   node detect_gaming.mjs --staged                        # Check git staged files
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../../..');

// Gaming strategy definitions with P0/P1/P2 priority
const GAMING_STRATEGIES = {
  // P0: Critical blockers
  GS001_TODO_MARKERS: {
    id: 'GS001',
    name: 'TODO/FIXME Comments',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectTodoMarkers
  },
  GS002_TODO_VARIATIONS: {
    id: 'GS002',
    name: 'Deceptive Comment Variations',
    severity: 'HIGH',
    priority: 'P1',
    detector: detectTodoVariations
  },
  GS003_NOOP_RETURNS: {
    id: 'GS003',
    name: 'No-Op Return Statements',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectNoOpReturns
  },
  GS004_BUILD_ONLY_TESTS: {
    id: 'GS004',
    name: 'Build-Only Tests',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectBuildOnlyTests
  },
  GS009_TEMPLATE_CONTENT: {
    id: 'GS009',
    name: 'Template Content Copy-Paste',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectTemplateContent
  },
  GS013_NULL_RETURNS: {
    id: 'GS013',
    name: 'Null Object Pattern Abuse',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectNullReturns
  },
  GS015_THROW_NOT_IMPLEMENTED: {
    id: 'GS015',
    name: 'Throw Not Implemented',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectThrowNotImplemented
  },
  GS019_EMPTY_EVIDENCE: {
    id: 'GS019',
    name: 'Empty Evidence Files',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectEmptyEvidence
  },
  GS027_DOMAIN_CONFUSION: {
    id: 'GS027',
    name: 'Domain Confusion',
    severity: 'CRITICAL',
    priority: 'P0',
    detector: detectDomainConfusion
  }
};

/**
 * Main detection function
 */
async function detectGaming(options = {}) {
  const { taskId, files, staged, all, priority = ['P0'] } = options;

  const results = {
    violations: [],
    warnings: [],
    passed: [],
    summary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    }
  };

  // Determine what to scan
  let filesToScan = [];
  let tasksToScan = [];

  if (staged) {
    filesToScan = getStagedFiles();
  } else if (files) {
    filesToScan = files;
  } else if (taskId) {
    tasksToScan = [taskId];
  } else if (all) {
    tasksToScan = getAllTasks();
  }

  // Run P0 detectors
  for (const [key, strategy] of Object.entries(GAMING_STRATEGIES)) {
    if (!priority.includes(strategy.priority)) {
      continue;
    }

    try {
      const violations = await strategy.detector({
        taskId: tasksToScan[0],
        files: filesToScan,
        repoRoot: REPO_ROOT
      });

      if (violations && violations.length > 0) {
        results.violations.push({
          strategy: strategy.id,
          name: strategy.name,
          severity: strategy.severity,
          violations
        });

        results.summary[strategy.severity.toLowerCase()]++;
      } else {
        results.passed.push(strategy.id);
      }
    } catch (error) {
      results.warnings.push({
        strategy: strategy.id,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * GS001: TODO/FIXME Markers
 */
function detectTodoMarkers({ files, repoRoot }) {
  const violations = [];
  const pattern = /\b(TODO|FIXME|XXX|HACK|TBD|@todo|INCOMPLETE|NOT IMPLEMENTED|PLACEHOLDER|STUB|FUTURE|PENDING|WIP|NOTE|REMINDER)\b/i;

  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs|tsx|jsx)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Skip string literals
      if (line.match(/['"`].*TODO.*['"`]/)) return;

      // Detect TODO markers
      if (pattern.test(line)) {
        violations.push({
          file,
          line: index + 1,
          content: line.trim(),
          message: 'TODO/stub marker found in production code'
        });
      }
    });
  }

  return violations;
}

/**
 * GS002: TODO Variations
 */
function detectTodoVariations({ files, repoRoot }) {
  const violations = [];
  const patterns = [
    // Original patterns (5)
    /(finish|complete|implement).*later/i,
    /needs? work/i,
    /temporary|temp fix/i,
    /quick hack/i,
    /@deprecated.*use real implementation/i,

    // New patterns (10) - AFP-GAMING-DETECT-P1-QUICK-20251113
    /will\s+(enhance|improve|complete|finish|implement)\s+(later|soon|this)/i,
    /basic\s+version\s+(for\s+now|only)/i,
    /coming\s+soon/i,
    /implement\s+(properly|eventually)/i,
    /for\s+now\s*,?\s*(just|only|simply)/i,
    /simplified\s+version/i,
    /temporary\s+(solution|implementation|code)/i,
    /quick\s+(fix|hack)\s+for\s+now/i,
    /need\s+to\s+(finish|complete|implement)\s+this/i,
    /(stub|placeholder)\s+(code|implementation)/i
  ];

  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.test(line) && !line.match(/['"`]/)) {
          violations.push({
            file,
            line: index + 1,
            content: line.trim(),
            message: 'Deceptive TODO variation detected'
          });
        }
      }
    });
  }

  return violations;
}

/**
 * GS003: No-Op Returns
 */
function detectNoOpReturns({ files, repoRoot }) {
  const violations = [];
  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');

    // Simple pattern: export function with only return statement
    const functionPattern = /export\s+(function|const)\s+\w+[^{]*{[^}]*return\s+[^;]+;[^}]*}/g;
    const matches = content.match(functionPattern) || [];

    for (const match of matches) {
      // Count non-whitespace lines
      const lines = match.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));

      if (lines.length <= 3) {
        // Very short function, likely no-op
        const functionName = match.match(/(?:function|const)\s+(\w+)/)?.[1];
        violations.push({
          file,
          function: functionName,
          message: 'Function body is trivial (only return statement)'
        });
      }
    }
  }

  return violations;
}

/**
 * GS004: Build-Only Tests
 */
function detectBuildOnlyTests({ files, repoRoot }) {
  const violations = [];
  const testFiles = files.filter(f => f.match(/\.(test|spec)\.(ts|js|mjs)$/));

  for (const file of testFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');

    // Detect build-only patterns
    const buildOnlyPatterns = [
      /expect\([^)]+\)\.toBeDefined\(\)/,
      /expect\([^)]+\)\.not\.toThrow\(\)/,
      /expect\(typeof/,
      /npm run build/,
      /tsc --project/
    ];

    // Count total assertions
    const totalAssertions = (content.match(/expect\(/g) || []).length;

    // Count shallow assertions
    let shallowAssertions = 0;
    for (const pattern of buildOnlyPatterns) {
      const matches = content.match(pattern) || [];
      shallowAssertions += matches.length;
    }

    // If >80% assertions are shallow, likely build-only
    if (totalAssertions > 0 && shallowAssertions / totalAssertions > 0.8) {
      violations.push({
        file,
        totalAssertions,
        shallowAssertions,
        ratio: (shallowAssertions / totalAssertions * 100).toFixed(0) + '%',
        message: 'Tests only validate build/types, not behavior'
      });
    }
  }

  return violations;
}

/**
 * GS009: Template Content
 */
function detectTemplateContent({ taskId, repoRoot }) {
  if (!taskId) return [];

  const violations = [];
  const evidencePath = join(repoRoot, 'state/evidence', taskId);
  if (!existsSync(evidencePath)) return [];

  const templatePhrases = [
    'based on strategy, spec, and plan',
    'this design has been evaluated',
    'design approved with score',
    'see above',
    'see below',
    'refer to'
  ];

  const evidenceFiles = ['design.md', 'strategy.md', 'spec.md', 'plan.md'];

  for (const filename of evidenceFiles) {
    const filePath = join(evidencePath, filename);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lowerContent = content.toLowerCase();

    let phraseCount = 0;
    for (const phrase of templatePhrases) {
      if (lowerContent.includes(phrase)) {
        phraseCount++;
      }
    }

    // Count non-blank, non-header lines
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));

    if (phraseCount >= 2 && lines.length < 30) {
      violations.push({
        file: `${taskId}/${filename}`,
        phraseCount,
        lineCount: lines.length,
        message: 'Evidence appears to be template boilerplate'
      });
    }
  }

  return violations;
}

/**
 * GS013: Null Returns (Context-Aware) - AFP-GAMING-DETECT-P1-QUICK-20251113
 */
function detectNullReturns({ files, repoRoot }) {
  const violations = [];
  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');

    // Extract functions using helper
    const functions = extractFunctionsFromContent(content);

    // Check each function for context
    for (const func of functions) {
      if (!hasNullishReturn(func.body)) continue;

      const hasOtherLogic = analyzeForOtherLogic(func.body);

      // Flag ONLY if return is the ONLY logic (stub)
      if (!hasOtherLogic) {
        violations.push({
          file,
          line: func.lineNumber,
          content: func.name,
          message: 'Function only returns null/empty without any logic (stub implementation)'
        });
      }
      // If has other logic, likely legitimate (guard clause or error handling)
    }

    // Check implicit arrow returns (no braces) - EC4/FM6 from THINK phase
    const implicitArrowPattern = /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s+(null|undefined|\[\]|\{\}|0|false|"")\s*[;,]/g;
    let match;
    while ((match = implicitArrowPattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      violations.push({
        file,
        line: lineNumber,
        content: match[0].trim(),
        message: 'Arrow function with implicit nullish return (stub implementation)'
      });
    }
  }

  return violations;
}

// Helper: Extract functions from content
function extractFunctionsFromContent(content) {
  const functions = [];
  // Pattern handles: function foo(), const foo = () => {}, async functions
  const functionPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)\s*\{([^]*?)^\}/gm;

  let match;
  while ((match = functionPattern.exec(content)) !== null) {
    const name = match[1] || match[2] || 'anonymous';
    const body = match[3] || '';
    const lineNumber = content.substring(0, match.index).split('\n').length;

    functions.push({ name, body, lineNumber });
  }

  return functions;
}

// Helper: Check if function has nullish return
function hasNullishReturn(body) {
  return /return\s+(null|undefined|\[\]|\{\}|0|false|"")\s*;/.test(body);
}

// Helper: Analyze for other logic besides return
function analyzeForOtherLogic(body) {
  // Split into lines and filter out noise
  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !line.startsWith('//'))         // Remove single-line comments
    .filter(line => !line.startsWith('/*'))         // Remove block comment starts
    .filter(line => !line.startsWith('*'))          // Remove block comment middle
    .filter(line => line !== '{' && line !== '}');  // Remove braces

  // Count non-return statements
  const nonReturnStatements = lines.filter(line =>
    !line.startsWith('return')
  );

  // If there are other statements, function has logic
  return nonReturnStatements.length > 0;
}

/**
 * GS015: Throw Not Implemented
 */
function detectThrowNotImplemented({ files, repoRoot }) {
  const violations = [];
  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (line.match(/throw new Error\(['"`].*not implemented.*['"`]\)/i)) {
        violations.push({
          file,
          line: index + 1,
          content: line.trim(),
          message: 'Function throws "not implemented" instead of implementing'
        });
      }
    });
  }

  return violations;
}

/**
 * GS019: Empty Evidence
 */
function detectEmptyEvidence({ taskId, repoRoot }) {
  if (!taskId) return [];

  const violations = [];
  const evidencePath = join(repoRoot, 'state/evidence', taskId);
  if (!existsSync(evidencePath)) {
    return [{
      task: taskId,
      message: 'Evidence directory does not exist'
    }];
  }

  const requiredFiles = ['strategy.md', 'spec.md', 'plan.md', 'design.md'];
  const MIN_SIZE = 100; // bytes

  for (const filename of requiredFiles) {
    const filePath = join(evidencePath, filename);
    if (!existsSync(filePath)) {
      violations.push({
        file: `${taskId}/${filename}`,
        message: 'Required evidence file missing'
      });
      continue;
    }

    const stats = statSync(filePath);
    if (stats.size < MIN_SIZE) {
      violations.push({
        file: `${taskId}/${filename}`,
        size: stats.size,
        message: 'Evidence file is empty or too small'
      });
    }
  }

  return violations;
}

/**
 * GS027: Domain Confusion
 */
function detectDomainConfusion({ taskId, repoRoot }) {
  if (!taskId) return [];

  const violations = [];

  // Load roadmap to get acceptance criteria
  const roadmapPath = join(repoRoot, 'state/roadmap.yaml');
  if (!existsSync(roadmapPath)) return [];

  const planPath = join(repoRoot, 'state/evidence', taskId, 'plan.md');
  if (!existsSync(planPath)) return [];

  try {
    const roadmapContent = readFileSync(roadmapPath, 'utf-8');
    const planContent = readFileSync(planPath, 'utf-8');

    // Extract task section from roadmap
    const taskSection = roadmapContent.match(new RegExp(`id:\\s*${taskId}[\\s\\S]*?(?=\\n\\s+-\\s+id:|$)`, 'i'));
    if (!taskSection) return [];

    // Extract keywords from acceptance criteria
    const acceptanceKeywords = extractKeywords(taskSection[0]);

    // Extract keywords from tests
    const testSection = planContent.match(/##\s*PLAN-authored Tests([\s\S]*?)(?=##|$)/i);
    if (!testSection) return [];

    const testKeywords = extractKeywords(testSection[1]);

    // Calculate overlap
    const overlap = acceptanceKeywords.filter(kw => testKeywords.includes(kw));
    const overlapRatio = overlap.length / Math.max(acceptanceKeywords.length, 1);

    if (overlapRatio < 0.3) {
      violations.push({
        task: taskId,
        acceptanceKeywords: acceptanceKeywords.slice(0, 5).join(', '),
        testKeywords: testKeywords.slice(0, 5).join(', '),
        overlap: (overlapRatio * 100).toFixed(0) + '%',
        message: 'CRITICAL: Tests appear to validate different domain than acceptance criteria'
      });
    }
  } catch (error) {
    // Don't block on parsing errors
  }

  return violations;
}

/**
 * Helper: Extract keywords from text
 */
function extractKeywords(text) {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .filter((word, index, arr) => arr.indexOf(word) === index) // unique
    .slice(0, 20); // top 20
}

/**
 * Helper: Get staged files from git
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Helper: Get all tasks from state/evidence
 */
function getAllTasks() {
  const evidencePath = join(REPO_ROOT, 'state/evidence');
  if (!existsSync(evidencePath)) return [];

  return readdirSync(evidencePath).filter(name => {
    const taskPath = join(evidencePath, name);
    return statSync(taskPath).isDirectory();
  });
}

/**
 * Format results for display
 */
function formatResults(results) {
  let output = '\n🔍 Gaming Strategy Detection Results\n\n';

  if (results.violations.length === 0) {
    output += '✅ No gaming strategies detected\n';
    output += `   Checked ${results.passed.length} strategies\n`;
    return output;
  }

  output += `❌ Found ${results.violations.length} gaming violations:\n\n`;

  for (const violation of results.violations) {
    output += `[${violation.severity}] ${violation.strategy}: ${violation.name}\n`;

    for (const v of violation.violations) {
      if (v.file) {
        output += `  ${v.file}`;
        if (v.line) output += `:${v.line}`;
        output += '\n';
      }
      output += `  → ${v.message}\n`;
      if (v.content) {
        output += `     "${v.content}"\n`;
      }
      output += '\n';
    }
  }

  output += `\n📊 Summary:\n`;
  output += `   Critical: ${results.summary.critical}\n`;
  output += `   High: ${results.summary.high}\n`;
  output += `   Medium: ${results.summary.medium}\n`;
  output += `   Low: ${results.summary.low}\n`;

  return output;
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);

  const options = {
    taskId: null,
    files: [],
    staged: false,
    all: false,
    priority: ['P0'] // Default to P0 only
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task') {
      options.taskId = args[++i];
    } else if (args[i] === '--files') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options.files.push(args[++i]);
      }
    } else if (args[i] === '--staged') {
      options.staged = true;
    } else if (args[i] === '--all') {
      options.all = true;
    } else if (args[i] === '--priority') {
      options.priority = args[++i].split(',');
    } else if (args[i] === '--help') {
      console.log(`
Usage:
  node detect_gaming.mjs --task TASK-ID           # Check specific task
  node detect_gaming.mjs --files file1 file2      # Check specific files
  node detect_gaming.mjs --staged                  # Check staged files
  node detect_gaming.mjs --all                     # Check all tasks
  node detect_gaming.mjs --priority P0,P1          # Check P0 and P1 (default: P0 only)
`);
      process.exit(0);
    }
  }

  const results = await detectGaming(options);
  console.log(formatResults(results));

  // Exit code
  if (results.summary.critical > 0) {
    process.exit(1); // Block
  } else if (results.summary.high > 0) {
    process.exit(2); // Warn
  }

  process.exit(0);
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Gaming detection failed:', error.message);
    process.exit(1);
  });
}

// Export for programmatic use (Wave 0, critics, etc.)
export { detectGaming, GAMING_STRATEGIES };
