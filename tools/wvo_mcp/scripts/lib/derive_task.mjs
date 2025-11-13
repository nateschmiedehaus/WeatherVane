import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const FALLBACK = 'AFP-W0-STEP5-MUTATION';
const AFP_PATTERN = /AFP-[A-Z0-9-]+/i;
const canonicalize = (value) => {
  if (!value) return null;
  const parts = value.toUpperCase().split('-');
  if (parts[0] !== 'AFP') return value.toUpperCase();
  if (parts.length >= 4) {
    return parts.slice(0, 4).join('-');
  }
  return value.toUpperCase();
};

const extract = (value) => {
  if (!value) return null;
  const match = value.match(AFP_PATTERN)?.[0];
  return match ? canonicalize(match) : null;
};

const fromCommitMessage = () => {
  try {
    const gitDir = process.env.GIT_DIR || path.join(process.cwd(), '.git');
    const candidate = path.join(gitDir, 'COMMIT_EDITMSG');
    return fs.existsSync(candidate) ? extract(fs.readFileSync(candidate, 'utf8')) : null;
  } catch {
    return null;
  }
};

const fromBranch = () => {
  try {
    return extract(execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim());
  } catch {
    return null;
  }
};

export function deriveTaskId() {
  const task =
    extract(process.env.TASK_ID) ??
    extract(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME) ??
    fromBranch() ??
    fromCommitMessage();
  if (task) {
    return task;
  }
  console.warn(`derive_task: falling back to ${FALLBACK}; set TASK_ID for deterministic logs.`);
  return FALLBACK;
}

export default deriveTaskId;
