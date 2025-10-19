#!/usr/bin/env ts-node
/**
 * Upgrade Drift Monitor
 *
 * Checks state/analytics/upgrade_shadow.json for persistent drift
 * and alerts if differences are found.
 *
 * Usage:
 *   npx ts-node scripts/check_upgrade_drift.ts
 *
 * Exit codes:
 *   0 = No drift detected
 *   1 = Drift detected (warning)
 *   2 = Error reading files
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface UpgradeShadowData {
  upgrade_id: string;
  recorded_at: string;
  diff_count: number;
  diff_path: string;
}

interface DriftAlert {
  severity: 'warning' | 'info';
  message: string;
  upgrade_id: string;
  diff_count: number;
  age_hours: number;
  diff_path: string;
}

function checkUpgradeDrift(workspaceRoot: string): DriftAlert | null {
  const shadowPath = join(workspaceRoot, 'state/analytics/upgrade_shadow.json');

  // Check if file exists
  if (!existsSync(shadowPath)) {
    return null; // No shadow data means no drift detected yet
  }

  let data: UpgradeShadowData;
  try {
    const content = readFileSync(shadowPath, 'utf-8');
    data = JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${shadowPath}:`, error);
    process.exit(2);
  }

  // No differences = no alert
  if (data.diff_count === 0) {
    return null;
  }

  // Calculate age of the drift
  const recordedAt = new Date(data.recorded_at);
  const now = new Date();
  const ageMs = now.getTime() - recordedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  // Determine severity based on age and diff count
  let severity: 'warning' | 'info' = 'info';
  if (ageHours > 24 || data.diff_count > 5) {
    severity = 'warning';
  }

  return {
    severity,
    message: `Upgrade shadow drift detected: ${data.diff_count} differences found`,
    upgrade_id: data.upgrade_id,
    diff_count: data.diff_count,
    age_hours: Math.round(ageHours * 10) / 10,
    diff_path: data.diff_path,
  };
}

function main() {
  // tools/wvo_mcp/scripts -> tools/wvo_mcp -> tools -> root
  const workspaceRoot = process.env.ROOT || join(__dirname, '../../..');

  console.log('Checking for upgrade drift...');

  const alert = checkUpgradeDrift(workspaceRoot);

  if (!alert) {
    console.log('✓ No drift detected');
    process.exit(0);
  }

  // Output structured alert
  console.log(`\n${alert.severity.toUpperCase()}: ${alert.message}`);
  console.log(`  Upgrade ID: ${alert.upgrade_id}`);
  console.log(`  Differences: ${alert.diff_count}`);
  console.log(`  Age: ${alert.age_hours} hours`);
  console.log(`  Details: ${alert.diff_path}`);

  // Output JSON for monitoring integration
  console.log('\nJSON:');
  console.log(JSON.stringify(alert, null, 2));

  // Exit with warning code if drift detected
  process.exit(alert.severity === 'warning' ? 1 : 0);
}

// Run if executed directly
main();
