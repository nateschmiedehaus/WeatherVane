#!/usr/bin/env node
/**
 * Direct tests for DSPyOptimizer (Brain)
 * Tests the ability to compile prompts and record traces for evolutionary learning
 */

import { DSPyOptimizer } from './optimizer.js';
import { PromptSignature, Trace } from './types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function test_optimizer_registers_signature() {
    // Setup: Create temp workspace
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-test-'));

    try {
        const optimizer = new DSPyOptimizer(tmpDir);

        // Execute: Register a new prompt signature
        const signature: PromptSignature = {
            id: 'test-sig-1',
            inputs: ['documentPath'],
            outputs: ['score', 'feedback'],
            baseInstruction: 'Review the strategy document for quality',
            demos: []
        };

        optimizer.registerSignature(signature);

        // Assert: State file should exist
        const statePath = path.join(tmpDir, 'state', 'prompts', 'optimizers.json');
        if (!fs.existsSync(statePath)) {
            throw new Error('Optimizer state file not created');
        }

        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        if (!state.signatures['test-sig-1']) {
            throw new Error('Signature not registered in state');
        }

        console.log('✅ test_optimizer_registers_signature PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

function test_optimizer_compiles_prompt_without_demos() {
    // Setup: Create temp workspace
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-test-'));

    try {
        const optimizer = new DSPyOptimizer(tmpDir);

        // Execute: Register and compile signature with no demos
        const signature: PromptSignature = {
            id: 'test-sig-2',
            inputs: ['code'],
            outputs: ['hasBugs'],
            baseInstruction: 'Analyze the code for bugs',
            demos: []
        };

        optimizer.registerSignature(signature);
        const compiled = optimizer.compile('test-sig-2');

        // Assert: Should return base instruction (no examples)
        if (!compiled.includes('Analyze the code for bugs')) {
            throw new Error('Compiled prompt missing base instruction');
        }
        if (compiled.includes('EXAMPLES')) {
            throw new Error('Compiled prompt should not have EXAMPLES section when demos empty');
        }

        console.log('✅ test_optimizer_compiles_prompt_without_demos PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

function test_optimizer_compiles_prompt_with_demos() {
    // Setup: Create temp workspace
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-test-'));

    try {
        const optimizer = new DSPyOptimizer(tmpDir);

        // Execute: Register signature with demos
        const signature: PromptSignature = {
            id: 'test-sig-3',
            inputs: ['text'],
            outputs: ['sentiment'],
            baseInstruction: 'Classify sentiment',
            demos: [
                {
                    inputs: { text: 'I love this!' },
                    outputs: { sentiment: 'positive' },
                    score: 0.95,
                    timestamp: Date.now()
                },
                {
                    inputs: { text: 'This is terrible' },
                    outputs: { sentiment: 'negative' },
                    score: 0.90,
                    timestamp: Date.now()
                }
            ]
        };

        optimizer.registerSignature(signature);
        const compiled = optimizer.compile('test-sig-3');

        // Assert: Should include examples section
        if (!compiled.includes('EXAMPLES')) {
            throw new Error('Compiled prompt missing EXAMPLES section');
        }
        if (!compiled.includes('I love this!')) {
            throw new Error('Compiled prompt missing demo input');
        }
        if (!compiled.includes('positive')) {
            throw new Error('Compiled prompt missing demo output');
        }

        console.log('✅ test_optimizer_compiles_prompt_with_demos PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

function test_optimizer_records_trace() {
    // Setup: Create temp workspace
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-test-'));

    try {
        const optimizer = new DSPyOptimizer(tmpDir);

        // Execute: Register signature and record successful trace
        const signature: PromptSignature = {
            id: 'test-sig-4',
            inputs: [],
            outputs: [],
            baseInstruction: 'Test instruction',
            demos: []
        };

        optimizer.registerSignature(signature);

        const trace: Trace = {
            inputs: { x: '10' },
            outputs: { y: '20' },
            score: 0.85, // High score (>= 0.8) should be recorded
            timestamp: Date.now()
        };

        optimizer.recordTrace('test-sig-4', trace);

        // Assert: Trace should be added to demos
        const statePath = path.join(tmpDir, 'state', 'prompts', 'optimizers.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

        if (state.signatures['test-sig-4'].demos.length !== 1) {
            throw new Error(`Expected 1 demo, got ${state.signatures['test-sig-4'].demos.length}`);
        }
        if (state.signatures['test-sig-4'].demos[0].score !== 0.85) {
            throw new Error('Demo score mismatch');
        }

        console.log('✅ test_optimizer_records_trace PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

function test_optimizer_ignores_low_score_traces() {
    // Setup: Create temp workspace
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-test-'));

    try {
        const optimizer = new DSPyOptimizer(tmpDir);

        // Execute: Register signature and record low-score trace
        const signature: PromptSignature = {
            id: 'test-sig-5',
            inputs: [],
            outputs: [],
            baseInstruction: 'Test instruction',
            demos: []
        };

        optimizer.registerSignature(signature);

        const lowScoreTrace: Trace = {
            inputs: { x: '10' },
            outputs: { y: '20' },
            score: 0.5, // Low score (< 0.8) should NOT be recorded
            timestamp: Date.now()
        };

        optimizer.recordTrace('test-sig-5', lowScoreTrace);

        // Assert: Trace should NOT be added (score too low)
        const statePath = path.join(tmpDir, 'state', 'prompts', 'optimizers.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

        if (state.signatures['test-sig-5'].demos.length !== 0) {
            throw new Error(`Expected 0 demos (low score), got ${state.signatures['test-sig-5'].demos.length}`);
        }

        console.log('✅ test_optimizer_ignores_low_score_traces PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

function test_optimizer_handles_missing_signature() {
    // Setup: Create temp workspace
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-test-'));

    try {
        const optimizer = new DSPyOptimizer(tmpDir);

        // Execute: Try to compile non-existent signature
        let threw = false;
        try {
            optimizer.compile('nonexistent-sig');
        } catch (e) {
            threw = true;
            if (!(e as Error).message.includes('not found')) {
                throw new Error('Expected "not found" error message');
            }
        }

        // Assert: Should throw error
        if (!threw) {
            throw new Error('Expected compile to throw for missing signature');
        }

        console.log('✅ test_optimizer_handles_missing_signature PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function main() {
    console.log('\n🧠 Running DSPyOptimizer (Brain) Tests...\n');

    try {
        test_optimizer_registers_signature();
        test_optimizer_compiles_prompt_without_demos();
        test_optimizer_compiles_prompt_with_demos();
        test_optimizer_records_trace();
        test_optimizer_ignores_low_score_traces();
        test_optimizer_handles_missing_signature();

        console.log('\n✅ All DSPyOptimizer tests PASSED\n');
        process.exit(0);
    } catch (e) {
        console.error('\n❌ TEST FAILED:', e);
        console.error((e as Error).stack);
        process.exit(1);
    }
}

main();
