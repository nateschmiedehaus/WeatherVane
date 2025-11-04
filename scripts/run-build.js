#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function hasWorkspaces(pkgPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0;
  } catch (err) {
    console.warn('[build] Unable to read package.json workspaces:', err.message);
    return false;
  }
}

function run(command, args, options) {
  console.log(`[build] Executing: ${command} ${args.join(' ')} (cwd=${options.cwd ?? process.cwd()})`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  return result.status ?? 0;
}

function candidateBuildDirs() {
  return [
    'apps/web',
    'tools/wvo_mcp'
  ].filter(dir => fs.existsSync(path.join(dir, 'package.json')));
}

function packageHasBuildScript(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.scripts && typeof pkg.scripts.build === 'string';
}

async function main() {
  if (hasWorkspaces('package.json')) {
    const status = run('npm', ['run', 'build', '--workspaces', '--if-present'], {});
    if (status !== 0) {
      console.warn('[build] Workspaces build exited with non-zero status, continuing.');
    }
    return;
  }

  let executed = 0;
  let attempted = 0;
  const failures = [];
  for (const dir of candidateBuildDirs()) {
    const pkgPath = path.join(dir, 'package.json');
    if (!packageHasBuildScript(pkgPath)) {
      console.log(`[build] Skipping ${dir} (no build script).`);
      continue;
    }
    attempted += 1;
    const status = run('npm', ['run', 'build'], { cwd: dir });
    if (status !== 0) {
      failures.push(`${dir}: npm run build exited with ${status}`);
      continue;
    }
    executed += 1;
  }

  if (failures.length) {
    console.warn('[build] Completed with warnings:');
    failures.forEach(msg => console.warn(`  - ${msg}`));
  }

  if (executed === 0 && attempted === 0) {
    console.log('[build] No build scripts detected; nothing to build.');
  }
}

main().catch(err => {
  console.error('[build] Error:', err);
  process.exit(1);
});
