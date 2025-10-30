#!/usr/bin/env node
/**
 * Demo: Phase Budget System
 *
 * Demonstrates budget calculation, tracking, and reporting.
 */

import {calculateTaskBudgets, formatBudgetBreakdown} from '../src/context/phase_budget_calculator.js';
import {phaseBudgetTracker} from '../src/context/phase_budget_tracker.js';
import {generateBudgetReport} from '../src/quality/budget_report_generator.js';

console.log('=== Phase Budget System Demo ===\n');

// 1. Calculate budgets for a task
console.log('1. Calculating budgets for DEMO-TASK (Large complexity, High importance):\n');

const budgets = calculateTaskBudgets('Large', 'high');

console.log(formatBudgetBreakdown(budgets));
console.log('');

// 2. Simulate phase execution with tracking
console.log('2. Simulating THINK phase execution:\n');

const thinkBudget = budgets.phases.get('THINK')!;
console.log(`THINK phase budget: ${thinkBudget.token_limit} tokens, ${Math.round(thinkBudget.latency_limit_ms / 1000)}s`);

phaseBudgetTracker.startPhaseTracking('DEMO-TASK', 'THINK', thinkBudget);

// Simulate LLM calls
console.log('Simulating LLM call 1: 2000 tokens...');
phaseBudgetTracker.reportTokenUsage(2000);

setTimeout(() => {
  console.log('Simulating LLM call 2: 3500 tokens...');
  phaseBudgetTracker.reportTokenUsage(3500);

  setTimeout(() => {
    console.log('Simulating LLM call 3: 1800 tokens...');
    phaseBudgetTracker.reportTokenUsage(1800);

    // End phase tracking
    const execution = phaseBudgetTracker.endPhaseTracking(false);

    console.log('');
    console.log('THINK phase complete:');
    console.log(`- Tokens used: ${execution.tokens_used} / ${execution.tokens_limit} (${Math.round((execution.tokens_used / execution.tokens_limit) * 100)}%)`);
    console.log(`- Latency: ${execution.latency_ms}ms / ${execution.latency_limit_ms}ms`);
    console.log(`- Status: ${execution.breach_status}`);
    console.log('');

    // 3. Simulate IMPLEMENT phase
    console.log('3. Simulating IMPLEMENT phase execution:\n');

    const implementBudget = budgets.phases.get('IMPLEMENT')!;
    phaseBudgetTracker.startPhaseTracking('DEMO-TASK', 'IMPLEMENT', implementBudget);
    phaseBudgetTracker.reportTokenUsage(4500);

    const implExecution = phaseBudgetTracker.endPhaseTracking(false);
    console.log(`IMPLEMENT phase complete: ${implExecution.tokens_used} tokens (${implExecution.breach_status})`);
    console.log('');

    // 4. Generate budget report
    console.log('4. Generating budget report:\n');

    const status = phaseBudgetTracker.getTaskBudgetStatus('DEMO-TASK')!;
    const report = generateBudgetReport(status);

    console.log(report);

    console.log('');
    console.log('=== Demo Complete ===');
    console.log('');
    console.log('Key features demonstrated:');
    console.log('- Dynamic budget calculation (complexity × importance × phase weight)');
    console.log('- Phase-level token tracking');
    console.log('- Breach status detection (within/warning/exceeded)');
    console.log('- Budget report generation');
  }, 100);
}, 100);
