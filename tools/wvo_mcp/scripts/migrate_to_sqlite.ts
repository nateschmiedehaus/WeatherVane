#!/usr/bin/env ts-node
/**
 * Migrate roadmap from YAML to SQLite
 *
 * Usage:
 *   ts-node scripts/migrate_to_sqlite.ts [--workspace /path/to/WeatherVane]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { StateMachine, TaskType, TaskStatus } from '../src/orchestrator/state_machine.js';

interface YAMLTask {
  id: string;
  title: string;
  description?: string;
  type?: string;
  status?: string;
  epic_id?: string;
  parent_id?: string;
  depends_on?: string[];
  estimated_complexity?: number;
  metadata?: Record<string, unknown>;
}

interface YAMLRoadmap {
  epics?: YAMLTask[];
  stories?: YAMLTask[];
  tasks?: YAMLTask[];
  [key: string]: unknown;
}

async function migrate(workspaceRoot: string) {
  console.log('🔄 Starting migration from YAML to SQLite...\n');

  const roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');
  const dbPath = path.join(workspaceRoot, 'state', 'orchestrator.db');

  // Check if YAML exists
  try {
    await fs.access(roadmapPath);
  } catch {
    console.error(`❌ Roadmap not found at ${roadmapPath}`);
    console.error('   Make sure you run this from the workspace root');
    process.exit(1);
  }

  // Read YAML
  console.log(`📖 Reading ${roadmapPath}...`);
  const yamlContent = await fs.readFile(roadmapPath, 'utf-8');
  const roadmap: YAMLRoadmap = YAML.parse(yamlContent);

  // Initialize SQLite
  console.log(`💾 Initializing SQLite at ${dbPath}...`);
  const stateMachine = new StateMachine(workspaceRoot);

  // Collect all tasks
  const allTasks: YAMLTask[] = [
    ...(roadmap.epics || []),
    ...(roadmap.stories || []),
    ...(roadmap.tasks || [])
  ];

  console.log(`\n📊 Found ${allTasks.length} tasks to migrate\n`);

  let migrated = 0;
  let skipped = 0;
  const dependencies: Array<{ taskId: string; dependsOn: string[] }> = [];

  // First pass: Create all tasks
  for (const task of allTasks) {
    try {
      // Normalize type
      let taskType: TaskType = 'task';
      if (task.type === 'epic') taskType = 'epic';
      else if (task.type === 'story') taskType = 'story';
      else if (task.type === 'bug') taskType = 'bug';

      // Normalize status
      let taskStatus: TaskStatus = 'pending';
      if (task.status === 'done' || task.status === 'completed') taskStatus = 'done';
      else if (task.status === 'in_progress' || task.status === 'in-progress') taskStatus = 'in_progress';
      else if (task.status === 'blocked') taskStatus = 'blocked';
      else if (task.status === 'needs_review') taskStatus = 'needs_review';
      else if (task.status === 'needs_improvement') taskStatus = 'needs_improvement';

      // Check if already exists
      const existing = stateMachine.getTask(task.id);
      if (existing) {
        console.log(`⏭️  Skipping ${task.id} (already exists)`);
        skipped++;
        continue;
      }

      // Create task
      stateMachine.createTask({
        id: task.id,
        title: task.title,
        description: task.description,
        type: taskType,
        status: taskStatus,
        epic_id: task.epic_id,
        parent_id: task.parent_id,
        estimated_complexity: task.estimated_complexity,
        metadata: task.metadata
      });

      console.log(`✅ Migrated ${task.id}: ${task.title} (${taskType}, ${taskStatus})`);
      migrated++;

      // Store dependencies for second pass
      if (task.depends_on && task.depends_on.length > 0) {
        dependencies.push({
          taskId: task.id,
          dependsOn: task.depends_on
        });
      }
    } catch (error) {
      console.error(`❌ Failed to migrate task ${task.id}:`, error);
    }
  }

  // Second pass: Add dependencies
  console.log(`\n🔗 Adding dependencies...`);
  let depsAdded = 0;

  for (const { taskId, dependsOn } of dependencies) {
    for (const depId of dependsOn) {
      try {
        stateMachine.addDependency(taskId, depId, 'blocks');
        console.log(`   ${taskId} → depends on → ${depId}`);
        depsAdded++;
      } catch (error) {
        console.error(`   ❌ Failed to add dependency ${taskId} → ${depId}:`, error);
      }
    }
  }

  // Create initial context entries
  console.log(`\n📝 Creating initial context entries...`);

  stateMachine.addContextEntry({
    entry_type: 'decision',
    topic: 'Migration to SQLite',
    content: 'Migrated roadmap from YAML to SQLite for proper state management with ACID guarantees',
    confidence: 1.0
  });

  stateMachine.addContextEntry({
    entry_type: 'constraint',
    topic: 'State Management',
    content: 'All roadmap state now managed through StateMachine API - do not manually edit orchestrator.db'
  });

  // Create initial checkpoint
  console.log(`💾 Creating initial checkpoint...`);

  const health = stateMachine.getRoadmapHealth();
  stateMachine.createCheckpoint({
    session_id: 'migration_initial',
    state_snapshot: {
      migratedAt: new Date().toISOString(),
      totalTasks: migrated,
      skippedTasks: skipped,
      dependencies: depsAdded,
      roadmapHealth: health
    },
    notes: `Initial migration from YAML: ${migrated} tasks migrated, ${skipped} skipped, ${depsAdded} dependencies added`
  });

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✨ Migration Complete!`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Tasks migrated: ${migrated}`);
  console.log(`⏭️  Tasks skipped:  ${skipped}`);
  console.log(`🔗 Dependencies:   ${depsAdded}`);
  console.log(`\n📈 Roadmap Health:`);
  console.log(`   Total tasks:    ${health.totalTasks}`);
  console.log(`   Completed:      ${health.completedTasks} (${(health.completionRate * 100).toFixed(1)}%)`);
  console.log(`   In progress:    ${health.inProgressTasks}`);
  console.log(`   Pending:        ${health.pendingTasks}`);
  console.log(`   Blocked:        ${health.blockedTasks}`);
  console.log(`   Phase:          ${health.currentPhase}`);
  console.log(`\n💾 Database: ${dbPath}`);
  console.log(`\n✅ You can now delete state/roadmap.yaml (backed up recommended)\n`);

  stateMachine.close();
}

// Parse args
const args = process.argv.slice(2);
let workspaceRoot = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--workspace' && args[i + 1]) {
    workspaceRoot = args[i + 1];
    i++;
  }
}

// Run migration
migrate(workspaceRoot).catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
