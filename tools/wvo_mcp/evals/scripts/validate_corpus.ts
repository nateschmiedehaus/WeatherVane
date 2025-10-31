#!/usr/bin/env ts-node
/**
 * Validate Golden Task Corpus Schema
 *
 * Checks:
 * 1. All tasks have required fields
 * 2. IDs are unique
 * 3. Phase distribution meets requirements (≥3 STRATEGIZE, ≥4 IMPLEMENT, etc.)
 * 4. pass_threshold ≤ criteria count
 * 5. All tasks parseable as JSON
 */

import * as fs from 'fs';
import * as path from 'path';

interface GoldenTask {
  id: string;
  phase: string;
  prompt: string;
  expected_output_criteria: string[];
  pass_threshold: number;
  complexity: 'low' | 'medium' | 'high';
  reasoning_required: boolean;
}

const REQUIRED_FIELDS = [
  'id',
  'phase',
  'prompt',
  'expected_output_criteria',
  'pass_threshold',
  'complexity',
  'reasoning_required'
];

const PHASE_REQUIREMENTS = {
  strategize: 3,
  spec: 3,
  plan: 3,
  think: 2,
  implement: 4,
  verify: 2,
  review: 2,
  pr: 1,
  monitor: 1
};

function validateCorpus(corpusPath: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file exists
  if (!fs.existsSync(corpusPath)) {
    errors.push(`Corpus file not found: ${corpusPath}`);
    return { valid: false, errors, warnings };
  }

  // Read and parse corpus
  const content = fs.readFileSync(corpusPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) {
    errors.push('Corpus is empty');
    return { valid: false, errors, warnings };
  }

  const tasks: GoldenTask[] = [];
  const ids = new Set<string>();
  const phaseCounts: Record<string, number> = {};

  // Parse each line
  lines.forEach((line, index) => {
    const lineNum = index + 1;

    if (!line.trim()) {
      warnings.push(`Line ${lineNum}: Empty line (skipping)`);
      return;
    }

    try {
      const task = JSON.parse(line) as GoldenTask;

      // Check required fields
      for (const field of REQUIRED_FIELDS) {
        if (!(field in task)) {
          errors.push(`Line ${lineNum} (${task.id || 'unknown'}): Missing required field '${field}'`);
        }
      }

      // Check ID uniqueness
      if (ids.has(task.id)) {
        errors.push(`Line ${lineNum}: Duplicate task ID '${task.id}'`);
      }
      ids.add(task.id);

      // Check pass_threshold <= criteria count
      if (task.expected_output_criteria && task.pass_threshold > task.expected_output_criteria.length) {
        errors.push(
          `Line ${lineNum} (${task.id}): pass_threshold (${task.pass_threshold}) > criteria count (${task.expected_output_criteria.length})`
        );
      }

      // Check criteria array is not empty
      if (task.expected_output_criteria && task.expected_output_criteria.length === 0) {
        errors.push(`Line ${lineNum} (${task.id}): expected_output_criteria is empty`);
      }

      // Check prompt is not empty
      if (task.prompt && task.prompt.trim().length === 0) {
        errors.push(`Line ${lineNum} (${task.id}): prompt is empty`);
      }

      // Count phases
      if (task.phase) {
        phaseCounts[task.phase] = (phaseCounts[task.phase] || 0) + 1;
      }

      tasks.push(task);
    } catch (err) {
      errors.push(`Line ${lineNum}: Failed to parse JSON - ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Check total task count
  if (tasks.length < 20) {
    errors.push(`Corpus has ${tasks.length} tasks, requires ≥20 (AC1 requirement)`);
  } else if (tasks.length > 40) {
    warnings.push(`Corpus has ${tasks.length} tasks, >40 may impact CI runtime (consider pruning)`);
  }

  // Check phase distribution
  for (const [phase, required] of Object.entries(PHASE_REQUIREMENTS)) {
    const count = phaseCounts[phase] || 0;
    if (count < required) {
      errors.push(`Phase '${phase}': ${count} tasks, requires ≥${required} (AC1 requirement)`);
    }
  }

  // Summary
  const valid = errors.length === 0;

  return { valid, errors, warnings };
}

function main() {
  const workspaceRoot = process.cwd();
  const corpusPath = path.join(workspaceRoot, 'tools/wvo_mcp/evals/prompts/golden/tasks.jsonl');

  console.log('Validating Golden Task Corpus...');
  console.log(`Corpus: ${corpusPath}\n`);

  const { valid, errors, warnings } = validateCorpus(corpusPath);

  // Print warnings
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }

  // Print errors
  if (errors.length > 0) {
    console.log('❌ Errors:');
    errors.forEach(e => console.log(`   ${e}`));
    console.log('');
  }

  // Print summary
  if (valid) {
    console.log('✅ Corpus validation PASSED');
    console.log(`   Total tasks: ${fs.readFileSync(corpusPath, 'utf-8').trim().split('\n').length}`);

    // Read actual phase counts
    const content = fs.readFileSync(corpusPath, 'utf-8');
    const tasks = content.trim().split('\n').map(line => JSON.parse(line));
    const phaseCounts: Record<string, number> = {};
    tasks.forEach(task => {
      phaseCounts[task.phase] = (phaseCounts[task.phase] || 0) + 1;
    });

    console.log('\n   Phase distribution:');
    Object.entries(phaseCounts).sort().forEach(([phase, count]) => {
      const required = PHASE_REQUIREMENTS[phase] || 0;
      const status = count >= required ? '✅' : '❌';
      console.log(`   ${status} ${phase}: ${count} tasks (requires ≥${required})`);
    });

    process.exit(0);
  } else {
    console.log('❌ Corpus validation FAILED');
    console.log(`   ${errors.length} error(s) found`);
    process.exit(1);
  }
}

main();
