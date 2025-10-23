#!/usr/bin/env node
/**
 * Dependency Sync Diagnostic Tool
 *
 * Compares dependencies in roadmap.yaml metadata vs task_dependencies table
 * to identify sync issues and missing dependencies.
 *
 * Usage: node scripts/diagnose_dependency_sync.mjs
 */

import Database from 'better-sqlite3';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DB_PATH = path.join(ROOT, 'state/orchestrator.db');
const ROADMAP_PATH = path.join(ROOT, 'state/roadmap.yaml');

// Colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m'; // No Color

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Dependency Sync Diagnostic');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Check files exist
  if (!fs.existsSync(DB_PATH)) {
    console.error(`${RED}✗ Database not found:${NC} ${DB_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(ROADMAP_PATH)) {
    console.error(`${RED}✗ Roadmap not found:${NC} ${ROADMAP_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  const roadmapYaml = yaml.load(fs.readFileSync(ROADMAP_PATH, 'utf8'));

  // Extract dependencies from YAML
  const yamlDeps = new Map(); // taskId -> [dep1, dep2, ...]
  let totalYamlDeps = 0;

  for (const epic of roadmapYaml.epics || []) {
    for (const milestone of epic.milestones || []) {
      for (const task of milestone.tasks || []) {
        if (task.dependencies?.length) {
          yamlDeps.set(task.id, task.dependencies);
          totalYamlDeps += task.dependencies.length;
        }
      }
    }
  }

  // Extract dependencies from database table
  const tableDeps = new Map(); // taskId -> [dep1, dep2, ...]
  const rows = db.prepare('SELECT task_id, depends_on_task_id FROM task_dependencies').all();

  for (const row of rows) {
    if (!tableDeps.has(row.task_id)) {
      tableDeps.set(row.task_id, []);
    }
    tableDeps.get(row.task_id).push(row.depends_on_task_id);
  }

  // Extract dependencies from metadata JSON
  const metadataDeps = new Map(); // taskId -> [dep1, dep2, ...]
  const metadataRows = db.prepare('SELECT id, metadata FROM tasks WHERE metadata IS NOT NULL').all();

  for (const row of metadataRows) {
    try {
      const metadata = JSON.parse(row.metadata);
      if (metadata.dependencies?.length) {
        metadataDeps.set(row.id, metadata.dependencies);
      }
    } catch (error) {
      // Ignore invalid JSON
    }
  }

  // Summary statistics
  console.log(`${CYAN}Data Sources:${NC}`);
  console.log(`  YAML tasks with dependencies:     ${yamlDeps.size} tasks (${totalYamlDeps} dependencies)`);
  console.log(`  Metadata tasks with dependencies: ${metadataDeps.size} tasks`);
  console.log(`  Table tasks with dependencies:    ${tableDeps.size} tasks (${rows.length} dependencies)`);
  console.log('');

  // Calculate sync ratio
  const syncRatio = yamlDeps.size > 0 ? tableDeps.size / yamlDeps.size : 1.0;
  console.log(`${CYAN}Sync Ratio:${NC} ${syncRatio.toFixed(2)} (table / yaml)`);

  if (syncRatio >= 0.95) {
    console.log(`  ${GREEN}✓ Excellent sync${NC} (≥95%)`);
  } else if (syncRatio >= 0.8) {
    console.log(`  ${YELLOW}⚠ Good sync${NC} (≥80%), some missing`);
  } else if (syncRatio >= 0.5) {
    console.log(`  ${YELLOW}⚠ WARNING:${NC} Poor sync (${(syncRatio * 100).toFixed(0)}%)`);
  } else {
    console.log(`  ${RED}✗ CRITICAL:${NC} Very poor sync (${(syncRatio * 100).toFixed(0)}%)`);
  }
  console.log('');

  // Find missing dependencies
  const missing = [];
  for (const [taskId, deps] of yamlDeps) {
    const tableDepsForTask = tableDeps.get(taskId) || [];
    const missingDeps = deps.filter(d => !tableDepsForTask.includes(d));

    if (missingDeps.length > 0) {
      missing.push({ taskId, missing: missingDeps, expected: deps });
    }
  }

  if (missing.length === 0) {
    console.log(`${GREEN}✓ All YAML dependencies are synced to table${NC}`);
    console.log('');
    console.log('No action needed.');
    db.close();
    process.exit(0);
  }

  // Report missing dependencies
  console.log(`${RED}⚠️  ${missing.length} task(s) have missing dependencies:${NC}\n`);

  for (const { taskId, missing: missingDeps, expected } of missing) {
    const taskRow = db.prepare('SELECT title, status FROM tasks WHERE id = ?').get(taskId);
    console.log(`  ${YELLOW}${taskId}${NC}: ${taskRow?.title || 'Unknown task'}`);
    console.log(`    Status: ${taskRow?.status || 'unknown'}`);
    console.log(`    Expected dependencies: [${expected.join(', ')}]`);
    console.log(`    Missing from table: [${missingDeps.join(', ')}]`);

    for (const dep of missingDeps) {
      const depExists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(dep);
      if (depExists) {
        console.log(`      - ${dep} ${GREEN}✓ exists in tasks table${NC}`);
      } else {
        console.log(`      - ${dep} ${RED}✗ NOT FOUND in tasks table${NC} (foreign key will fail)`);
      }
    }
    console.log('');
  }

  // Additional diagnostics
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Additional Diagnostics');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Check for orphaned dependencies (in table but not in YAML)
  const orphaned = [];
  for (const [taskId, deps] of tableDeps) {
    const yamlDepsForTask = yamlDeps.get(taskId) || [];
    const extraDeps = deps.filter(d => !yamlDepsForTask.includes(d));

    if (extraDeps.length > 0) {
      orphaned.push({ taskId, extra: extraDeps });
    }
  }

  if (orphaned.length > 0) {
    console.log(`${YELLOW}⚠️  ${orphaned.length} task(s) have dependencies in table that are NOT in YAML:${NC}\n`);
    for (const { taskId, extra } of orphaned) {
      console.log(`  ${taskId}: [${extra.join(', ')}]`);
    }
    console.log('');
    console.log('These may be manually added or from old roadmap versions.');
    console.log('');
  }

  // Check for metadata vs table mismatch
  console.log(`${CYAN}Metadata vs Table Comparison:${NC}`);
  let metadataMismatches = 0;

  for (const [taskId, metaDeps] of metadataDeps) {
    const tblDeps = tableDeps.get(taskId) || [];

    // Check if metadata deps match table deps
    const metaDepsSet = new Set(metaDeps);
    const tblDepsSet = new Set(tblDeps);

    if (metaDepsSet.size !== tblDepsSet.size ||
        [...metaDepsSet].some(d => !tblDepsSet.has(d))) {
      metadataMismatches++;
      if (metadataMismatches <= 5) { // Only show first 5
        console.log(`  ${taskId}:`);
        console.log(`    Metadata: [${metaDeps.join(', ')}]`);
        console.log(`    Table:    [${tblDeps.join(', ')}]`);
      }
    }
  }

  if (metadataMismatches > 0) {
    console.log(`  ${YELLOW}⚠️  ${metadataMismatches} task(s) have metadata/table mismatches${NC}`);
  } else {
    console.log(`  ${GREEN}✓ Metadata and table are in sync${NC}`);
  }

  console.log('');

  // Recommendations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Recommendations');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (missing.length > 0) {
    console.log(`${YELLOW}Action Required:${NC}`);
    console.log('');
    console.log('1. Force roadmap resync:');
    console.log('   node scripts/force_roadmap_sync.mjs');
    console.log('');
    console.log('2. If issues persist, check for:');
    console.log('   - Foreign key constraint failures (missing referenced tasks)');
    console.log('   - Database readonly mode during sync');
    console.log('   - Circular dependencies (logged as warnings)');
    console.log('');
    console.log('3. Review logs for warnings:');
    console.log('   grep "dependency" /tmp/wvo_autopilot.log');
    console.log('');
  }

  db.close();
  process.exit(missing.length > 0 ? 1 : 0);
}

main();
