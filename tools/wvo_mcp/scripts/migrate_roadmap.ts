#!/usr/bin/env node
/**
 * ROADMAP-STRUCT Phase 3: Roadmap Migration Script
 *
 * Migrates roadmap from v1 to v2 format:
 * - Adds schema_version: "2.0"
 * - Converts flat dependencies to typed
 * - Converts prose exit_criteria to objects
 * - Adds default metadata (complexity, effort, tools)
 *
 * Usage:
 *   npm run migrate:roadmap                    # Migrate state/roadmap.yaml
 *   npm run migrate:roadmap -- --dry-run       # Show changes without writing
 *   npm run migrate:roadmap -- --file path.yaml
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { validateRoadmap } from '../src/roadmap/validators.js';
import type { RoadmapSchema, TaskSchema } from '../src/roadmap/schemas.js';

interface MigrationOptions {
  file: string;
  backup: boolean;
  dryRun: boolean;
}

function parseArgs(args: string[]): MigrationOptions {
  const options: MigrationOptions = {
    file: 'state/roadmap.yaml',
    backup: true,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && i + 1 < args.length) {
      options.file = args[++i];
    } else if (arg === '--no-backup') {
      options.backup = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

/**
 * Migrate task from v1 to v2
 */
function migrateTask(task: any): TaskSchema {
  const migrated: any = { ...task };

  // Convert dependencies: [] → { depends_on: [] }
  if (Array.isArray(task.dependencies)) {
    migrated.dependencies = {
      depends_on: task.dependencies
    };
  }

  // Convert exit_criteria strings → { prose: "..." }
  if (Array.isArray(task.exit_criteria)) {
    migrated.exit_criteria = task.exit_criteria.map((criterion: any) => {
      if (typeof criterion === 'string') {
        return { prose: criterion };
      }
      // If it's an object but doesn't have valid fields, wrap as prose
      if (typeof criterion === 'object' && criterion !== null) {
        const hasValidField = 'test' in criterion || 'file' in criterion ||
                             'metric' in criterion || 'prose' in criterion;
        if (!hasValidField) {
          // Convert invalid object to prose (JSON stringify for context)
          return { prose: JSON.stringify(criterion) };
        }
      }
      return criterion; // Already a valid object
    });
  }

  // Map invalid statuses to valid ones
  if (task.status) {
    const statusMap: Record<string, string> = {
      'needs_improvement': 'needs_review',  // Map to closest valid status
      // Add more mappings as needed
    };
    if (statusMap[task.status]) {
      migrated.status = statusMap[task.status];
    }
  }

  // Map invalid domains to valid ones
  if (task.domain) {
    const domainMap: Record<string, string> = {
      'modeling': 'product',  // Modeling tasks are product work
      'research': 'product',  // Research is product work
      'infra': 'mcp',        // Infrastructure is MCP work
      // Add more mappings as needed
    };
    if (domainMap[task.domain]) {
      migrated.domain = domainMap[task.domain];
    }
  }

  // Add default metadata if missing
  if (migrated.complexity_score === undefined) {
    migrated.complexity_score = 5; // Default: sonnet tier
  }
  if (migrated.effort_hours === undefined) {
    migrated.effort_hours = 2; // Default: 2 hours
  }
  if (migrated.required_tools === undefined) {
    migrated.required_tools = []; // Default: no tools
  }

  return migrated as TaskSchema;
}

/**
 * Migrate milestone from v1 to v2
 */
function migrateMilestone(milestone: any): any {
  return {
    ...milestone,
    tasks: milestone.tasks.map(migrateTask)
  };
}

/**
 * Migrate epic from v1 to v2
 */
function migrateEpic(epic: any): any {
  const migrated = {
    ...epic,
    milestones: epic.milestones.map(migrateMilestone)
  };

  // Map invalid domains at epic level
  if (migrated.domain) {
    const domainMap: Record<string, string> = {
      'modeling': 'product',
      'research': 'product',
      'infra': 'mcp',
    };
    if (domainMap[migrated.domain]) {
      migrated.domain = domainMap[migrated.domain];
    }
  }

  return migrated;
}

/**
 * Migrate roadmap from v1 to v2
 */
