import path from 'node:path';
import { promises as fs } from 'node:fs';
import { LocalContextPack, LocalContextPackSchema } from './context_pack_schema.js';
import {
  classifyScope,
  deriveBudget,
  getRoleBudget,
  ScopeClass,
  type TokenBudget,
} from './context_budgeting.js';
import { KnowledgeNavigator } from './knowledge_navigator.js';

type Agent =
  | 'Planner'
  | 'Thinker'
  | 'Implementer'
  | 'Verifier'
  | 'Reviewer'
  | 'Critical'
  | 'Supervisor';

interface AssembleOptions {
  agent: Agent;
  taskId: string;
  goal: string;
  acceptanceCriteria: string[];
  constraints: string[];
  capability: 'fast_code' | 'reasoning_high' | 'reasoning_ultra' | 'long_context' | 'cheap_batch';
  scopeSignal: { filesTouched: number; approxChangedLines: number };
  fileHints: string[];
  testHints: string[];
  riskNotes?: string[];
  openQuestions?: string[];
  nextActions?: string[];
}

interface ContextAssemblerConfig {
  workspaceRoot: string;
  runId: string;
}

export class ContextAssembler {
  private readonly navigator: KnowledgeNavigator;

  constructor(private readonly config: ContextAssemblerConfig) {
    this.navigator = new KnowledgeNavigator({ workspaceRoot: config.workspaceRoot });
  }

  async emit(options: AssembleOptions): Promise<string> {
    const scopeClass = classifyScope(options.scopeSignal);
    const plannerBudget = deriveBudget(scopeClass, options.capability);

    const anchors = await this.collectAnchors(scopeClass, options.fileHints, options.testHints);
    const microSummaries = anchors.slice(0, 4).map(anchor => ({
      ref: anchor.ref ?? anchor.path ?? anchor.name ?? 'anchor',
      summary: this.buildSummary(anchor),
    }));

    const pack: LocalContextPack = {
      agent: options.agent,
      task_id: options.taskId,
      goal: options.goal,
      acceptance_criteria: options.acceptanceCriteria,
      constraints: options.constraints,
      scope_class: scopeClass,
      model_capability: options.capability,
      anchors,
      micro_summaries: microSummaries,
      risk_notes: options.riskNotes ?? [],
      open_questions: options.openQuestions ?? [],
      next_actions: options.nextActions ?? [],
      token_estimate: plannerBudget,
      bloat_checks: {
        dedup_ok: this.isDedupOk(anchors),
        within_budget: plannerBudget <= getRoleBudget(scopeClass, this.mapAgentToRole(options.agent)),
        no_large_blobs: true,
      },
    };

    LocalContextPackSchema.parse(pack);
    return this.persist(pack);
  }

  private async collectAnchors(scope: ScopeClass, fileHints: string[], testHints: string[]) {
    const codeAnchors = await this.navigator.collectCodeAnchors(fileHints);
    const testAnchors = await this.navigator.collectTestAnchors(testHints);
    const kbAnchors = scope === 'Tiny' ? [] : await this.navigator.collectKbAnchors();
    const decisionAnchors = await this.navigator.collectDecisionAnchors(this.config.runId);
    return this.dedupe([...codeAnchors, ...testAnchors, ...kbAnchors, ...decisionAnchors]);
  }

  private async persist(pack: LocalContextPack): Promise<string> {
    const fileName = `${pack.agent}.lcp.json`;
    const destDir = path.join(this.config.workspaceRoot, 'resources', 'runs', this.config.runId, 'context');
    await fs.mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, fileName);
    await fs.writeFile(destPath, JSON.stringify(pack, null, 2));
    return `resources://runs/${this.config.runId}/context/${fileName}`;
  }

  private dedupe<T extends { path?: string; ref?: string }>(anchors: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const anchor of anchors) {
      const key = anchor.ref ?? anchor.path;
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(anchor);
    }
    return result;
  }

  private isDedupOk(anchors: Array<{ path?: string; ref?: string }>): boolean {
    return anchors.length === this.dedupe(anchors).length;
  }

  private buildSummary(anchor: { path?: string; ref?: string; name?: string }): string {
    if (anchor.path) {
      return `Review ${anchor.path} for invariants and dependency impacts.`;
    }
    if (anchor.ref) {
      return `Consult ${anchor.ref} for prior decision or KB rule.`;
    }
    return anchor.name ? `Test ${anchor.name} ensures regression coverage.` : 'Anchor';
  }

  private mapAgentToRole(agent: Agent): keyof TokenBudget {
    switch (agent) {
      case 'Planner':
        return 'planner';
      case 'Thinker':
        return 'thinker';
      case 'Implementer':
        return 'implementer';
      case 'Verifier':
        return 'verifier';
      case 'Reviewer':
        return 'reviewer';
      case 'Critical':
        return 'critical';
      default:
        return 'supervisor';
    }
  }
}
