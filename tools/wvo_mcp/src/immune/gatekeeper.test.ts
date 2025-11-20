import { describe, it, expect, vi, afterEach } from 'vitest';
import { Gatekeeper } from './gatekeeper';

describe('Gatekeeper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

    describe('validatePush', () => {
        it('blocks protected branches', () => {
            const gatekeeper = new Gatekeeper({ protectedBranches: ['main', 'release'] });
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(gatekeeper.validatePush('main')).toBe(false);
            expect(errSpy).toHaveBeenCalled();
        });

        it('allows non-protected branches', () => {
            const gatekeeper = new Gatekeeper({ protectedBranches: ['main'] });
            expect(gatekeeper.validatePush('feature/immune')).toBe(true);
        });
    });

    describe('validateCommitMessage', () => {
        it('accepts valid conventional commit', () => {
            const gatekeeper = new Gatekeeper();
            expect(gatekeeper.validateCommitMessage('feat(api): add immune gate')).toBe(true);
        });

        it('rejects invalid commit', () => {
            const gatekeeper = new Gatekeeper();
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(gatekeeper.validateCommitMessage('bad commit')).toBe(false);
            expect(errSpy).toHaveBeenCalled();
        });
    });

    describe('runCiGate', () => {
      it('passes when CI command exits cleanly', async () => {
        const gatekeeper = new Gatekeeper();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = await gatekeeper.runCiGate(['node', '-e', 'process.exit(0)']);
        expect(result).toBe(true);
        expect(logSpy).toHaveBeenCalled();
      });

      it('fails when CI command returns non-zero', async () => {
        const gatekeeper = new Gatekeeper();
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await gatekeeper.runCiGate(['node', '-e', 'process.exit(1)']);
        expect(result).toBe(false);
        expect(errSpy).toHaveBeenCalled();
      });

      it('fails when CI command missing', async () => {
        const gatekeeper = new Gatekeeper();
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await gatekeeper.runCiGate([]);
        expect(result).toBe(false);
        expect(errSpy).toHaveBeenCalled();
      });
    });
  });
