#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'yaml';

const workspaceRoot = process.cwd();
const roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(roadmapPath)) {
    fail(`roadmap file missing at ${roadmapPath}`);
  }
  const content = fs.readFileSync(roadmapPath, 'utf8');
  const doc = yaml.parse(content);
  if (!doc || !Array.isArray(doc.epics)) {
    fail('roadmap.yaml malformed: missing epics array');
  }

  const requiredMilestones = new Map([
    ['M3.3', { touched: false, missing: true }],
    ['M3.4', { touched: false, missing: true }],
  ]);

  for (const epic of doc.epics) {
    if (epic?.id !== 'E3') continue;
    for (const milestone of epic.milestones ?? []) {
      const entry = requiredMilestones.get(milestone.id);
      if (!entry) continue;
      entry.missing = false;
      for (const task of milestone.tasks ?? []) {
        if (!task?.status) continue;
        if (task.status !== 'pending') {
          entry.touched = true;
        }
      }
    }
  }

  const missingMilestones = Array.from(requiredMilestones.entries())
    .filter(([, info]) => info.missing)
    .map(([id]) => id);
  if (missingMilestones.length) {
    fail(`Missing required product milestones: ${missingMilestones.join(', ')}`);
  }

  const untouched = Array.from(requiredMilestones.entries())
    .filter(([, info]) => !info.touched)
    .map(([id]) => id);
  if (untouched.length) {
    fail(`Product milestones lack progress: ${untouched.join(', ')} (all tasks still pending)`);
  }

  console.log('Product experience milestones present and in flight.');
}

main();
