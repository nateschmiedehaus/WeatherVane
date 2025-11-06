#!/usr/bin/env node
/**
 * Run Wave0 Autopilot Test
 *
 * Simple script to test Wave0 runner with supervisor integration.
 */

import { Wave0Runner } from '../dist/wave0/runner.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../..');

console.log(`Starting Wave0Runner with workspace: ${workspaceRoot}`);

const runner = new Wave0Runner(workspaceRoot);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  process.exit(0);
});

// Run Wave0
try {
  await runner.run();
  console.log('Wave0Runner completed successfully');
} catch (error) {
  console.error('Wave0Runner failed:', error);
  process.exit(1);
}
