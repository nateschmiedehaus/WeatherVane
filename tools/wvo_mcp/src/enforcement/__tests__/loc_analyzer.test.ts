import { describe, test, expect } from 'vitest';
import { analyzeFileLOC, analyzeCommitLOC, type FileChange } from '../loc_analyzer.js';

describe('LOC Analyzer', () => {
  describe('File type detection', () => {
    test('identifies test files with 3.0x multiplier', () => {
      const file: FileChange = {
        path: 'src/foo.test.ts',
        addedLines: 200,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.fileTypeMultiplier).toBe(3.0);
      expect(result.adjustedLimit).toBe(450); // 150 * 3.0
      expect(result.allowed).toBe(true);
    });

    test('identifies core logic with 0.8x multiplier (STRICT)', () => {
      const file: FileChange = {
        path: 'src/orchestrator/runtime.ts',
        addedLines: 130,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.fileTypeMultiplier).toBe(0.8);
      expect(result.adjustedLimit).toBe(120); // 150 * 0.8
      expect(result.allowed).toBe(false); // 130 > 120
      expect(result.severity).toBe('blocked');
    });

    test('identifies templates with 4.0x multiplier', () => {
      const file: FileChange = {
        path: 'docs/templates/strategy_template.md',
        addedLines: 550,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.fileTypeMultiplier).toBe(4.0);
      expect(result.adjustedLimit).toBe(600); // 150 * 4.0
      expect(result.allowed).toBe(true);
    });

    test('identifies system docs with 4.0x multiplier', () => {
      const file: FileChange = {
        path: 'docs/orchestration/SYSTEM_DESIGN.md',
        addedLines: 550,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.fileTypeMultiplier).toBe(4.0);
      expect(result.adjustedLimit).toBe(600);
      expect(result.allowed).toBe(true);
    });

    test('identifies regular docs with 3.0x multiplier', () => {
      const file: FileChange = {
        path: 'docs/guides/USAGE.md',
        addedLines: 400,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.fileTypeMultiplier).toBe(3.0);
      expect(result.adjustedLimit).toBe(450);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Deletion credits (via negativa)', () => {
    test('awards credit at 0.5x ratio', () => {
      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 200,
        deletedLines: 100, // Should get +50 credit
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.deletionCredit).toBe(50); // 100 / 2
      expect(result.adjustedLimit).toBe(200); // 150 * 1.0 + 50
      expect(result.allowed).toBe(true); // 200 net, 200 limit
    });

    test('handles zero deletions', () => {
      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 140,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.deletionCredit).toBe(0);
      expect(result.adjustedLimit).toBe(150);
      expect(result.allowed).toBe(true);
    });

    test('large refactoring gets substantial credit', () => {
      const file: FileChange = {
        path: 'src/core.ts',
        addedLines: 180,
        deletedLines: 200, // Get +100 credit
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.deletionCredit).toBe(100);
      expect(result.adjustedLimit).toBe(250); // 150 + 100
      expect(result.allowed).toBe(true);
      expect(result.netLOC).toBe(-20); // Net deletion!
    });
  });

  describe('Effective LOC calculation', () => {
    test('excludes comments and imports', () => {
      const content = `
// This is a comment
import { foo } from 'bar';
import { baz } from 'qux';

// More comments
export function realCode() {
  return 42;
}
      `.trim();

      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 10,
        deletedLines: 0,
        content,
      };

      const result = analyzeFileLOC(file);

      // Should have much lower effective LOC
      expect(result.effectiveLOC).toBeLessThan(result.totalLOC);
    });

    test('counts type defs as 0.5x', () => {
      const content = `
interface Foo {
  bar: string;
  baz: number;
}

type Bar = 'a' | 'b' | 'c';

function realLogic() {
  return 42;
}
      `.trim();

      const file: FileChange = {
        path: 'src/types.ts',
        addedLines: 12,
        deletedLines: 0,
        content,
      };

      const result = analyzeFileLOC(file);

      // Effective LOC should be reduced (types count as 0.5x)
      expect(result.effectiveLOC).toBeLessThan(result.totalLOC);
    });
  });

  describe('Pattern detection', () => {
    test('detects high-imports pattern', () => {
      // Create content with >20 imports
      const imports = Array.from({ length: 25 }, (_, i) => `import { foo${i} } from 'bar${i}';`).join('\n');
      const content = `${imports}\n\nexport function foo() { return 42; }`;

      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 27,
        deletedLines: 0,
        content,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.patternBonus).toBeGreaterThanOrEqual(20); // high-imports bonus
    });

    test('detects well-documented pattern', () => {
      // Create content with >30% comments
      const content = `
// Comment 1
// Comment 2
// Comment 3
// Comment 4
// Comment 5
export function foo() {
  return 42;
}
      `.trim();

      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 10,
        deletedLines: 0,
        content,
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.patternBonus).toBeGreaterThanOrEqual(30); // well-documented bonus
    });
  });

  describe('Progressive enforcement', () => {
    test('passes when within limit', () => {
      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 140,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.severity).toBe('pass');
      expect(result.allowed).toBe(true);
    });

    test('warns when 100-150% over limit', () => {
      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 200, // 150 * 1.33 = 133% over
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.severity).toBe('warning');
      expect(result.allowed).toBe(true); // Warning, not blocked
    });

    test('strong warning when 150-200% over limit', () => {
      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 270, // 150 * 1.8 = 180% over
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.severity).toBe('strong-warning');
      expect(result.allowed).toBe(true); // Still allowed with strong warning
      expect(result.recommendations).toBeDefined();
    });

    test('blocks when >200% over limit', () => {
      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 350, // 150 * 2.33 = 233% over
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.severity).toBe('blocked');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Integration - multi-file commits', () => {
    test('analyzes multiple files correctly', () => {
      const files: FileChange[] = [
        {
          path: 'src/foo.ts',
          addedLines: 100,
          deletedLines: 0,
        },
        {
          path: 'src/bar.test.ts',
          addedLines: 300,
          deletedLines: 0,
        },
        {
          path: 'docs/README.md',
          addedLines: 200,
          deletedLines: 50,
        },
      ];

      const analysis = analyzeCommitLOC(files);

      expect(analysis.files).toHaveLength(3);
      expect(analysis.totalNetLOC).toBe(550); // 100 + 300 + 150
      expect(analysis.overallAllowed).toBe(true); // All files within their limits
    });

    test('blocks commit if any file is blocked', () => {
      const files: FileChange[] = [
        {
          path: 'src/foo.ts',
          addedLines: 100,
          deletedLines: 0,
        },
        {
          path: 'src/bar.ts',
          addedLines: 400, // Way over 150 limit
          deletedLines: 0,
        },
      ];

      const analysis = analyzeCommitLOC(files);

      expect(analysis.overallAllowed).toBe(false);
      expect(analysis.blockedFiles).toContain('src/bar.ts');
    });
  });

  describe('Acceptance Criteria from Spec', () => {
    test('AC1: Core logic remains strict', () => {
      const file: FileChange = {
        path: 'src/orchestrator/runtime.ts',
        addedLines: 180,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.allowed).toBe(false); // 180 > 120 (0.8x multiplier)
    });

    test('AC1b: Core logic with deletion credit passes', () => {
      const file: FileChange = {
        path: 'src/orchestrator/runtime.ts',
        addedLines: 120,
        deletedLines: 100, // +50 credit
      };

      const result = analyzeFileLOC(file);

      expect(result.credits.deletionCredit).toBe(50);
      expect(result.adjustedLimit).toBe(170); // 120 + 50
      expect(result.allowed).toBe(true);
    });

    test('AC2: Tests get generous limits', () => {
      const file: FileChange = {
        path: 'src/foo.test.ts',
        addedLines: 400,
        deletedLines: 0,
      };

      const result = analyzeFileLOC(file);

      expect(result.adjustedLimit).toBe(450);
      expect(result.allowed).toBe(true);
    });

    test('AC3: Via negativa incentivized', () => {
      const file: FileChange = {
        path: 'src/foo.ts',
        addedLines: 200,
        deletedLines: 300, // Delete 300, add 200 = net -100
      };

      const result = analyzeFileLOC(file);

      expect(result.deletedLOC).toBe(300);
      expect(result.credits.deletionCredit).toBe(150); // 300 / 2
      expect(result.netLOC).toBe(-100); // Net deletion
      expect(result.allowed).toBe(true);
    });

    test('AC5: Progressive warnings work', () => {
      const warning: FileChange = {
        path: 'src/foo.ts',
        addedLines: 200, // 133% over 150
        deletedLines: 0,
      };

      const blocked: FileChange = {
        path: 'src/bar.ts',
        addedLines: 350, // 233% over 150
        deletedLines: 0,
      };

      const warningResult = analyzeFileLOC(warning);
      const blockedResult = analyzeFileLOC(blocked);

      expect(warningResult.severity).toBe('warning');
      expect(warningResult.allowed).toBe(true);

      expect(blockedResult.severity).toBe('blocked');
      expect(blockedResult.allowed).toBe(false);
    });
  });
});
