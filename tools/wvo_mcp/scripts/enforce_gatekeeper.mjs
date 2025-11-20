#!/usr/bin/env node
/**
 * Gatekeeper enforcement script
 * Intended for use in pre-push/CI to block unsafe branches/commits and verify CI gate.
 *
 * Environment/config:
 * - GATEKEEPER_BRANCH: optional; defaults to `git rev-parse --abbrev-ref HEAD`
 * - GATEKEEPER_COMMIT_MSG: optional; if absent, skips commit message check with warning
 * - GATEKEEPER_CI_CMD: optional JSON array, e.g. '["npm","test"]'; defaults to ["npm","test"]
 * - GATEKEEPER_PROTECTED: optional comma list of protected branches; defaults to "main"
 */
import { execSync } from 'node:child_process';
import { Gatekeeper } from '../src/immune/gatekeeper.js';

function getBranch() {
  const envBranch = process.env.GATEKEEPER_BRANCH;
  if (envBranch) return envBranch.trim();
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.error('❌ Unable to determine branch:', error?.message ?? error);
    process.exit(1);
  }
}

function getCommitMessage() {
  const envMsg = process.env.GATEKEEPER_COMMIT_MSG;
  if (envMsg) return envMsg.trim();
  console.warn('⚠️ GATEKEEPER_COMMIT_MSG not provided; skipping commit message validation.');
  return null;
}

function getCiCommand() {
  const envCmd = process.env.GATEKEEPER_CI_CMD;
  if (envCmd) {
    try {
      const parsed = JSON.parse(envCmd);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fall through
    }
  }
  return ['npm', 'test'];
}

function run() {
  const protectedBranches = (process.env.GATEKEEPER_PROTECTED ?? 'main')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const gatekeeper = new Gatekeeper({ protectedBranches });
  const branch = getBranch();
  if (!gatekeeper.validatePush(branch)) process.exit(1);

  const msg = getCommitMessage();
  if (msg && !gatekeeper.validateCommitMessage(msg)) process.exit(1);

  const ciCmd = getCiCommand();
  gatekeeper
    .runCiGate(ciCmd)
    .then((ok) => {
      if (!ok) process.exit(1);
    })
    .catch((err) => {
      console.error('❌ CI gate error:', err?.message ?? err);
      process.exit(1);
    });
}

run();
