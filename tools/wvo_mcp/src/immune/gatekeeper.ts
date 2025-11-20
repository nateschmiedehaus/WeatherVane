import { execa } from 'execa';

export interface GatekeeperOptions {
    protectedBranches?: string[];
    commitPattern?: RegExp;
    ciCommand?: string[];
    ciTimeoutMs?: number;
}

const DEFAULT_COMMIT_PATTERN = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/;
const DEFAULT_PROTECTED = ['main'];
const DEFAULT_CI_COMMAND = ['npm', 'test'];

export class Gatekeeper {
    constructor(private readonly options: GatekeeperOptions = {}) {}

    validatePush(branch: string | undefined | null): boolean {
        const target = (branch ?? '').trim();
        const protectedBranches = this.options.protectedBranches ?? DEFAULT_PROTECTED;
        if (!target) {
            console.error('❌ BLOCKED: No branch provided. Aborting push.');
            return false;
        }
        if (protectedBranches.includes(target)) {
            console.error(`❌ BLOCKED: Direct push to protected branch "${target}" is forbidden. Use a PR.`);
            return false;
        }
        return true;
    }

    validateCommitMessage(message: string): boolean {
        const pattern = this.options.commitPattern ?? DEFAULT_COMMIT_PATTERN;
        const trimmed = (message ?? '').trim();
        if (!trimmed) {
            console.error('❌ BLOCKED: Commit message is empty.');
            return false;
        }
        if (!pattern.test(trimmed)) {
            console.error('❌ BLOCKED: Invalid commit message format.');
            console.error('   Expected: type(scope): description');
            console.error('   Example: feat(auth): add login page');
            return false;
        }
        return true;
    }

    async runCiGate(commandOverride?: string[]): Promise<boolean> {
        const command = commandOverride ?? this.options.ciCommand ?? DEFAULT_CI_COMMAND;
        const [exec, ...args] = command;
        if (!exec) {
            console.error('❌ BLOCKED: No CI command configured.');
            return false;
        }
        console.log(`🛡️ Running Immune System Gate (CI): ${[exec, ...args].join(' ')}`);
        try {
            await execa(exec, args, {
                stdio: 'inherit',
                timeout: this.options.ciTimeoutMs,
            });
            console.log('✅ CI Passed.');
            return true;
        } catch (error: any) {
            const exitCode = error?.exitCode;
            const stderr = error?.stderr;
            console.error(`❌ CI Failed${exitCode !== undefined ? ` (exit ${exitCode})` : ''}.`);
            if (stderr) {
                console.error(stderr);
            }
            return false;
        }
    }
}
