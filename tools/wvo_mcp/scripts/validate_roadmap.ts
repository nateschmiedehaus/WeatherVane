#!/usr/bin/env node
/**
 * ROADMAP-STRUCT: Roadmap Validation CLI
 *
 * Validates state/roadmap.yaml against v2.0 schema
 * Checks: structural errors, circular deps, missing refs, invalid tools
 *
 * Usage:
 *   npm run validate:roadmap
 *   npm run validate:roadmap -- --file path/to/roadmap.yaml
 *   npm run validate:roadmap -- --json
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { validateRoadmap, formatValidationResult } from '../src/roadmap/validators.js';
import type { ValidationResult } from '../src/roadmap/validators.js';
import { DependencyGraph } from '../src/roadmap/dependency_graph.js';
import type { RoadmapSchema } from '../src/roadmap/schemas.js';

/**
 * CLI argument parsing
 */
interface CLIArgs {
  file?: string;
  json?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && i + 1 < args.length) {
      result.file = args[++i];
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }

  return result;
}

/**
 * Show help text
 */
function showHelp(): void {
  console.log(`
Roadmap Validation Tool

Usage:
  npm run validate:roadmap [options]

Options:
  --file <path>   Path to roadmap file (default: state/roadmap.yaml)
  --json          Output JSON format for CI
  --help, -h      Show this help message

Exit Codes:
  0  Roadmap is valid
  1  Roadmap has errors

Examples:
  npm run validate:roadmap
  npm run validate:roadmap -- --file test/fixtures/roadmap.yaml
  npm run validate:roadmap -- --json
  `.trim());
}

/**
 * Load roadmap from file
 */
function loadRoadmap(filePath: string): any {
  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ Error: File not found: ${absolutePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    return yaml.load(content);
  } catch (error: any) {
    if (error.name === 'YAMLException') {
      console.error(`❌ YAML Parse Error:`);
      console.error(`  ${error.message}`);
      if (error.mark) {
        console.error(`  at line ${error.mark.line + 1}, column ${error.mark.column + 1}`);
      }
    } else {
      console.error(`❌ Error loading roadmap: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Check for circular dependencies
 */
function checkCircularDependencies(roadmap: RoadmapSchema, result: ValidationResult): void {
  try {
    const graph = new DependencyGraph(roadmap);
    const cycles = graph.detectCircularDependencies();

    if (cycles.length > 0) {
      result.valid = false;
      cycles.forEach((cycle, index) => {
        result.errors.push({
          type: 'error',
          code: 'CIRCULAR_DEPENDENCY',
          message: `Circular dependency detected: ${cycle.join(' → ')}`,
          path: `cycle_${index + 1}`,
          suggestion: 'Remove one of the dependencies to break the cycle'
        });
      });
    }
  } catch (error: any) {
    result.warnings.push({
      type: 'warning',
      code: 'GRAPH_CONSTRUCTION_ERROR',
      message: `Could not build dependency graph: ${error.message}`,
      path: 'dependency_graph'
    });
  }
}

/**
 * Check for missing task references
 */
function checkMissingReferences(roadmap: RoadmapSchema, result: ValidationResult): void {
  try {
    const graph = new DependencyGraph(roadmap);
    const missing = graph.getMissingReferences();

    if (missing.size > 0) {
      result.valid = false;
      for (const [taskId, missingRefs] of missing) {
        missingRefs.forEach(ref => {
          result.errors.push({
            type: 'error',
            code: 'MISSING_TASK_REFERENCE',
            message: `Task ${taskId} depends on non-existent task: ${ref}`,
            path: `task:${taskId}`,
            suggestion: `Check that ${ref} exists in the roadmap, or remove the dependency`
          });
        });
      }
    }
  } catch (error: any) {
    // Already warned about graph construction error
  }
}

/**
 * Output validation result
 */
function outputResult(result: ValidationResult, jsonMode: boolean, stats: any): void {
  if (jsonMode) {
    console.log(JSON.stringify({ ...result, stats }, null, 2));
  } else {
    console.log(formatValidationResult(result));
    console.log('');
    console.log('Stats:');
    console.log(`  Total tasks: ${stats.totalTasks}`);
    console.log(`  Total errors: ${result.errors.length}`);
    console.log(`  Total warnings: ${result.warnings.length}`);
    console.log(`  Validation time: ${stats.validationTimeMs}ms`);
  }
}

/**
 * Count total tasks in roadmap
 */
function countTasks(roadmap: any): number {
  let count = 0;
  if (roadmap.epics) {
    for (const epic of roadmap.epics) {
      if (epic.milestones) {
        for (const milestone of epic.milestones) {
          if (milestone.tasks) {
            count += milestone.tasks.length;
          }
        }
      }
    }
  }
  return count;
}

/**
 * Main execution
 */
function main(): void {
  const startTime = Date.now();
  const args = parseArgs(process.argv.slice(2));

  // Show help
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Default file path
  const filePath = args.file || 'state/roadmap.yaml';
  const jsonMode = args.json || false;

  // Load roadmap
  const roadmapData = loadRoadmap(filePath);

  // Run validation
  const result = validateRoadmap(roadmapData);

  // Additional checks (circular deps, missing refs)
  if (roadmapData && typeof roadmapData === 'object') {
    checkCircularDependencies(roadmapData, result);
    checkMissingReferences(roadmapData, result);
  }

  // Calculate stats
  const stats = {
    totalTasks: countTasks(roadmapData),
    validationTimeMs: Date.now() - startTime
  };

  // Output results
  outputResult(result, jsonMode, stats);

  // Exit with appropriate code
  process.exit(result.valid ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, parseArgs, loadRoadmap, checkCircularDependencies, checkMissingReferences };
