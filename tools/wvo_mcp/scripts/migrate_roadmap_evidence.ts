#!/usr/bin/env node
/**
 * ROADMAP-STRUCT — Evidence Metadata Migration
 *
 * Populates roadmap v2 tasks with evidence_path + work_process_phases defaults.
 *
 * Usage:
 *   npm run migrate:roadmap-evidence
 *   npm run migrate:roadmap-evidence -- --dry-run
 *   npm run migrate:roadmap-evidence -- --file path/to/roadmap.yaml
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { WORK_PROCESS_PHASES, type RoadmapSchema, type TaskSchema } from '../src/roadmap/schemas.js';

interface MigrationOptions {
  file: string;
  dryRun: boolean;
  backup: boolean;
}

function parseArgs(argv: string[]): MigrationOptions {
  const options: MigrationOptions = {
    file: 'state/roadmap.yaml',
    dryRun: false,
    backup: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--file' && i + 1 < argv.length) {
      options.file = argv[++i];
    } else if (token === '--dry-run') {
      options.dryRun = true;
    } else if (token === '--no-backup') {
      options.backup = false;
    }
  }

  return options;
}

function loadRoadmap(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Roadmap file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

function resolveEvidenceRootBase(): string {
  const candidates = [
    path.join(process.cwd(), 'state', 'evidence'),
    path.join(process.cwd(), '..', 'state', 'evidence'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function directoryHasArtifacts(dirPath: string): boolean {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return false;
  }
  return fs.readdirSync(dirPath).length > 0;
}

function ensureEvidenceMetadata(task: TaskSchema, evidenceRootBase: string): { changed: boolean } {
  let changed = false;

  if (!task.evidence_path) {
    task.evidence_path = `state/evidence/${task.id}`;
    changed = true;
  }

  if (!Array.isArray(task.work_process_phases) || task.work_process_phases.length === 0) {
    task.work_process_phases = [...WORK_PROCESS_PHASES];
    changed = true;
  }

  const evidenceRelative = task.evidence_path ?? `state/evidence/${task.id}`;
  const evidenceAbsolute = path.join(evidenceRootBase, task.id);
  const phases = task.work_process_phases ?? [...WORK_PROCESS_PHASES];

  const hasAllPhaseDirs = phases.every((phase) => {
    const expected = path.join(evidenceAbsolute, phase);
    return fs.existsSync(expected);
  });

  const verifyDir = path.join(evidenceAbsolute, 'verify');
  const hasVerifyArtifacts = directoryHasArtifacts(verifyDir);

  const desiredEnforcement = hasAllPhaseDirs && hasVerifyArtifacts ? 'enforce' : 'warn';

  if (task.evidence_enforcement !== desiredEnforcement) {
    task.evidence_enforcement = desiredEnforcement;
    changed = true;
  }

  return { changed };
}

function migrateRoadmapEvidence(roadmap: any): { roadmap: RoadmapSchema; tasksUpdated: number } {
  if (!roadmap || roadmap.schema_version !== '2.0') {
    throw new Error('Evidence migration requires schema_version "2.0"');
  }

  let tasksUpdated = 0;
  const evidenceRootBase = resolveEvidenceRootBase();

  for (const epic of roadmap.epics ?? []) {
    for (const milestone of epic.milestones ?? []) {
      for (const task of milestone.tasks ?? []) {
        const { changed } = ensureEvidenceMetadata(task, evidenceRootBase);
        if (changed) {
          tasksUpdated += 1;
        }
      }
    }
  }

  roadmap.last_updated = new Date().toISOString();
  roadmap.updated_by = 'migrate_roadmap_evidence.ts';

  return { roadmap, tasksUpdated };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.isAbsolute(options.file)
    ? options.file
    : path.join(process.cwd(), options.file);

  console.log('🔄 ROADMAP-STRUCT Evidence Migration');
  console.log(`Roadmap file: ${filePath}`);
  console.log(`Dry run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`Backup: ${options.backup ? 'YES' : 'NO'}`);
  console.log('');

  let roadmap = loadRoadmap(filePath);

  if (options.backup && !options.dryRun) {
    const backupPath = `${filePath}.evidence.backup.yaml`;
    fs.writeFileSync(backupPath, yaml.dump(roadmap, { lineWidth: 120 }));
    console.log(`💾 Backup written: ${backupPath}`);
  }

  const { roadmap: migrated, tasksUpdated } = migrateRoadmapEvidence(roadmap);
  console.log(`✅ Tasks updated: ${tasksUpdated}`);

  if (options.dryRun) {
    console.log('\n📄 Dry run output (first 60 lines):');
    console.log('─'.repeat(60));
    const preview = yaml.dump(migrated, { lineWidth: 120 }).split('\n').slice(0, 60).join('\n');
    console.log(preview);
    console.log('─'.repeat(60));
    console.log('\n⚠️  Dry run mode — no changes written.');
  } else {
    fs.writeFileSync(filePath, yaml.dump(migrated, { lineWidth: 120 }));
    console.log(`\n💾 Wrote migrated roadmap to ${filePath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  main,
  parseArgs,
  migrateRoadmapEvidence,
  ensureEvidenceMetadata,
};