function migrateRoadmap(v1: any): RoadmapSchema {
  // Check if already v2
  if (v1.schema_version === '2.0') {
    console.log('⚠️  Roadmap is already v2.0 format');
    return v1 as RoadmapSchema;
  }

  // Transform to v2
  const v2: RoadmapSchema = {
    schema_version: '2.0',
    epics: v1.epics.map(migrateEpic),
    last_updated: new Date().toISOString(),
    updated_by: 'migrate_roadmap.ts'
  };

  return v2;
}

/**
 * Count tasks in roadmap
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
 * Main migration function
 */
function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.isAbsolute(options.file)
    ? options.file
    : path.join(process.cwd(), options.file);

  console.log('🔄 ROADMAP-STRUCT Migration v1 → v2\n');
  console.log(`Input: ${filePath}`);
  console.log(`Dry run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`Backup: ${options.backup ? 'YES' : 'NO'}\n`);

  // 1. Load v1 roadmap
  console.log('📖 Loading v1 roadmap...');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: File not found: ${filePath}`);
    process.exit(1);
  }

  let v1: any;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    v1 = yaml.load(content);
  } catch (error: any) {
    console.error(`❌ Error loading YAML: ${error.message}`);
    process.exit(1);
  }

  const taskCountBefore = countTasks(v1);
  console.log(`   Tasks: ${taskCountBefore}`);

  // 2. Create backup
  if (options.backup && !options.dryRun) {
    const backupPath = `${filePath}.v1.backup.yaml`;
    console.log(`\n💾 Creating backup: ${backupPath}`);
    fs.writeFileSync(backupPath, yaml.dump(v1));
    console.log('   ✅ Backup created');
  }

  // 3. Migrate to v2
  console.log('\n🔧 Migrating to v2...');
  const v2 = migrateRoadmap(v1);
  const taskCountAfter = countTasks(v2);
  console.log(`   Tasks: ${taskCountAfter}`);

  if (taskCountBefore !== taskCountAfter) {
    console.error(`❌ Error: Task count mismatch! Before: ${taskCountBefore}, After: ${taskCountAfter}`);
    process.exit(1);
  }

  // 4. Validate v2
  console.log('\n✅ Validating v2 roadmap...');
  const result = validateRoadmap(v2);

  if (!result.valid) {
    console.error(`❌ Migration produced invalid roadmap!`);
    console.error(`   Errors: ${result.errors.length}`);
    result.errors.slice(0, 10).forEach(err => {
      console.error(`   - [${err.code}] ${err.path}: ${err.message}`);
    });
    if (result.errors.length > 10) {
      console.error(`   ... and ${result.errors.length - 10} more errors`);
    }
    process.exit(1);
  }

  console.log('   ✅ Validation passed');
  console.log(`   Errors: ${result.errors.length}`);
  console.log(`   Warnings: ${result.warnings.length}`);

  // 5. Write v2 (or show dry-run)
  if (options.dryRun) {
    console.log('\n📄 Dry run output (first 100 lines):');
    console.log('─'.repeat(60));
    const output = yaml.dump(v2);
    const lines = output.split('\n').slice(0, 100);
    console.log(lines.join('\n'));
    console.log('─'.repeat(60));
    console.log('\n⚠️  Dry run mode - no changes written');
  } else {
    console.log(`\n💾 Writing v2 roadmap to: ${filePath}`);
    fs.writeFileSync(filePath, yaml.dump(v2, { lineWidth: 120 }));
    console.log('   ✅ Migration complete');
  }

  // 6. Summary
  console.log('\n📊 Migration Summary:');
  console.log(`   Schema version: 2.0`);
  console.log(`   Total tasks: ${taskCountAfter}`);
  console.log(`   Validation errors: ${result.errors.length}`);
  console.log(`   Validation warnings: ${result.warnings.length}`);

  if (!options.dryRun) {
    console.log('\n✅ Success! Roadmap migrated to v2.0 format');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run validate:roadmap');
    console.log('  2. Review: git diff state/roadmap.yaml');
    console.log(`  3. Rollback if needed: cp ${filePath}.v1.backup.yaml ${filePath}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { migrateTask, migrateMilestone, migrateEpic, migrateRoadmap };
