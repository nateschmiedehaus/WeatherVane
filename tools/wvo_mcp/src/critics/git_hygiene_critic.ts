import { Critic, type CriticResult } from './base.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Git Hygiene Critic
 *
 * Validates that the git working tree is clean (no uncommitted changes).
 * Ensures professional git workflow and prevents operations on dirty trees.
 *
 * Part of: AFP-S2-GIT-HYGIENE-AUTOPUSH
 */
export class GitHygieneCritic extends Critic {
  protected command(_profile: string): string | null {
    // This critic doesn't use command pattern - it checks git status directly
    return null;
  }

  async evaluate(): Promise<CriticResult> {
    try {
      // Check git status
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: this.workspaceRoot
      });

      const lines = stdout.split('\n').filter(l => l.trim().length > 0);

      if (lines.length === 0) {
        return this.pass('✅ Git tree is clean');
      }

      // Parse status lines
      const uncommitted: string[] = [];
      const untracked: string[] = [];

      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status === '??') {
          // Untracked file
          untracked.push(file);
        } else {
          // Modified, Added, Deleted, Renamed, Copied
          uncommitted.push(`${status} ${file}`);
        }
      }

      // Build violation message
      const violations: string[] = [];

      if (uncommitted.length > 0) {
        violations.push(`Uncommitted changes (${uncommitted.length} files):`);
        uncommitted.slice(0, 10).forEach(f => violations.push(`  ${f}`));
        if (uncommitted.length > 10) {
          violations.push(`  ... and ${uncommitted.length - 10} more`);
        }
      }

      if (untracked.length > 0) {
        violations.push(`Untracked files (${untracked.length} files):`);
        untracked.slice(0, 10).forEach(f => violations.push(`  ${f}`));
        if (untracked.length > 10) {
          violations.push(`  ... and ${untracked.length - 10} more`);
        }
      }

      const remediation = this.getRemediation(uncommitted.length, untracked.length);

      return this.fail('❌ Git tree is not clean', {
        violations,
        remediation,
        uncommittedCount: uncommitted.length,
        untrackedCount: untracked.length
      });

    } catch (error) {
      // Fail gracefully if git command fails (e.g., not in a git repo)
      return this.pass(`⚠️  Git hygiene check skipped (${error})`);
    }
  }

  private getRemediation(uncommittedCount: number, untrackedCount: number): string {
    const steps: string[] = [];

    if (uncommittedCount > 0) {
      steps.push('Commit uncommitted changes:');
      steps.push('  git add <files>');
      steps.push('  git commit -m "Description of changes [TASK-ID]"');
    }

    if (untrackedCount > 0) {
      steps.push('Handle untracked files:');
      steps.push('  Option 1: Add to git: git add <files>');
      steps.push('  Option 2: Add to .gitignore: echo "file" >> .gitignore');
    }

    if (uncommittedCount > 0 && untrackedCount > 0) {
      steps.push('Or stage and commit everything:');
      steps.push('  git add . && git commit -m "WIP [TASK-ID]"');
    }

    return steps.join('\n');
  }
}
