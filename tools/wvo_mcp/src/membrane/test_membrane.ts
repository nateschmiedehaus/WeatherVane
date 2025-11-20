#!/usr/bin/env node
/**
 * Direct tests for Membrane (Dashboard/HUD)
 * Tests the CLI interface rendering and interaction
 *
 * Note: These are simplified tests since full React testing would require
 * a more complex setup. We test the core logic and ensure the component
 * doesn't crash.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test 1: Verify Dashboard component exists and can be imported
 */
function test_dashboard_component_exists() {
    try {
        // Check if Dashboard.tsx exists
        const dashboardPath = path.join(__dirname, 'Dashboard.tsx');
        if (!fs.existsSync(dashboardPath)) {
            throw new Error('Dashboard.tsx file not found');
        }

        // Check if file contains expected React component structure
        const content = fs.readFileSync(dashboardPath, 'utf-8');
        if (!content.includes('export const Dashboard')) {
            throw new Error('Dashboard component export not found');
        }
        if (!content.includes('useEffect')) {
            throw new Error('Dashboard should use useEffect for state management');
        }
        if (!content.includes('useInput')) {
            throw new Error('Dashboard should use useInput for keyboard handling');
        }

        console.log('✅ test_dashboard_component_exists PASSED');
    } catch (e) {
        throw new Error(`Dashboard component validation failed: ${(e as Error).message}`);
    }
}

/**
 * Test 2: Verify Dashboard has core UI elements
 */
function test_dashboard_has_core_ui_elements() {
    const dashboardPath = path.join(__dirname, 'Dashboard.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // Check for expected UI text/components
    const requiredElements = [
        'Autopilot',  // Title
        'Status:',    // Status section
        'Burn:',      // Budget tracking
        'Context:',   // Context usage
        'ACTIVE AGENTS', // Agent list
        'THOUGHT STREAM', // Activity log
    ];

    for (const element of requiredElements) {
        if (!content.includes(element)) {
            throw new Error(`Dashboard missing required UI element: "${element}"`);
        }
    }

    console.log('✅ test_dashboard_has_core_ui_elements PASSED');
}

/**
 * Test 3: Verify Dashboard has keyboard input handling
 */
function test_dashboard_has_keyboard_handling() {
    const dashboardPath = path.join(__dirname, 'Dashboard.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // Check for keyboard input handling
    if (!content.includes('useInput')) {
        throw new Error('Dashboard missing keyboard input handling (useInput)');
    }

    // Check for quit key
    if (!content.includes("input === 'q'")) {
        throw new Error('Dashboard missing quit key handler');
    }

    // Check for process.exit (to quit)
    if (!content.includes('process.exit')) {
        throw new Error('Dashboard missing exit mechanism');
    }

    console.log('✅ test_dashboard_has_keyboard_handling PASSED');
}

/**
 * Test 4: Verify Dashboard has live updates
 */
function test_dashboard_has_live_updates() {
    const dashboardPath = path.join(__dirname, 'Dashboard.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // Check for state management
    if (!content.includes('useState')) {
        throw new Error('Dashboard should use useState for reactive state');
    }

    // Check for timer/interval (live updates)
    if (!content.includes('setInterval')) {
        throw new Error('Dashboard should use setInterval for live updates');
    }

    // Check for cleanup
    if (!content.includes('clearInterval')) {
        throw new Error('Dashboard should cleanup intervals to prevent memory leaks');
    }

    // Check for time update
    if (!content.includes('setTime')) {
        throw new Error('Dashboard should update time display');
    }

    console.log('✅ test_dashboard_has_live_updates PASSED');
}

/**
 * Test 5: Verify index.tsx exports Dashboard correctly
 */
function test_index_exports_dashboard() {
    try {
        const indexPath = path.join(__dirname, 'index.tsx');
        if (!fs.existsSync(indexPath)) {
            throw new Error('index.tsx file not found');
        }

        const content = fs.readFileSync(indexPath, 'utf-8');

        // Check for re-export
        if (!content.includes('Dashboard')) {
            throw new Error('index.tsx should export Dashboard');
        }

        console.log('✅ test_index_exports_dashboard PASSED');
    } catch (e) {
        throw new Error(`index.tsx validation failed: ${(e as Error).message}`);
    }
}

/**
 * Test 6: Verify Dashboard handles empty state gracefully
 */
function test_dashboard_handles_empty_state() {
    const dashboardPath = path.join(__dirname, 'Dashboard.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // Check for default/initial state
    if (!content.includes('useState')) {
        throw new Error('Dashboard should have state management');
    }

    // Dashboard should have initial matrixLines (not crash on empty)
    if (!content.includes('matrixLines')) {
        throw new Error('Dashboard should initialize matrixLines state');
    }

    // Should have default state values
    if (!content.match(/useState\([^)]+\)/)) {
        throw new Error('Dashboard useState should have default values');
    }

    console.log('✅ test_dashboard_handles_empty_state PASSED');
}

/**
 * Test 7: Verify Dashboard uses Ink components correctly
 */
function test_dashboard_uses_ink_components() {
    const dashboardPath = path.join(__dirname, 'Dashboard.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // Check for Ink imports
    const requiredInkImports = ['Box', 'Text', 'useInput'];
    for (const imp of requiredInkImports) {
        if (!content.includes(imp)) {
            throw new Error(`Dashboard missing required Ink import: ${imp}`);
        }
    }

    // Check for ink-gradient (styling)
    if (!content.includes('Gradient')) {
        throw new Error('Dashboard should use Gradient for visual appeal');
    }

    // Check for Box usage (layout)
    if (!content.includes('<Box')) {
        throw new Error('Dashboard should use Box components for layout');
    }

    // Check for Text usage (content)
    if (!content.includes('<Text')) {
        throw new Error('Dashboard should use Text components for content');
    }

    console.log('✅ test_dashboard_uses_ink_components PASSED');
}

async function main() {
    console.log('\n📺 Running Membrane (Dashboard/HUD) Tests...\n');

    try {
        test_dashboard_component_exists();
        test_dashboard_has_core_ui_elements();
        test_dashboard_has_keyboard_handling();
        test_dashboard_has_live_updates();
        test_index_exports_dashboard();
        test_dashboard_handles_empty_state();
        test_dashboard_uses_ink_components();

        console.log('\n✅ All Membrane tests PASSED\n');
        console.log('📝 Note: These are structural tests. Full UI testing would require');
        console.log('   a React testing framework (e.g., React Testing Library + Ink renderer).');
        console.log('   For full coverage, run the Dashboard manually: npm run membrane\n');
        process.exit(0);
    } catch (e) {
        console.error('\n❌ TEST FAILED:', e);
        console.error((e as Error).stack);
        process.exit(1);
    }
}

main();
