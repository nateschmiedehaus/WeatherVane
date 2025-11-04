import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ResearchManager } from '../intelligence/research_manager.js';
import type { ResearchFinding, AlternativeOption } from '../intelligence/research_types.js';
import type { StateMachine, CriticHistoryRecord } from '../orchestrator/state_machine.js';

export interface CriticHistoryEntry {
  timestamp: number;
  passed: boolean;
  category: string;
  stderrSample?: string;
}

export interface CriticIntelligenceOptions {
  workspaceRoot: string;
  critic: string;
  intelligenceLevel?: number;
  historyLimit?: number;
  researchManager?: ResearchManager;
  stateMachine?: StateMachine;
}

export interface CriticAnalysis {
  category: string;
  confidence: number;
  rootCauses: string[];
  recommendations: string[];
  history: {
    totalObservations: number;
    similarFailures: number;
  };
  researchFindings?: ResearchFinding[];
  alternativeOptions?: AlternativeOption[];
}

interface CategorisedFailure {
  category: string;
  confidence: number;
  rootCauses: string[];
  recommendations: string[];
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export class CriticIntelligenceEngine {
  private readonly historyPath: string;
  private readonly limit: number;
  private readonly researchManager?: ResearchManager;
  private readonly intelligenceLevel: number;
  private readonly stateMachine?: StateMachine;
  private readonly criticKey: string;

  constructor(private readonly options: CriticIntelligenceOptions) {
    this.criticKey = this.options.critic;
    this.historyPath = path.join(
      this.options.workspaceRoot,
      'state',
      'critics',
      'history',
      `${this.options.critic}.json`
    );
    this.limit = Math.max(1, options.historyLimit ?? 20);
    this.researchManager = options.researchManager;
    this.stateMachine = options.stateMachine;
    const parsedLevel = Number.isFinite(options.intelligenceLevel)
      ? (options.intelligenceLevel as number)
      : 1;
    this.intelligenceLevel = Math.min(3, Math.max(1, parsedLevel));
  }

  async analyzeFailure(stderr: string): Promise<CriticAnalysis | null> {
    const history = await this.loadHistory();
    const categorised = this.categorise(stderr);
    const similarFailures = history.filter((entry) => entry.category === categorised.category);

    const timestamp = Date.now();
    let totalObservations: number;
    let similarCount = similarFailures.length;

    if (this.stateMachine) {
      this.stateMachine.recordCriticHistory({
        critic: this.criticKey,
        category: categorised.category,
        passed: false,
        stderr_sample: stderr.slice(0, 2000),
        created_at: timestamp,
        metadata: {
          intelligence_level: this.intelligenceLevel,
        },
      });
      totalObservations = Math.min(this.limit, history.length + 1);
      similarCount += 1;
    } else {
      const updatedHistory = [
        ...history,
        {
          timestamp,
          passed: false,
          category: categorised.category,
          stderrSample: stderr.slice(0, 2000),
        } satisfies CriticHistoryEntry,
      ].slice(-this.limit);
      await this.saveHistory(updatedHistory);
      totalObservations = updatedHistory.length;
      similarCount += 1;
    }

    const analysis: CriticAnalysis = {
      category: categorised.category,
      confidence: categorised.confidence,
      rootCauses: categorised.rootCauses,
      recommendations: [...categorised.recommendations],
      history: {
        totalObservations,
        similarFailures: similarCount,
      },
    };

    if (this.shouldEnrichWithResearch(similarFailures.length)) {
      const research = await this.lookupResearch(categorised);
      if (research) {
        if (research.findings.length > 0) {
          analysis.researchFindings = research.findings;
        }
        if (research.alternatives.length > 0) {
          analysis.alternativeOptions = research.alternatives;
          analysis.recommendations.push(
            'Review alternative implementation options supplied by the research layer.'
          );
        }
      }
    }

    return analysis;
  }

  async recordSuccess(): Promise<void> {
    if (this.stateMachine) {
      this.stateMachine.recordCriticHistory({
        critic: this.criticKey,
        category: 'success',
        passed: true,
        created_at: Date.now(),
      });
      return;
    }

    const history = await this.loadHistory();
    const updated = [
      ...history,
      {
        timestamp: Date.now(),
        passed: true,
        category: 'success',
      } satisfies CriticHistoryEntry,
    ].slice(-this.limit);
    await this.saveHistory(updated);
  }

  private shouldEnrichWithResearch(previousSimilarFailures: number): boolean {
    if (!this.researchManager) return false;
    if (this.intelligenceLevel >= 3) return true;
    return previousSimilarFailures >= 1;
  }

  private async lookupResearch(categorised: CategorisedFailure): Promise<{
    findings: ResearchFinding[];
    alternatives: AlternativeOption[];
  } | null> {
    if (!this.researchManager) return null;

    try {
      const findings = await this.researchManager.query({
        topic: `${this.options.critic} critic ${categorised.category} failure`,
        keywords: categorised.rootCauses.slice(0, 5),
        domains: ['arxiv', 'scholar'],
        recency: 'latest',
      });

      const alternatives = await this.researchManager.suggestAlternatives({
        taskId: `critic-${this.options.critic}`,
        taskTitle: `${this.options.critic} critic remediation`,
        taskDescription: categorised.rootCauses.join('; '),
        contextTags: categorised.rootCauses.slice(0, 5),
        creativity: this.intelligenceLevel >= 3 ? 'high' : 'balanced',
      });

      return {
        findings,
        alternatives,
      };
    } catch (error) {
      // Best-effort enrichment; swallow errors to keep critics fast.
      return null;
    }
  }

  private categorise(stderr: string): CategorisedFailure {
    const lower = stderr.toLowerCase();

    if (/timeout|timed out|took too long|deadline/.test(lower)) {
      return {
        category: 'execution_timeout',
        confidence: 0.7,
        rootCauses: ['Execution exceeded allotted time window'],
        recommendations: ['Profile slow steps and consider splitting heavy checks.'],
      };
    }

    if (/assert|expect|failed|fail|traceback/.test(lower)) {
      return {
        category: 'test_failure',
        confidence: 0.8,
        rootCauses: ['Test suite reported failing assertions'],
        recommendations: [
          'Inspect failing test output and reproduce locally.',
          'Confirm fixtures and data generators are stable.',
        ],
      };
    }

    if (/lint|eslint|ruff|style/.test(lower)) {
      return {
        category: 'lint_violation',
        confidence: 0.75,
        rootCauses: ['Linting or static analysis detected style violations'],
        recommendations: ['Rerun lint locally and stage fixes.', 'Check formatter configuration drift.'],
      };
    }

    if (/dependency|module not found|cannot find module|importerror/.test(lower)) {
      return {
        category: 'dependency_issue',
        confidence: 0.7,
        rootCauses: ['Missing or incompatible dependency in runtime environment'],
        recommendations: [
          'Verify package.json/requirements.txt entries are up to date.',
          'Run dependency install scripts and commit lockfile updates.',
        ],
      };
    }

    if (/permission|access denied|unauthorized/.test(lower)) {
      return {
        category: 'permission_denied',
        confidence: 0.65,
        rootCauses: ['Command lacks the required permissions or credentials'],
        recommendations: ['Check service credentials and ensure secrets are loaded.'],
      };
    }

    return {
      category: 'unknown_failure',
      confidence: 0.4,
      rootCauses: ['Critic command failed with unclassified error'],
      recommendations: ['Review stderr output for additional clues.', 'Capture repro steps for diagnosis.'],
    };
  }

  private async loadHistory(): Promise<CriticHistoryEntry[]> {
    if (this.stateMachine) {
      const rows = this.stateMachine.getCriticHistory(this.criticKey, { limit: this.limit });
      return rows.map((row: CriticHistoryRecord) => ({
        timestamp: row.created_at,
        passed: row.passed,
        category: row.category,
        stderrSample: row.stderr_sample,
      }));
    }

    try {
      const raw = await fs.readFile(this.historyPath, 'utf-8');
      const parsed = JSON.parse(raw) as CriticHistoryEntry[];
      if (Array.isArray(parsed)) {
        return parsed.filter((entry) => typeof entry.timestamp === 'number');
      }
      return [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async saveHistory(entries: CriticHistoryEntry[]): Promise<void> {
    if (this.stateMachine) {
      // State-machine backed history is persisted per-record; no file storage required.
      return;
    }
    const dir = path.dirname(this.historyPath);
    await ensureDir(dir);
    await fs.writeFile(this.historyPath, JSON.stringify(entries, null, 2), 'utf-8');
  }
}
