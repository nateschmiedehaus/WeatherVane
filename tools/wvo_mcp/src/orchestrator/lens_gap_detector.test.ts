/**
 * Lens Gap Detector Tests
 *
 * Tests the meta-cognitive system that detects gaps in the orchestrator's decision framework.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LensGapDetector } from './lens_gap_detector.js';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('LensGapDetector', () => {
  let tempDir: string;
  let detector: LensGapDetector;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = mkdtempSync(join(tmpdir(), 'lens-gap-test-'));
    // Create state/analytics directory
    const analyticsDir = join(tempDir, 'state', 'analytics');
    mkdirSync(analyticsDir, { recursive: true });

    detector = new LensGapDetector(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Task Misfit Detection', () => {
    it('should detect DevOps/SRE lens missing for monitoring tasks', async () => {
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Set up Datadog monitoring with PagerDuty alerts',
          description: 'Configure monitoring for production uptime, alert on-call engineer if downtime >5 minutes, set up SLA tracking',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      expect(report.misfitTasks.length).toBeGreaterThan(0);

      const opsTask = report.misfitTasks.find(m => m.taskId === 'T-OPS-1');
      expect(opsTask).toBeDefined();
      expect(opsTask?.bestLensScore).toBeLessThan(60);
      expect(opsTask?.reason).toContain('DevOps/SRE');
      expect(opsTask?.suggestedNewLens).toMatch(/DevOps/i);
    });

    it('should detect CFO lens missing for unit economics tasks', async () => {
      const tasks = [
        {
          id: 'T-FIN-1',
          title: 'Calculate unit economics per tenant',
          description: 'Compute COGS (compute + storage + API costs) per tenant, compare to MRR to validate gross margin ≥70%, CAC payback analysis',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const finTask = report.misfitTasks.find(m => m.taskId === 'T-FIN-1');
      expect(finTask).toBeDefined();
      expect(finTask?.reason).toContain('CFO');
      expect(finTask?.suggestedNewLens).toMatch(/CFO|Unit Economics/i);
    });

    it('should detect CTO lens missing for scalability tasks', async () => {
      const tasks = [
        {
          id: 'T-SCALE-1',
          title: 'Database sharding strategy for 1000+ tenants',
          description: 'Postgres single instance won\'t scale beyond 100 tenants. Design sharding strategy, implement connection pooling, plan for multi-tenant isolation.',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const scaleTask = report.misfitTasks.find(m => m.taskId === 'T-SCALE-1');
      expect(scaleTask).toBeDefined();
      expect(scaleTask?.reason).toContain('CTO');
      expect(scaleTask?.suggestedNewLens).toMatch(/CTO|Scalability/i);
    });

    it('should detect Customer Success lens missing for retention tasks', async () => {
      const tasks = [
        {
          id: 'T-CS-1',
          title: 'Build customer health score dashboard',
          description: 'Track usage patterns, value realization metrics, churn risk indicators. Alert CSM if customer status is red/yellow. Monitor onboarding completion rate.',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const csTask = report.misfitTasks.find(m => m.taskId === 'T-CS-1');
      expect(csTask).toBeDefined();
      expect(csTask?.reason).toContain('Customer Success');
      expect(csTask?.suggestedNewLens).toMatch(/Customer Success/i);
    });

    it('should detect Legal lens missing for compliance tasks', async () => {
      const tasks = [
        {
          id: 'T-LEGAL-1',
          title: 'Implement GDPR data deletion workflow',
          description: 'User requests right to deletion per GDPR requirements, must delete within 30 days, update privacy policy, document subprocessors',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const legalTask = report.misfitTasks.find(m => m.taskId === 'T-LEGAL-1');
      expect(legalTask).toBeDefined();
      expect(legalTask?.reason).toContain('Legal');
      expect(legalTask?.suggestedNewLens).toMatch(/Legal|Compliance/i);
    });

    it('should not flag tasks that fit existing lenses well', async () => {
      const tasks = [
        {
          id: 'T-GOOD-1',
          title: 'Build demo for revenue generation',
          description: 'Create working demo for prospect meetings, critical for closing deals',
          status: 'pending',
          dependencies: [],
          exit_criteria: ['Demo works', 'Prospects can test'],
          estimated_hours: 4
        }
      ];

      const report = await detector.detectGaps(tasks);

      // This task should pass CEO lens and other relevant lenses
      const goodTask = report.misfitTasks.find(m => m.taskId === 'T-GOOD-1');
      expect(goodTask).toBeUndefined();
    });
  });

  describe('Failure Pattern Analysis', () => {
    it('should detect DevOps lens needed from production outages', async () => {
      // Create incident log with production outages
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'production_outage', description: 'Database crashed at 2am, no monitoring caught it', timestamp: '2025-10-01T02:00:00Z' },
        { type: 'downtime', description: 'API server down for 3 hours', timestamp: '2025-10-05T14:00:00Z' },
        { type: 'production_outage', description: 'Disk full, no alerts fired', timestamp: '2025-10-10T03:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps([]);

      expect(report.failurePatterns.length).toBeGreaterThan(0);

      const opsPattern = report.failurePatterns.find(p => p.suggestedLens === 'DevOps/SRE');
      expect(opsPattern).toBeDefined();
      expect(opsPattern?.count).toBeGreaterThanOrEqual(3);
      expect(opsPattern?.priority).toBe('CRITICAL');
    });

    it('should detect CFO lens needed from cost-related churn', async () => {
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'customer_churn', reason: 'too expensive', description: 'Customer cancelled citing high costs', timestamp: '2025-10-01T00:00:00Z' },
        { type: 'customer_churn', reason: 'expensive compared to alternatives', description: 'Price was main objection', timestamp: '2025-10-05T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps([]);

      const cfoPattern = report.failurePatterns.find(p => p.suggestedLens === 'CFO/Unit Economics');
      expect(cfoPattern).toBeDefined();
      expect(cfoPattern?.priority).toBe('HIGH');
    });

    it('should detect Security lens needed from security incidents', async () => {
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'security_incident', description: 'API key leaked in GitHub repo', timestamp: '2025-10-01T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps([]);

      const securityPattern = report.failurePatterns.find(p => p.suggestedLens === 'Security');
      expect(securityPattern).toBeDefined();
      expect(securityPattern?.priority).toBe('CRITICAL');
    });

    it('should handle missing incident log gracefully', async () => {
      // No incident log created
      const report = await detector.detectGaps([]);

      expect(report.failurePatterns).toHaveLength(0);
    });
  });

  describe('Proposal Synthesis', () => {
    it('should propose new lenses based on combined evidence', async () => {
      // Create tasks and incidents that both suggest DevOps lens
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Set up monitoring',
          description: 'Production monitoring with alerts and SLA tracking',
          status: 'pending'
        },
        {
          id: 'T-OPS-2',
          title: 'Implement deployment pipeline',
          description: 'Blue-green deployment with rollback capability',
          status: 'pending'
        }
      ];

      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'production_outage', description: 'System down', timestamp: '2025-10-01T00:00:00Z' },
        { type: 'production_outage', description: 'Database crashed', timestamp: '2025-10-05T00:00:00Z' },
        { type: 'production_outage', description: 'API unreachable', timestamp: '2025-10-10T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps(tasks);

      expect(report.proposedLenses.length).toBeGreaterThan(0);

      const opsProposal = report.proposedLenses.find(p => p.name.includes('DevOps') || p.name.includes('SRE'));
      expect(opsProposal).toBeDefined();
      expect(opsProposal?.priority).toBe('CRITICAL');
      expect(opsProposal?.evidence.length).toBeGreaterThan(0);
    });

    it('should prioritize CRITICAL over HIGH over MEDIUM', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Set up monitoring and alerts',
          description: 'Production uptime monitoring with incident response',
          status: 'pending'
        },
        {
          id: 'T2',
          title: 'Analyze customer churn',
          description: 'Track retention metrics and usage patterns',
          status: 'pending'
        }
      ];

      // DevOps incident (CRITICAL)
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'production_outage', description: 'Critical system failure', timestamp: '2025-10-01T00:00:00Z' },
        { type: 'production_outage', description: 'Another outage', timestamp: '2025-10-05T00:00:00Z' },
        { type: 'production_outage', description: 'Third outage', timestamp: '2025-10-10T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps(tasks);

      // First proposal should be CRITICAL (DevOps)
      expect(report.proposedLenses[0]?.priority).toBe('CRITICAL');
    });
  });

  describe('Recommendation Generation', () => {
    it('should return no-action message when no gaps detected', async () => {
      const report = await detector.detectGaps([]);

      expect(report.recommendation).toContain('No significant gaps');
    });

    it('should provide actionable recommendation when gaps detected', async () => {
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Set up monitoring',
          description: 'Production monitoring and alerts',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      expect(report.recommendation).toContain('gap');
      expect(report.recommendation).toContain('Next steps');
    });

    it('should mention expansion from 7-lens framework', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Setup monitoring',
          description: 'Monitoring with SLA tracking',
          status: 'pending'
        },
        {
          id: 'T2',
          title: 'Calculate unit economics',
          description: 'COGS analysis per tenant',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      if (report.proposedLenses.length > 0) {
        expect(report.recommendation).toMatch(/7-lens.*to.*\d+-lens/);
      }
    });
  });

  describe('shouldExpandFramework', () => {
    it('should return true for CRITICAL gaps', async () => {
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Production monitoring setup',
          description: 'Set up monitoring with alerts for uptime and SLA tracking',
          status: 'pending'
        }
      ];

      // Add critical incident
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'production_outage', description: 'Critical failure', timestamp: '2025-10-01T00:00:00Z' },
        { type: 'production_outage', description: 'Another failure', timestamp: '2025-10-05T00:00:00Z' },
        { type: 'production_outage', description: 'Third failure', timestamp: '2025-10-10T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const shouldExpand = await detector.shouldExpandFramework(tasks);

      expect(shouldExpand).toBe(true);
    });

    it('should return false when no critical gaps', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Build demo',
          description: 'Revenue-critical demo for customers',
          status: 'pending',
          exit_criteria: ['Demo works'],
          estimated_hours: 4
        }
      ];

      const shouldExpand = await detector.shouldExpandFramework(tasks);

      expect(shouldExpand).toBe(false);
    });
  });

  describe('Report Persistence', () => {
    it('should save gap report to analytics directory', async () => {
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Set up monitoring',
          description: 'Production monitoring',
          status: 'pending'
        }
      ];

      await detector.detectGaps(tasks);

      const reportPath = join(tempDir, 'state', 'analytics', 'lens_gap_report.json');
      const fs = require('fs');
      expect(fs.existsSync(reportPath)).toBe(true);

      const reportContent = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      expect(reportContent.timestamp).toBeDefined();
      expect(reportContent.misfitTasks).toBeDefined();
      expect(reportContent.failurePatterns).toBeDefined();
      expect(reportContent.proposedLenses).toBeDefined();
    });
  });

  describe('Lens Inference', () => {
    it('should infer CFO lens from financial keywords', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Calculate CAC and LTV',
          description: 'Analyze customer acquisition cost vs lifetime value, compute gross margin',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);
      const misfit = report.misfitTasks.find(m => m.taskId === 'T1');

      expect(misfit?.suggestedNewLens).toMatch(/CFO|Unit Economics/i);
      expect(misfit?.confidence).toBeGreaterThan(0);
    });

    it('should infer CTO lens from scalability keywords', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Optimize database performance at scale',
          description: 'Database sharding for multi-tenant architecture',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);
      const misfit = report.misfitTasks.find(m => m.taskId === 'T1');

      expect(misfit?.suggestedNewLens).toMatch(/CTO|Scalability/i);
    });

    it('should have high confidence for strong keyword matches', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'GDPR compliance audit',
          description: 'Ensure GDPR compliance, update privacy policy, implement data deletion',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);
      const misfit = report.misfitTasks.find(m => m.taskId === 'T1');

      expect(misfit?.confidence).toBeGreaterThan(0.3);
    });
  });
});
