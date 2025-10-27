/**
 * Lens Gap Detector - Meta-Cognitive System for Framework Evolution
 *
 * Enables orchestrator to spot gaps in its own decision framework by:
 * 1. Detecting tasks that don't fit any existing lens (misfits)
 * 2. Analyzing failure patterns suggesting missing perspectives
 * 3. Proposing new lenses based on evidence
 * 4. Auto-updating documentation when gaps validated
 *
 * **Purpose**: Make orchestrator self-aware enough to improve its own judgment framework
 *
 * See: docs/MISSING_OBJECTIVES_ANALYSIS.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

import { logInfo, logDebug, logWarning } from '../telemetry/logger.js';

import { SevenLensEvaluator } from './seven_lens_evaluator.js';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
}

interface TaskLensMismatch {
  taskId: string;
  taskTitle: string;
  bestLensScore: number;
  bestLens: string;
  reason: string;
  suggestedNewLens?: string;
  confidence: number; // 0-1
}

interface IncidentPattern {
  type: string; // "production_outage" | "customer_churn" | "missed_deadline" | "security_issue"
  count: number;
  examples: string[];
  suggestedLens: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface LensGapReport {
  timestamp: string;
  misfitTasks: TaskLensMismatch[];
  failurePatterns: IncidentPattern[];
  proposedLenses: {
    name: string;
    justification: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    evidence: string[];
  }[];
  recommendation: string;
}

export class LensGapDetector {
  private evaluator: SevenLensEvaluator;
  private rootDir: string;

  constructor(rootDir: string = process.env.ROOT || process.cwd()) {
    this.evaluator = new SevenLensEvaluator();
    this.rootDir = rootDir;
  }

  /**
   * Main entry point: Detect gaps in decision framework
   */
  async detectGaps(tasks: Task[]): Promise<LensGapReport> {
    const misfitTasks = this.detectTaskMisfits(tasks);
    const failurePatterns = await this.analyzeFailurePatterns();
    const proposedLenses = this.synthesizeProposals(misfitTasks, failurePatterns);

    const report: LensGapReport = {
      timestamp: new Date().toISOString(),
      misfitTasks,
      failurePatterns,
      proposedLenses,
      recommendation: this.generateRecommendation(proposedLenses)
    };

    // Save report for human review
    this.saveGapReport(report);

    return report;
  }

  /**
   * Detect tasks that don't fit any existing lens well (score <60 on all lenses)
   */
  private detectTaskMisfits(tasks: Task[]): TaskLensMismatch[] {
    const misfits: TaskLensMismatch[] = [];

    for (const task of tasks) {
      const report = this.evaluator.evaluateTask(task);
      const maxScore = Math.max(...report.lenses.map(l => l.score));
      const bestLens = report.lenses.find(l => l.score === maxScore)!;

      // Threshold: If best lens scores <60, task doesn't fit framework well
      if (maxScore < 60) {
        const suggestedLens = this.inferMissingLens(task);

        misfits.push({
          taskId: task.id,
          taskTitle: task.title,
          bestLensScore: maxScore,
          bestLens: bestLens.lens,
          reason: this.analyzeWhyNoLensFits(task, report.lenses),
          suggestedNewLens: suggestedLens.name,
          confidence: suggestedLens.confidence
        });
      }
    }

    return misfits;
  }

  /**
   * Analyze why no lens fits this task
   */
  private analyzeWhyNoLensFits(task: Task, lenses: any[]): string {
    const reasons: string[] = [];

    // Check what the task is about
    const text = `${task.title} ${task.description}`.toLowerCase();

    if (text.match(/monitoring|alert|incident|uptime|sla|on-call/)) {
      reasons.push("Task is about operational reliability (DevOps/SRE lens missing)");
    }
    if (text.match(/cost|pricing|margin|cac|ltv|unit economics|burn rate/)) {
      reasons.push("Task is about financial operations (CFO lens missing)");
    }
    if (text.match(/scale|scalability|database|infrastructure|multi-tenant/)) {
      reasons.push("Task is about technical scalability (CTO lens missing)");
    }
    if (text.match(/churn|retention|customer success|onboard|health score/)) {
      reasons.push("Task is about customer retention (Customer Success lens missing)");
    }
    if (text.match(/gdpr|ccpa|soc2|compliance|legal|privacy|terms/)) {
      reasons.push("Task is about legal compliance (Legal lens missing)");
    }
    if (text.match(/security|vulnerability|penetration test|secrets|access control/)) {
      reasons.push("Task is about security operations (Security lens missing)");
    }
    if (text.match(/model drift|data quality|mlops|feature store|training pipeline/)) {
      reasons.push("Task is about ML operations (MLOps lens missing)");
    }
    if (text.match(/sales pipeline|lead scoring|contract|quota|revenue ops/)) {
      reasons.push("Task is about sales operations (Sales Ops lens missing)");
    }

    if (reasons.length === 0) {
      reasons.push("Task domain unclear or spans multiple missing perspectives");
    }

    return reasons.join("; ");
  }

  /**
   * Infer what lens is missing based on task characteristics
   */
  private inferMissingLens(task: Task): { name: string; confidence: number } {
    const text = `${task.title} ${task.description}`.toLowerCase();

    // Keyword-based inference (simple heuristic, could be ML model)
    const lensKeywords: Record<string, string[]> = {
      "CFO/Unit Economics": ["cost", "pricing", "margin", "cac", "ltv", "burn rate", "revenue", "profit"],
      "CTO/Scalability": ["scale", "database", "infrastructure", "performance", "multi-tenant", "architecture"],
      "Customer Success": ["churn", "retention", "onboard", "customer health", "usage", "adoption"],
      "DevOps/SRE": ["monitoring", "alert", "incident", "uptime", "sla", "deployment", "rollback"],
      "Legal/Compliance": ["gdpr", "ccpa", "soc2", "compliance", "legal", "privacy", "terms", "contract"],
      "Security": ["security", "vulnerability", "penetration", "secrets", "access", "auth", "encryption"],
      "MLOps": ["model drift", "data quality", "training", "inference", "feature store", "pipeline"],
      "Sales Ops": ["sales", "lead", "pipeline", "quota", "contract", "negotiation", "close"]
    };

    let bestMatch = { name: "Unknown", confidence: 0 };

    for (const [lens, keywords] of Object.entries(lensKeywords)) {
      const matches = keywords.filter(kw => text.includes(kw)).length;
      const confidence = Math.min(matches / keywords.length, 1.0);

      if (confidence > bestMatch.confidence) {
        bestMatch = { name: lens, confidence };
      }
    }

    return bestMatch;
  }

  /**
   * Analyze historical failures/incidents to spot patterns suggesting missing lens
   */
  private async analyzeFailurePatterns(): Promise<IncidentPattern[]> {
    const patterns: IncidentPattern[] = [];

    // Check if incident log exists
    const incidentLogPath = join(this.rootDir, 'state', 'incidents.jsonl');
    if (!existsSync(incidentLogPath)) {
      logInfo('No incident log found, skipping failure pattern analysis');
      return patterns;
    }

    const incidents = this.loadIncidents(incidentLogPath);

    // Pattern 1: Production outages (suggests DevOps/SRE lens missing)
    const prodOutages = incidents.filter(i => i.type === 'production_outage' || i.type === 'downtime');
    if (prodOutages.length >= 3) {
      patterns.push({
        type: 'production_outage',
        count: prodOutages.length,
        examples: prodOutages.slice(0, 3).map(i => i.description),
        suggestedLens: 'DevOps/SRE',
        priority: 'CRITICAL'
      });
    }

    // Pattern 2: Customer churn due to cost (suggests CFO lens missing)
    const costChurn = incidents.filter(i =>
      i.type === 'customer_churn' && (i.reason?.includes('expensive') || i.reason?.includes('cost'))
    );
    if (costChurn.length >= 2) {
      patterns.push({
        type: 'customer_churn',
        count: costChurn.length,
        examples: costChurn.slice(0, 3).map(i => i.description),
        suggestedLens: 'CFO/Unit Economics',
        priority: 'HIGH'
      });
    }

    // Pattern 3: Security incidents (suggests Security lens missing)
    const securityIncidents = incidents.filter(i => i.type === 'security_incident' || i.type === 'vulnerability');
    if (securityIncidents.length >= 1) {
      patterns.push({
        type: 'security_issue',
        count: securityIncidents.length,
        examples: securityIncidents.slice(0, 3).map(i => i.description),
        suggestedLens: 'Security',
        priority: 'CRITICAL'
      });
    }

    // Pattern 4: Performance issues at scale (suggests CTO lens missing)
    const scaleIssues = incidents.filter(i =>
      i.type === 'performance_degradation' && (i.description?.includes('scale') || i.description?.includes('slow'))
    );
    if (scaleIssues.length >= 2) {
      patterns.push({
        type: 'performance_at_scale',
        count: scaleIssues.length,
        examples: scaleIssues.slice(0, 3).map(i => i.description),
        suggestedLens: 'CTO/Scalability',
        priority: 'HIGH'
      });
    }

    return patterns;
  }

  /**
   * Load incidents from JSONL log
   */
  private loadIncidents(path: string): any[] {
    try {
      const content = readFileSync(path, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      logWarning(`Failed to load incidents: ${error}`);
      return [];
    }
  }

  /**
   * Synthesize proposals for new lenses based on evidence
   */
  private synthesizeProposals(
    misfits: TaskLensMismatch[],
    patterns: IncidentPattern[]
  ): LensGapReport['proposedLenses'] {
    const proposalMap: Record<string, { count: number; evidence: string[]; priority: string }> = {};

    // Evidence from misfit tasks
    for (const misfit of misfits) {
      if (misfit.suggestedNewLens && misfit.confidence > 0.3) {
        if (!proposalMap[misfit.suggestedNewLens]) {
          proposalMap[misfit.suggestedNewLens] = { count: 0, evidence: [], priority: 'MEDIUM' };
        }
        proposalMap[misfit.suggestedNewLens].count++;
        proposalMap[misfit.suggestedNewLens].evidence.push(
          `Task ${misfit.taskId} scored ${misfit.bestLensScore}/100 (${misfit.reason})`
        );
      }
    }

    // Evidence from failure patterns
    for (const pattern of patterns) {
      if (!proposalMap[pattern.suggestedLens]) {
        proposalMap[pattern.suggestedLens] = { count: 0, evidence: [], priority: pattern.priority };
      }
      proposalMap[pattern.suggestedLens].count += pattern.count;
      proposalMap[pattern.suggestedLens].evidence.push(
        `${pattern.count} ${pattern.type} incidents: ${pattern.examples.join('; ')}`
      );
      // Upgrade priority if failure patterns are critical
      if (pattern.priority === 'CRITICAL') {
        proposalMap[pattern.suggestedLens].priority = 'CRITICAL';
      }
    }

    // Convert to proposals array
    const proposals: LensGapReport['proposedLenses'] = [];
    for (const [name, data] of Object.entries(proposalMap)) {
      proposals.push({
        name,
        justification: `${data.count} instances of tasks/incidents requiring this perspective`,
        priority: data.priority as any,
        evidence: data.evidence
      });
    }

    // Sort by priority (CRITICAL > HIGH > MEDIUM > LOW)
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    proposals.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return proposals;
  }

  /**
   * Generate recommendation for human review
   */
  private generateRecommendation(proposals: LensGapReport['proposedLenses']): string {
    if (proposals.length === 0) {
      return '✅ No significant gaps detected in current 7-lens framework.';
    }

    const critical = proposals.filter(p => p.priority === 'CRITICAL');
    const high = proposals.filter(p => p.priority === 'HIGH');

    let recommendation = `⚠️ Detected ${proposals.length} potential gap(s) in decision framework:\n\n`;

    if (critical.length > 0) {
      recommendation += `**CRITICAL** (immediate action required):\n`;
      critical.forEach(p => {
        recommendation += `  • ${p.name}: ${p.justification}\n`;
      });
      recommendation += '\n';
    }

    if (high.length > 0) {
      recommendation += `**HIGH PRIORITY** (address soon):\n`;
      high.forEach(p => {
        recommendation += `  • ${p.name}: ${p.justification}\n`;
      });
      recommendation += '\n';
    }

    recommendation += `**Recommendation**: Expand from 7-lens to ${7 + critical.length + high.length}-lens framework by adding these perspectives.\n\n`;
    recommendation += `**Next steps**:\n`;
    recommendation += `1. Review evidence in state/analytics/lens_gap_report.json\n`;
    recommendation += `2. Approve/reject each proposed lens\n`;
    recommendation += `3. If approved, orchestrator will auto-generate lens specification and update code\n`;

    return recommendation;
  }

  /**
   * Save gap report to analytics directory
   */
  private saveGapReport(report: LensGapReport): void {
    const reportPath = join(this.rootDir, 'state', 'analytics', 'lens_gap_report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    logInfo(`Lens gap report saved to ${reportPath}`);
  }

  /**
   * Check if we should expand framework (called periodically by orchestrator)
   */
  async shouldExpandFramework(tasks: Task[]): Promise<boolean> {
    const report = await this.detectGaps(tasks);
    const criticalGaps = report.proposedLenses.filter(p => p.priority === 'CRITICAL');

    if (criticalGaps.length > 0) {
      logWarning(`⚠️ CRITICAL GAPS detected in decision framework: ${criticalGaps.map(g => g.name).join(', ')}`);
      return true;
    }

    return false;
  }
}

/**
 * Standalone execution for testing
 */
if (require.main === module) {
  (async () => {
    const detector = new LensGapDetector();

    // Example: Test with tasks that should trigger gap detection
    const exampleTasks: Task[] = [
      {
        id: 'T-OPS-1',
        title: 'Set up Datadog monitoring with PagerDuty alerts',
        description: 'Configure monitoring for production uptime, alert on-call engineer if downtime >5 minutes',
        status: 'pending'
      },
      {
        id: 'T-FIN-1',
        title: 'Calculate unit economics per tenant',
        description: 'Compute COGS (compute + storage + API costs) per tenant, compare to MRR to validate gross margin ≥70%',
        status: 'pending'
      },
      {
        id: 'T-SCALE-1',
        title: 'Database sharding strategy for 1000+ tenants',
        description: 'Postgres single instance won\'t scale beyond 100 tenants. Design sharding strategy.',
        status: 'pending'
      },
      {
        id: 'T-CS-1',
        title: 'Build customer health score dashboard',
        description: 'Track usage, value realization, churn risk. Alert CSM if customer red/yellow.',
        status: 'pending'
      }
    ];

    const report = await detector.detectGaps(exampleTasks);
    console.log(JSON.stringify(report, null, 2));
  })();
}
