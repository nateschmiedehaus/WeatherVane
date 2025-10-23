/**
 * Test PoC Prioritization - Demonstrate Updated Lens Framework
 *
 * This script shows how the updated 12-lens framework now correctly prioritizes
 * PoC validation tasks over infrastructure work.
 */

import { SevenLensEvaluator } from './src/orchestrator/seven_lens_evaluator.js';

const evaluator = new SevenLensEvaluator();

console.log('━'.repeat(80));
console.log('🎯 Testing PoC Prioritization Framework');
console.log('━'.repeat(80));
console.log('');

// Test Task 1: PoC Validation (should score VERY HIGH)
const pocTask = {
  id: 'T-MLR-1.2',
  title: 'Generate 3 years of synthetic data for 20 diverse tenants',
  description: `Generate synthetic multi-tenant dataset with 3+ years of data per tenant.
    Include weather-sensitive tenants (rain gear, winter clothing) AND
    zero-sensitivity negative control tenants (electronics, books) with random data.
    This validates the model works when it should AND correctly identifies when it won't work.
    Output: storage/seeds/synthetic_v2/ with ~1.3M total rows.
    Success: Weather-sensitive tenants show correlation ≥0.70, random tenants show ~0.00`,
  status: 'pending',
  dependencies: [],
  exit_criteria: [
    '20 diverse tenants generated',
    '3+ years of data per tenant (~65K rows each)',
    'Weather-sensitive tenants: correlation ≥0.70',
    'Random control tenants: correlation ~0.00'
  ],
  estimated_hours: 12
};

const pocReport = evaluator.evaluateTask(pocTask);
console.log('Task 1: PoC Validation (Synthetic Data + Negative Controls)');
console.log(`Overall Pass: ${pocReport.overallPass ? '✅ YES' : '❌ NO'}`);
console.log(`Ready to Execute: ${pocReport.readyToExecute ? '✅ YES' : '❌ NO'}`);
console.log('');
console.log('Lens Scores:');
pocReport.lenses.forEach(lens => {
  const emoji = lens.passed ? '✅' : '❌';
  console.log(`  ${emoji} ${lens.lens}: ${lens.score}/100 - ${lens.reasoning}`);
  if (lens.concerns.length > 0) {
    lens.concerns.forEach(c => console.log(`     ⚠️  ${c}`));
  }
});
console.log('');
console.log(`Recommendation: ${pocReport.recommendation}`);
console.log('');
console.log('━'.repeat(80));
console.log('');

// Test Task 2: Infrastructure Work (should score LOW)
const infraTask = {
  id: 'T-INFRA-1',
  title: 'Implement database sharding for multi-tenant scalability',
  description: `Design and implement Postgres sharding strategy to scale beyond 100 tenants.
    Include connection pooling, tenant isolation, and migration strategy.
    This prepares us for production scale.`,
  status: 'pending',
  dependencies: [],
  exit_criteria: [
    'Sharding strategy documented',
    'Connection pooling implemented',
    'Migration path defined'
  ],
  estimated_hours: 20
};

const infraReport = evaluator.evaluateTask(infraTask);
console.log('Task 2: Infrastructure Work (Database Sharding)');
console.log(`Overall Pass: ${infraReport.overallPass ? '✅ YES' : '❌ NO'}`);
console.log(`Ready to Execute: ${infraReport.readyToExecute ? '✅ YES' : '❌ NO'}`);
console.log('');
console.log('Lens Scores:');
infraReport.lenses.forEach(lens => {
  const emoji = lens.passed ? '✅' : '❌';
  console.log(`  ${emoji} ${lens.lens}: ${lens.score}/100 - ${lens.reasoning}`);
  if (lens.concerns.length > 0) {
    lens.concerns.forEach(c => console.log(`     ⚠️  ${c}`));
  }
});
console.log('');
console.log(`Recommendation: ${infraReport.recommendation}`);
console.log('');
console.log('━'.repeat(80));
console.log('');

// Test Task 3: End-to-End Simulation (should score VERY HIGH)
const e2eTask = {
  id: 'T-E2E-1',
  title: 'Build end-to-end simulation: forecast ingestion → recommendations → automation demo',
  description: `Simulate the full customer experience for synthetic tenants:
    1. Ingest 7-day weather forecasts
    2. Generate ad spend recommendations based on trained MMM models
    3. Simulate automation (what would happen if customer enabled auto-adjust)
    4. Compare lift: weather-aware vs baseline for weather-sensitive and random tenants
    Success: Weather-sensitive tenants show 15-30% lift, random tenants show ~0% lift`,
  status: 'pending',
  dependencies: ['T-MLR-2.3', 'T-MLR-2.4'],
  exit_criteria: [
    'Forecast ingestion working',
    'Recommendation engine generates daily suggestions',
    'Automation simulation shows lift for sensitive tenants',
    'Negative control (random tenants) shows ~0% lift'
  ],
  estimated_hours: 16
};

const e2eReport = evaluator.evaluateTask(e2eTask);
console.log('Task 3: End-to-End Simulation (Full Product Experience)');
console.log(`Overall Pass: ${e2eReport.overallPass ? '✅ YES' : '❌ NO'}`);
console.log(`Ready to Execute: ${e2eReport.readyToExecute ? '✅ YES' : '❌ NO'}`);
console.log('');
console.log('Lens Scores:');
e2eReport.lenses.forEach(lens => {
  const emoji = lens.passed ? '✅' : '❌';
  console.log(`  ${emoji} ${lens.lens}: ${lens.score}/100 - ${lens.reasoning}`);
  if (lens.concerns.length > 0) {
    lens.concerns.forEach(c => console.log(`     ⚠️  ${c}`));
  }
});
console.log('');
console.log(`Recommendation: ${e2eReport.recommendation}`);
console.log('');
console.log('━'.repeat(80));
console.log('');

// Rank tasks
console.log('📊 Task Ranking (by 12-Lens Framework):');
console.log('');

const allTasks = [pocTask, infraTask, e2eTask];
const reports = evaluator.evaluateBatch(allTasks);

reports.forEach((report, index) => {
  const passCount = report.lenses.filter(l => l.passed).length;
  const avgScore = report.lenses.reduce((sum, l) => sum + l.score, 0) / report.lenses.length;
  console.log(`${index + 1}. ${report.taskId} - ${passCount}/12 lenses passed, avg score: ${avgScore.toFixed(1)}`);
});

console.log('');
console.log('━'.repeat(80));
console.log('');
console.log('✅ EXPECTED RESULTS:');
console.log('1. PoC tasks (synthetic data, e2e simulation) should rank HIGHEST');
console.log('2. Infrastructure tasks should rank LOWEST (wrong priority)');
console.log('3. CEO lens should heavily boost PoC validation tasks');
console.log('4. Academic lens should boost negative case testing');
console.log('');
console.log('See: docs/POC_OBJECTIVES_PRIORITY.md for full context');
console.log('━'.repeat(80));
