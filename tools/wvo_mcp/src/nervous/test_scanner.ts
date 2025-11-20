#!/usr/bin/env node
/**
 * Direct tests for SignalScanner (Nervous System)
 * Tests the ability to find @TAG signals in code using ripgrep
 */

import { SignalScanner } from './scanner.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function test_scanner_finds_critical() {
    // Setup: Create temp directory with CRITICAL signal
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
    const testFile = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(testFile, '// @CRITICAL: Fix memory leak in loop\n');

    try {
        // Execute
        const scanner = new SignalScanner(tmpDir);
        const result = await scanner.scan();

        // Assert
        if (result.signals.length !== 1) {
            throw new Error(`Expected 1 signal, got ${result.signals.length}`);
        }
        if (result.signals[0].type !== 'CRITICAL') {
            throw new Error(`Expected type CRITICAL, got ${result.signals[0].type}`);
        }
        if (!result.signals[0].message.includes('Fix memory leak')) {
            throw new Error('Message mismatch');
        }
        // ripgrep returns relative paths with "./" prefix
        const expectedFile = ['test.ts', './test.ts'];
        if (!expectedFile.includes(result.signals[0].file)) {
            throw new Error(`Expected file test.ts or ./test.ts, got ${result.signals[0].file}`);
        }

        console.log('✅ test_scanner_finds_critical PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function test_scanner_ignores_normal_comments() {
    // Setup: Create temp directory with normal comment (no @TAG)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
    const testFile = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(testFile, '// Just a regular comment\n// Another comment\n');

    try {
        // Execute
        const scanner = new SignalScanner(tmpDir);
        const result = await scanner.scan();

        // Assert: Should find zero signals
        if (result.signals.length !== 0) {
            throw new Error(`Expected 0 signals, got ${result.signals.length}`);
        }

        console.log('✅ test_scanner_ignores_normal_comments PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function test_scanner_handles_missing_directory() {
    // Setup: Use a non-existent directory path
    const tmpDir = path.join(os.tmpdir(), 'nonexistent-' + Date.now());

    // Execute: Scanner should not crash
    const scanner = new SignalScanner(tmpDir);
    const result = await scanner.scan();

    // Assert: Should return empty signals (graceful degradation)
    if (result.signals.length !== 0) {
        throw new Error(`Expected 0 signals from missing dir, got ${result.signals.length}`);
    }

    console.log('✅ test_scanner_handles_missing_directory PASSED');
}

async function test_scanner_handles_empty_input() {
    // Setup: Create temp directory with NO files
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));

    try {
        // Execute
        const scanner = new SignalScanner(tmpDir);
        const result = await scanner.scan();

        // Assert: Should return empty signals
        if (result.signals.length !== 0) {
            throw new Error(`Expected 0 signals from empty dir, got ${result.signals.length}`);
        }
        if (!result.lastScan || result.lastScan <= 0) {
            throw new Error('lastScan timestamp should be set');
        }

        console.log('✅ test_scanner_handles_empty_input PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function test_scanner_finds_multiple_signal_types() {
    // Setup: Create temp directory with multiple @TAG types
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
    const testFile = path.join(tmpDir, 'multi.ts');
    fs.writeFileSync(testFile, `
// @CRITICAL: Security vulnerability
// @NEEDS_REVIEW: Complex logic here
// @TODO: Refactor this
// @UNCERTAIN: Not sure about this approach
// @DECAY: Technical debt accumulating
`);

    try {
        // Execute
        const scanner = new SignalScanner(tmpDir);
        const result = await scanner.scan();

        // Assert: Should find all 5 signals
        if (result.signals.length !== 5) {
            throw new Error(`Expected 5 signals, got ${result.signals.length}`);
        }

        const types = result.signals.map(s => s.type).sort();
        const expected = ['CRITICAL', 'DECAY', 'NEEDS_REVIEW', 'TODO', 'UNCERTAIN'].sort();
        if (JSON.stringify(types) !== JSON.stringify(expected)) {
            throw new Error(`Expected types ${expected}, got ${types}`);
        }

        console.log('✅ test_scanner_finds_multiple_signal_types PASSED');
    } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function main() {
    console.log('\n🧪 Running SignalScanner Tests...\n');

    try {
        await test_scanner_finds_critical();
        await test_scanner_ignores_normal_comments();
        await test_scanner_handles_missing_directory();
        await test_scanner_handles_empty_input();
        await test_scanner_finds_multiple_signal_types();

        console.log('\n✅ All SignalScanner tests PASSED\n');
        process.exit(0);
    } catch (e) {
        console.error('\n❌ TEST FAILED:', e);
        console.error((e as Error).stack);
        process.exit(1);
    }
}

main();
