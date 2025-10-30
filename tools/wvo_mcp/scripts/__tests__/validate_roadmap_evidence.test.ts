import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import {
  parseArgs,
  loadRoadmap,
  collectTasks,
  resolveEvidencePath,
  resolvePhases,
  validateEvidence,
  directoryHasArtifacts,
} from '../validate_roadmap_evidence.js';
import {
  WORK_PROCESS_PHASES,
  type RoadmapSchema,
  type TaskSchema,
  type WorkProcessPhase
} from '../../src/roadmap/schemas.js';

const DEFAULT_TASK: TaskSchema = {
  id: 'TEST-TASK',
  title: 'Example',
  status: 'done',
  evidence_path: 'state/evidence/TEST-TASK',
  work_process_phases: Array.from(WORK_PROCESS_PHASES) as WorkProcessPhase[],
};

describe('validate_roadmap_evidence CLI helpers', () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-evidence-'));
    process.chdir(tempDir);
    fs.mkdirSync('state', { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses CLI arguments', () => {
    const args = parseArgs(['--file', 'custom.yaml', '--json', '--all']);
    expect(args.file).toBe('custom.yaml');
    expect(args.json).toBe(true);
    expect(args.all).toBe(true);
  });

  it('loads roadmap document', () => {
    const roadmap: RoadmapSchema = {
      schema_version: '2.0',
      epics: [{
        id: 'E-1',
        title: 'Epic',
        domain: 'product',
        milestones: [{
          id: 'M-1',
          title: 'Milestone',
          tasks: [DEFAULT_TASK]
        }]
      }]
    };

    const roadmapPath = path.join('state', 'roadmap.yaml');
    fs.writeFileSync(roadmapPath, yaml.dump(roadmap));

    const loaded = loadRoadmap(roadmapPath);
    const tasks = collectTasks(loaded);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('TEST-TASK');
  });

  it('resolves default evidence path and phases when missing', () => {
    const task: TaskSchema = { id: 'NO-META', title: 'No Meta', status: 'pending' };
    expect(resolveEvidencePath(task)).toBe('state/evidence/NO-META');
    expect(resolvePhases(task)).toEqual(WORK_PROCESS_PHASES);
  });

  it('detects missing phase directory as error', () => {
    fs.mkdirSync('state/evidence/TEST-TASK', { recursive: true });
    const phases = Array.from(WORK_PROCESS_PHASES) as WorkProcessPhase[];
    const issues = validateEvidence(DEFAULT_TASK, phases, DEFAULT_TASK.evidence_path!, true);

    const missingPhases = issues.filter((issue) => issue.code === 'MISSING_EVIDENCE_PHASE');
    expect(missingPhases.length).toBeGreaterThan(0);
    expect(missingPhases[0]?.taskId).toBe('TEST-TASK');
  });

  it('accepts verify directory with artifacts', () => {
    const base = path.join('state', 'evidence', 'TEST-TASK');
    WORK_PROCESS_PHASES.forEach((phase) => {
      const phaseDir = path.join(base, phase);
      fs.mkdirSync(phaseDir, { recursive: true });
      if (phase === 'verify') {
        fs.writeFileSync(path.join(phaseDir, 'verification.md'), '# Verify evidence');
      }
    });

    const phases = Array.from(WORK_PROCESS_PHASES) as WorkProcessPhase[];
    const issues = validateEvidence(DEFAULT_TASK, phases, DEFAULT_TASK.evidence_path!, true);
    expect(issues).toHaveLength(0);
  });

  it('detects empty verify directory', () => {
    const base = path.join('state', 'evidence', 'TEST-TASK');
    WORK_PROCESS_PHASES.forEach((phase) => {
      fs.mkdirSync(path.join(base, phase), { recursive: true });
    });

    const phases = Array.from(WORK_PROCESS_PHASES) as WorkProcessPhase[];
    const issues = validateEvidence(DEFAULT_TASK, phases, DEFAULT_TASK.evidence_path!, true);

    const emptyVerify = issues.find((issue) => issue.code === 'EMPTY_VERIFY_EVIDENCE');
    expect(emptyVerify).toBeDefined();
  });

  it('directoryHasArtifacts returns false for empty directory', () => {
    const dir = path.join('state', 'evidence', 'empty');
    fs.mkdirSync(dir, { recursive: true });
    expect(directoryHasArtifacts(dir)).toBe(false);
    fs.writeFileSync(path.join(dir, 'note.md'), 'hello');
    expect(directoryHasArtifacts(dir)).toBe(true);
  });
});
